import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';

import { loadSecrets, runtimeName } from '../../../config/bootstrap.js';
import { createRequestMetrics, NAMESPACE } from '../../../config/request-metrics.js';

/**
 * Startup shared by the Event Function and the Web Function: the JWT secret
 * comes from Secrets Manager and wins over the environment, and both runtimes
 * emit the same latency metric.
 */

const ENV_KEYS = ['JWT_SECRET', 'AWS_LAMBDA_HTTP_ENDPOINT', 'AWS_LAMBDA_FUNCTION_NAME'];

describe('## Bootstrap', () => {
  let saved;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe('# loadSecrets', () => {
    const secretDocument = JSON.stringify({ JWT_SECRET: 'from-secrets-manager', MAILGUN_KEY: 'unused' });
    const failing = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };

    it('the Secrets Manager value wins over the environment', async () => {
      process.env.JWT_SECRET = 'from-environment';
      const source = await loadSecrets({ secretId: '/chronas/secrets', send: async () => ({ SecretString: secretDocument }) });
      expect(source).to.equal('secrets-manager');
      expect(process.env.JWT_SECRET).to.equal('from-secrets-manager');
    });

    it('copies only the JWT secret into the environment', async () => {
      delete process.env.MAILGUN_KEY;
      await loadSecrets({ secretId: '/chronas/secrets', send: async () => ({ SecretString: secretDocument }) });
      expect(process.env.MAILGUN_KEY).to.equal(undefined);
    });

    it('without SECRET_CONFIG_NAME it keeps the environment', async () => {
      process.env.JWT_SECRET = 'from-environment';
      expect(await loadSecrets({ secretId: '' })).to.equal('environment');
      expect(process.env.JWT_SECRET).to.equal('from-environment');
    });

    it('the Event Function falls back to an environment secret when the read fails', async () => {
      delete process.env.AWS_LAMBDA_HTTP_ENDPOINT;
      process.env.JWT_SECRET = 'from-environment';
      expect(await loadSecrets({ secretId: '/chronas/secrets', send: failing })).to.equal('environment');
    });

    it('fails when the read fails and there is no environment secret', async () => {
      delete process.env.JWT_SECRET;
      const error = await loadSecrets({ secretId: '/chronas/secrets', send: failing }).catch(e => e);
      expect(error).to.be.an('error');
    });

    it('the Web Function never falls back to the environment', async () => {
      process.env.AWS_LAMBDA_HTTP_ENDPOINT = '127.0.0.1:9001';
      process.env.JWT_SECRET = 'from-environment';
      const error = await loadSecrets({ secretId: '/chronas/secrets', send: failing }).catch(e => e);
      expect(error).to.be.an('error');
    });
  });

  describe('# runtimeName', () => {
    it('detects the runtime from the environment', () => {
      delete process.env.AWS_LAMBDA_HTTP_ENDPOINT;
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      expect(runtimeName()).to.equal('local');
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'fn';
      expect(runtimeName()).to.equal('event');
      process.env.AWS_LAMBDA_HTTP_ENDPOINT = '127.0.0.1:9001';
      expect(runtimeName()).to.equal('web');
    });
  });

  describe('# request metrics (EMF)', () => {
    function appWithMetrics(lines) {
      const app = express();
      app.use(createRequestMetrics({ runtime: 'web', version: 'abc1234', write: line => lines.push(line) }));
      const areas = express.Router();
      areas.get('/:areaId', (req, res) => res.json({}));
      app.use('/v1/areas', areas);
      return app;
    }

    it('writes one EMF line per request, with Runtime and Version as the only dimensions', async () => {
      const lines = [];
      await request(appWithMetrics(lines)).get('/v1/areas/1500?x=1');
      expect(lines).to.have.length(1);
      expect(lines[0].endsWith('\n')).to.equal(true);

      const event = JSON.parse(lines[0]);
      const [definition] = event._aws.CloudWatchMetrics;
      expect(definition.Namespace).to.equal(NAMESPACE);
      expect(definition.Dimensions).to.deep.equal([['Runtime', 'Version']]);
      expect(definition.Metrics).to.deep.equal([{ Name: 'LatencyMs', Unit: 'Milliseconds' }]);
      expect(event).to.include({ Runtime: 'web', Version: 'abc1234', Route: '/v1/areas/:areaId', Method: 'GET', Status: 200 });
      expect(event.LatencyMs).to.be.a('number');
    });

    it('never puts the raw path in the Route field', async () => {
      const lines = [];
      await request(appWithMetrics(lines)).get('/v1/no/such/path');
      expect(JSON.parse(lines[0])).to.include({ Route: 'unmatched', Status: 404 });
    });
  });
});
