import { describe, it, before, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { S3Client } from '@aws-sdk/client-s3';

import { log5xxResponses, routeTemplate } from '../../../config/http-5xx-log.js';
import { areaCache } from '../../models/dynamo/area.dynamo.js';

/**
 * How the app answers when a request fails: one `http5xx` log line per 5xx
 * response, database errors as 5xx instead of 404, no unhandled rejections
 * (one would end the process that every concurrent request of a Web Function
 * environment shares), and no internal names in error bodies. These tests use
 * a fake DynamoDB client, so they don't touch the shared dynalite tables.
 */

const ADMIN = jwt.sign({ id: 'admin@chronas.org', username: 'admin', privilege: 5 }, process.env.JWT_SECRET, { algorithm: 'HS256' });

function awsError(name, message = name) {
  return Object.assign(new Error(message), { name, $fault: 'client', $metadata: { httpStatusCode: 400, requestId: 'aws-req-1' } });
}

function fakeDocClient(handle) {
  return { send: async command => handle(command.constructor.name, command.input) };
}

// Collects console.error calls and unhandled rejections during a test.
function captureFailures() {
  const captured = { errors: [], rejections: [] };
  const original = console.error;
  const onRejection = reason => captured.rejections.push(reason);
  console.error = (...args) => captured.errors.push(args.length === 1 ? args[0] : args);
  process.on('unhandledRejection', onRejection);
  captured.restore = () => {
    console.error = original;
    process.off('unhandledRejection', onRejection);
  };
  return captured;
}

const lines = (captured, msg) => captured.errors.filter(e => e && e.msg === msg);
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

describe('## Request failures', () => {
  describe('# one http5xx line per 5xx response', () => {
    let captured;
    beforeEach(() => { captured = captureFailures(); });
    afterEach(() => captured.restore());

    function createApp() {
      const app = express();
      app.set('trust proxy', 2);
      app.use(log5xxResponses());
      const items = express.Router();
      items.param('itemId', (req, res, next, id) => (id === 'param-fails' ? next(new Error('param failed')) : next()));
      items.get('/:itemId', (req, res, next) => {
        if (req.params.itemId === 'missing') return res.status(404).json({ message: 'Not Found' });
        if (req.params.itemId === 'next-error') return next(new Error('boom'));
        return res.status(500).send('direct');
      });
      items.get('/', (req, res) => res.status(503).json({}));
      const v1 = express.Router();
      v1.use('/items', items);
      app.use('/v1', v1);
      app.use((err, req, res, _next) => res.status(500).json({ message: 'Internal Server Error' }));
      return app;
    }

    it('logs a 500 the handler sent itself, with the route template', async () => {
      await request(createApp()).get('/v1/items/someone@example.com')
        .set('lambda-web-request-id', 'REQ1').set('x-forwarded-for', '203.0.113.9, 198.51.100.1').expect(500);
      expect(captured.errors).to.have.length(1);
      const [line] = captured.errors;
      expect(line).to.include({ msg: 'http5xx', method: 'GET', route: '/v1/items/:itemId', status: 500, requestId: 'REQ1' });
      expect(line.durationMs).to.be.a('number');
      // Template, not the path; no IP.
      expect(JSON.stringify(line)).to.not.contain('someone@example.com').and.not.contain('203.0.113.9');
    });

    it('logs errors passed to next() with the full template once', async () => {
      const app = createApp();
      await request(app).get('/v1/items/next-error').expect(500);
      await request(app).get('/v1/items/param-fails').expect(500);
      await request(app).get('/v1/items/').expect(503);
      expect(captured.errors.map(e => [e.route, e.status])).to.deep.equal([
        ['/v1/items/:itemId', 500], ['/v1/items/:itemId', 500], ['/v1/items', 503]
      ]);
    });

    it('logs nothing for a 404', async () => {
      await request(createApp()).get('/v1/items/missing').expect(404);
      await request(createApp()).get('/v1/unknown').expect(404);
      expect(captured.errors).to.have.length(0);
    });

    it('routeTemplate is null when no route matched', () => {
      expect(routeTemplate({ originalUrl: '/x' })).to.equal(null);
    });
  });

  describe('# the API', () => {
    let app;
    let captured;
    let savedClient;

    before(async () => {
      app = (await import('../../../config/express.js')).default;
    });

    beforeEach(() => {
      savedClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
      areaCache.clear();
      captured = captureFailures();
    });

    afterEach(() => {
      captured.restore();
      globalThis.__TEST_DYNAMO_DOC_CLIENT = savedClient;
      areaCache.clear();
    });

    const throttled = () => fakeDocClient(() => { throw awsError('ThrottlingException', 'Rate of requests exceeds the allowed throughput.'); });
    const empty = () => fakeDocClient(name => (name === 'GetCommand' ? {} : { Items: [], Responses: {} }));

    for (const path of ['/v1/areas/1000', '/v1/markers/e_Some_Marker', '/v1/metadata/religion', '/v1/metadata/a_ruler_FRA']) {
      it(`GET ${path}: a DynamoDB throttle is a 500, not a 404`, async () => {
        globalThis.__TEST_DYNAMO_DOC_CLIENT = throttled();
        const res = await request(app).get(path).expect(500);
        expect(res.headers['cache-control']).to.equal('no-store');
        expect(JSON.stringify(res.body)).to.not.contain('ThrottlingException');
        expect(lines(captured, 'http5xx')).to.have.length(1);
      });
    }

    it('a missing item is still a 404 (or the empty a_ placeholder) and logs nothing', async () => {
      globalThis.__TEST_DYNAMO_DOC_CLIENT = empty();
      await request(app).get('/v1/areas/1000').expect(404);
      await request(app).get('/v1/markers/e_Some_Marker').expect(404);
      await request(app).get('/v1/metadata/religion').expect(404);
      const placeholder = await request(app).get('/v1/metadata/a_ruler_FRA').expect(200);
      expect(placeholder.body).to.deep.equal({ _id: 'a_ruler_FRA', data: { influence: [] } });
      expect(captured.errors).to.have.length(0);
    });

    it('an id longer than a DynamoDB key can be is a 404 without a database call', async () => {
      let calls = 0;
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fakeDocClient(() => {
        calls += 1;
        throw awsError('ValidationException', 'Hash primary key values must be under 2048 bytes');
      });
      const id = 'x'.repeat(2100);
      await request(app).get(`/v1/areas/${id}`).expect(404);
      await request(app).get(`/v1/markers/${id}`).expect(404);
      await request(app).get(`/v1/metadata/${id}`).expect(404);
      expect(calls).to.equal(0);
      expect(captured.errors).to.have.length(0);
    });

    it('getLinked: a failing marker read answers 500 without an unhandled rejection', async () => {
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fakeDocClient((name, input) => {
        if (name === 'GetCommand') return { Item: { entityRef: '1:e_Some_Event', markers: [['m_1', 'a']], metadata: [] } };
        if (name === 'BatchGetCommand' && input.RequestItems['chronas-markers']) throw awsError('ThrottlingException');
        return { Items: [], Responses: {} };
      });
      await request(app).get('/v1/metadata/culture/getLinked?source=1:e_Some_Event').expect(500);
      await settle();
      expect(captured.rejections).to.have.length(0);
      expect(lines(captured, 'http5xx')).to.have.length(1);
    });

    it('the area aggregation endpoints are retired (410, no login needed)', async () => {
      for (const path of ['aggregateMetaCoo', 'aggregateProvinces', 'aggregateDimension?dimension=ruler']) {
        const res = await request(app).get(`/v1/areas/${path}`).expect(410);
        expect(res.body.message).to.equal('The area aggregation API has been retired.');
      }
      await request(app).post('/v1/areas/aggregateMetaCoo').expect(410);
      await settle();
      expect(captured.rejections).to.have.length(0);
    });

    it('PUT /v1/areas rejects a body without a provinces array', async () => {
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fakeDocClient(() => ({ Item: { _id: '1000', year: 1000, data: { Kiev: ['A', 'b', 'c', 'D', 1] } } }));
      for (const provinces of [undefined, 'Kiev', [1]]) {
        const res = await request(app).put('/v1/areas').set('Authorization', `Bearer ${ADMIN}`)
          .send({ start: 1000, end: 1001, provinces, religion: 'orthodox' })
          .expect(400);
        expect(res.body.message).to.equal('provinces must be an array of province names');
      }
      await settle();
      expect(captured.rejections).to.have.length(0);
    });

    it('PUT /v1/areas: a failing year read answers 500 without an unhandled rejection', async () => {
      globalThis.__TEST_DYNAMO_DOC_CLIENT = throttled();
      await request(app).put('/v1/areas').set('Authorization', `Bearer ${ADMIN}`)
        .send({ start: 1000, end: 1001, provinces: ['Kiev'], religion: 'orthodox' })
        .expect(500);
      await settle();
      expect(captured.rejections).to.have.length(0);
    });

    describe('/v1/statistics', () => {
      let savedSend;
      beforeEach(() => { savedSend = Object.getOwnPropertyDescriptor(S3Client.prototype, 'send'); });
      afterEach(() => {
        if (savedSend) Object.defineProperty(S3Client.prototype, 'send', savedSend);
        else delete S3Client.prototype.send;
      });

      it('a missing statistics.json is a 404 and logs nothing', async () => {
        S3Client.prototype.send = async () => { throw awsError('NoSuchKey', 'The specified key does not exist.'); };
        const res = await request(app).get('/v1/statistics').expect(404);
        expect(res.body).to.deep.equal({ message: 'Statistics have not been computed yet' });
        expect(captured.errors).to.have.length(0);
      });

      it('an S3 failure is a 503 with one log line and no bucket or key in the body', async () => {
        S3Client.prototype.send = async () => { throw awsError('AccessDenied', 'Access Denied'); };
        const res = await request(app).get('/v1/statistics').expect(503);
        expect(res.body).to.deep.equal({ message: 'Statistics are unavailable, try again later' });
        expect(JSON.stringify(res.body)).to.not.match(/chronas|statistics\.json|AccessDenied/);
        expect(lines(captured, 'statisticsReadFailed')).to.have.length(1);
        expect(lines(captured, 'statisticsReadFailed')[0]).to.include({ name: 'AccessDenied' });
        expect(lines(captured, 'http5xx')).to.have.length(1);
      });
    });
  });
});
