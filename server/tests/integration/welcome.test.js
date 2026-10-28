import { describe, it, before, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

/**
 * /v1/welcome and /v1/version/welcome double as an end-to-end keep-alive: one
 * GetItem per call, no Scan, and a 5xx when that read fails.
 */

describe('## Welcome endpoints', () => {
  let app;
  let Revision;
  let versionCtrl;
  let docClient;
  let dynamoClient;
  let sent;
  let restore;

  before(async function () {
    this.timeout(30000);
    await setupDynamoLocal();
    app = (await import('../../../config/express.js')).default;
    Revision = (await import('../../models/dynamo/revision.dynamo.js')).default;
    versionCtrl = (await import('../../controllers/version.controller.js')).default;
    const clients = await import('../../models/dynamo/dynamo-client.js');
    docClient = clients.getDocClient();
    dynamoClient = clients.getDynamoClient();
  });

  beforeEach(async function () {
    this.timeout(15000);
    await clearTable('chronas-revisions');
    await clearTable('chronas-users');
    await seedTable('chronas-users', [
      { _id: 'a@chronas.org', username: 'a' },
      { _id: 'b@chronas.org', username: 'b' }
    ]);
    versionCtrl.resetUserCountCache();

    sent = [];
    const docSend = docClient.send.bind(docClient);
    const dynamoSend = dynamoClient.send.bind(dynamoClient);
    docClient.send = (cmd, ...rest) => { sent.push(cmd.constructor.name); return docSend(cmd, ...rest); };
    dynamoClient.send = (cmd, ...rest) => { sent.push(cmd.constructor.name); return dynamoSend(cmd, ...rest); };
    restore = () => { docClient.send = docSend; dynamoClient.send = dynamoSend; };
  });

  afterEach(() => restore());

  ['/v1/welcome', '/v1/version/welcome'].forEach((url) => {
    it(`GET ${url} returns the last edit and user count without a Scan`, async () => {
      await new Revision({ type: 'PUT', entityId: 'x', resource: 'markers', user: 'u', timestamp: '2026-10-01T00:00:00Z' }).save();
      sent = [];

      const res = await request(app).get(url).expect(200);
      expect(res.body.lastDataEdit).to.equal('2026-10-01T00:00:00Z');
      expect(res.body.user).to.be.a('number');
      expect(res.body).to.include.keys('version', 'commit', 'build');
      expect(sent).to.not.include('ScanCommand');
      expect(sent).to.include('GetCommand');
    });
  });

  it('answers n/a before any revision is recorded', async () => {
    const res = await request(app).get('/v1/welcome').expect(200);
    expect(res.body.lastDataEdit).to.equal('n/a');
  });

  it('reads the database on every call but caches the user count', async () => {
    await request(app).get('/v1/welcome').expect(200);
    sent = [];
    await request(app).get('/v1/welcome').expect(200);
    expect(sent).to.include('GetCommand');
    expect(sent).to.not.include('DescribeTableCommand');
  });

  it('answers 5xx when the last-edit read fails', async () => {
    const original = Revision.lastEdit;
    Revision.lastEdit = async () => { throw Object.assign(new Error('boom'), { name: 'ProvisionedThroughputExceededException' }); };
    try {
      const res = await request(app).get('/v1/welcome');
      expect(res.status).to.be.at.least(500);
      expect(res.body.message).to.not.include('boom');
    } finally {
      Revision.lastEdit = original;
    }
  });

  it('still answers 200 when the user count fails', async () => {
    const original = dynamoClient.send;
    dynamoClient.send = (cmd, ...rest) => (cmd.constructor.name === 'DescribeTableCommand'
      ? Promise.reject(new Error('describe failed'))
      : original(cmd, ...rest));
    try {
      const res = await request(app).get('/v1/welcome').expect(200);
      expect(res.body.user).to.equal(0);
    } finally {
      dynamoClient.send = original;
    }
  });
});
