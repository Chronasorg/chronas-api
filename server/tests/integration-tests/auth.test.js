import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import request from 'supertest-as-promised';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import chai from 'chai';

import app from '../helpers/test-app.js';
import { config } from '../../../config/config.js';
import { setupMockDatabase, teardownMockDatabase, clearMockDatabase, populateMockData } from '../helpers/mock-database.js';
const { expect } = chai;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

chai.config.includeStack = true;

describe('## Auth APIs', () => {
  const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData-modern.json'), 'utf8'));

  before(async function () {
    this.timeout(10000);
    await setupMockDatabase();
    await populateMockData(testData);
    console.log('📋 Mock database ready for auth tests');
  });

  after(async function () {
    this.timeout(5000);
    await teardownMockDatabase();
  });

  beforeEach(async () => {
    await clearMockDatabase();
    await populateMockData(testData);
  });

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  };

  const validSignUserCredentials = {
    email: 'testSign@test.de',
    password: 'asdffdsa',
    username: 'sign_user_name'
  };

  const invalidUserCredentials = {
    email: 'react@email.com',
    password: 'IDontKnow'
  };

  describe('# POST /v1/auth/login', () => {
    it('should return Authentication error', (done) => {
      request(app)
        .post('/v1/auth/login')
        .send(invalidUserCredentials)
        .expect(httpStatus.UNAUTHORIZED)
        .then((res) => {
          expect(res.body.message).to.equal('Authentication error');
          done();
        })
        .catch(done);
    });

    it('should get valid JWT token', (done) => {
      request(app)
        .post('/v1/auth/login')
        .send(validUserCredentials)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('token');
          jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
            expect(err).to.not.be.ok; // eslint-disable-line no-unused-expressions
            expect(decoded.username).to.equal('doubtful_throne');
            done();
          });
        })
        .catch(done);
    });
  });

  describe('# POST /v1/auth/signup', () => {
    it('should get valid JWT token for signup', (done) => {
      request(app)
        .post('/v1/auth/signup')
        .send(validSignUserCredentials)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('token');
          jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
            expect(err).to.not.be.ok; // eslint-disable-line no-unused-expressions
            expect(decoded.id).to.equal('testSign@test.de');
            done();
          });
        })
        .catch(done);
    });

    it('should return that User already exist', (done) => {
      request(app)
        .post('/v1/auth/signup')
        .send(validSignUserCredentials)
        .expect(httpStatus.BAD_REQUEST)
        .then((res) => {
          expect(res.body).to.have.property('stack');
          expect(res.body.stack).to.contain('already exist');
          done();
        })
        .catch(done);
    });
  });
});
