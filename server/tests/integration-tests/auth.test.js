import request from 'supertest-as-promised';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { expect, config as chaiConfig } from 'chai';

import app from '../helpers/test-app.js';
import { config } from '../../../config/config.js';
import { setupTestDatabase, teardownTestDatabase, clearTestDatabase } from '../helpers/mongodb-memory.js';
import User from '../../models/user.model.js';

chaiConfig.includeStack = true;

describe('## Auth APIs', () => {
  before(async function () {
    this.timeout(30000);
    await setupTestDatabase();
    console.log('📋 In-memory database ready for auth tests');
  });

  after(async function () {
    this.timeout(10000);
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // Pre-hash the password since User model has no pre-save hook
    const hashedPassword = await bcrypt.hash('asdf', 10);

    // Create test user with known credentials
    const testUser = new User({
      _id: 'test@test.de',
      username: 'doubtful_throne',
      email: 'test@test.de',
      password: hashedPassword,
      privilege: 1,
      loginCount: 0,
      karma: 1
    });
    await testUser.save();
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
      // First signup
      request(app)
        .post('/v1/auth/signup')
        .send(validSignUserCredentials)
        .expect(httpStatus.OK)
        .then(() => {
          // Second signup with same email should fail
          request(app)
            .post('/v1/auth/signup')
            .send(validSignUserCredentials)
            .expect(httpStatus.BAD_REQUEST)
            .then((res) => {
              const errorText = res.body.stack || res.body.message || '';
              expect(errorText).to.contain('already exist');
              done();
            })
            .catch(done);
        })
        .catch(done);
    });
  });
});
