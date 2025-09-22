import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../../../index.js'
import mongoUnit from 'mongo-unit'

chai.config.includeStack = true

describe('## health', () => {
  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

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
