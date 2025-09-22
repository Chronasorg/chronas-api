import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import jwt from 'jsonwebtoken'
import chai from 'chai'
const { expect } = chai
import app from '../../../index.js'
import { config } from '../../../config/config.js'
import mongoUnit from 'mongo-unit'

chai.config.includeStack = true

describe('## Auth APIs', () => {
  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  }

  const validSignUserCredentials = {
    email: 'testSign@test.de',
    password: 'asdffdsa',
    username: 'signUserName'
  }

  const invalidUserCredentials = {
    email: 'react@email.com',
    password: 'IDontKnow'
  }

  describe('# POST /v1/auth/login', () => {
    it('should return Authentication error', (done) => {
      request(app)
                .post('/v1/auth/login')
                .send(invalidUserCredentials)
                .expect(httpStatus.UNAUTHORIZED)
                .then((res) => {
                  expect(res.body.message).to.equal('Authentication error')
                  done()
                })
                .catch(done)
    })

    it('should get valid JWT token', (done) => {
      request(app)
                .post('/v1/auth/login')
                .send(validUserCredentials)
                .expect(httpStatus.OK)
                .then((res) => {
                  expect(res.body).to.have.property('token')
                  jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
                    expect(err).to.not.be.ok // eslint-disable-line no-unused-expressions
                    expect(decoded.username).to.equal('doubtful-throne')
                    done()
                  })
                })
                .catch(done)
    })
  })

  describe('# POST /v1/auth/signup', () => {
    it('should get valid JWT token for signup', (done) => {
      request(app)
                .post('/v1/auth/signup')
                .send(validSignUserCredentials)
                .expect(httpStatus.OK)
                .then((res) => {
                  expect(res.body).to.have.property('token')
                  jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
                    expect(err).to.not.be.ok // eslint-disable-line no-unused-expressions
                    expect(decoded.id).to.equal('testSign@test.de')
                    done()
                  })
                })
                .catch(done)
    })

    it('should return that User already exist', (done) => {
      request(app)
                .post('/v1/auth/signup')
                .send(validSignUserCredentials)
                .expect(httpStatus.BAD_REQUEST)
                .then((res) => {
                  expect(res.body).to.have.property('stack')
                  expect(res.body.stack).to.contain('already exist')
                  done()
                })
                .catch(done)
    })
  })
})
