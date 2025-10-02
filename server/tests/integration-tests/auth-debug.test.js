import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import request from 'supertest-as-promised';
import httpStatus from 'http-status';
import chai from 'chai';

import app from '../helpers/test-app.js';
import { setupMockDatabase, teardownMockDatabase, clearMockDatabase, populateMockData } from '../helpers/mock-database.js';
const { expect } = chai;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

chai.config.includeStack = true;

describe('## Auth Debug', () => {
  const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData-modern.json'), 'utf8'));

  before(async function () {
    this.timeout(10000);
    await setupMockDatabase();
    await populateMockData(testData);
    console.log('📋 Mock database ready for auth debug');
  });

  after(async function () {
    this.timeout(5000);
    await teardownMockDatabase();
  });

  beforeEach(async () => {
    await clearMockDatabase();
    await populateMockData(testData);
  });

  it('should debug auth login endpoint', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({
        email: 'test@test.de',
        password: 'asdf'
      });

    console.log('Response status:', res.status);
    console.log('Response body:', res.body);
    console.log('Response text:', res.text);

    // Just check that we get some response
    expect(res.status).to.be.a('number');
  });
});
