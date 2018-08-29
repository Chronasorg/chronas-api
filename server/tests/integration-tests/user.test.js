import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../../index'
import mongoUnit from 'mongo-unit'

// https://www.toptal.com/nodejs/integration-and-e2e-tests-nodejs-mongodb



chai.config.includeStack = true

describe('## Misc', () => {

  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')

  beforeEach(() => mongoUnit.initDb(testMongoUrl, testData))
  afterEach(() => mongoUnit.drop())
 
  
  describe('# GET /v1/health', () => {
    it('should return OK', (done) => {
      request(app)
        .get('/v1/health')
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.text).to.equal('OK')
          done()
        })
        .catch(done)
    })
  })

  describe('# GET /v1/404', () => {
    it('should return 404 status', (done) => {
      request(app)
        .get('/v1/404')
        .expect(httpStatus.NOT_FOUND)
        .then((res) => {
          expect(res.body.message).to.equal('Not Found')
          done()
        })
        .catch(done)
    })
  })

  describe('# Error Handling', () => {

    it('should handle 404', (done) => {
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
})
