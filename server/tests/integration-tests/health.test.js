import request from 'supertest';
import httpStatus from 'http-status';
import { expect, config as chaiConfig } from 'chai';

import app from '../helpers/test-app.js';
import { setupMockDatabase, teardownMockDatabase, clearMockDatabase } from '../helpers/mock-database.js';

chaiConfig.includeStack = true;

describe('## health', () => {
  before(async function () {
    this.timeout(10000);
    await setupMockDatabase();
    console.log('📋 Mock database ready for health tests');
  });

  after(async function () {
    this.timeout(5000);
    await teardownMockDatabase();
  });

  beforeEach(async () => {
    await clearMockDatabase();
  });

  it('should return OK', (done) => {
    request(app)
      .get('/v1/health')
      .expect(httpStatus.OK)
      .then((res) => {
        expect(res.text).to.equal('Health OK');
        done();
      })
      .catch(done);
  });

  it('should return 404 status', (done) => {
    request(app)
      .get('/v1/404')
      .expect(httpStatus.NOT_FOUND)
      .then((res) => {
        expect(res.body.message).to.equal('Not Found');
        done();
      })
      .catch(done);
  });
});
