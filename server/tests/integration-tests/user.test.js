import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../..'
import mongoUnit from 'mongo-unit'
import jwt from 'jsonwebtoken'

chai.config.includeStack = true

describe('## User APIs', () => {

  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  }

  let user = {
    username: 'KK123',
    privilege: 10
  }

  let jwtToken

  describe('# POST /v1/auth/login', () => {
    it('should get valid JWT token', (done) => {
      request(app)
        .post('/v1/auth/login')
        .send(validUserCredentials)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('token')
          jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
            expect(err).to.not.be.ok // eslint-disable-line no-unused-expressions
            expect(decoded.username).to.equal(validUserCredentials.username)
            jwtToken = `Bearer ${res.body.token}`
            done()
          })
        })
        .catch(done)
    })
  })

  describe('# POST /v1/users', () => {
    it('should create a new user', (done) => {
      request(app)
        .post('/v1/users')
        .send(user)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal(user.username)
          expect(res.body.privilege).to.equal(user.privilege)
          user = res.body
          done()
        })
        .catch(done)
    })
  })

  describe('# GET /v1/users/', () => {
    it('should get all users', (done) => {
      request(app)
        .get('/v1/users')
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.be.an('array')
          done()
        })
        .catch(done)
    })
  })

  describe('# GET /v1/users/ without token', () => {
    it('should return unauthorized', (done) => {
      request(app)
        .get('/v1/users')
        .expect(httpStatus.UNAUTHORIZED)
        .then((res) => {
          expect(res.body.message).to.equal("Unauthorized")
          done()
        })
        .catch(done)
    })
  })  

  it('should handle if user not exist 404', (done) => {
    request(app)
      .get('/v1/users/56z787zzz67fc')
      .expect(httpStatus.NOT_FOUND)
      .then((res) => {
        expect(res.body.message).to.equal('Not Found')
        done()
      })
      .catch(done)
  })

  it('should handle express validation error - username is required', (done) => {
    request(app)
      .post('/v1/users')
      .send({
        privilege: 'public'
      })
      .expect(httpStatus.BAD_REQUEST)
      .then((res) => {
        expect(res.body.message).to.equal('"username" is required')
        done()
      })
      .catch(done)
  })
})
