import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../..'
import mongoUnit from 'mongo-unit'

chai.config.includeStack = true

describe('## version', () => {

  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')  

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

    it('should return OK', (done) => {
      request(app)
        .get('/v1/version')
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.version).to.equal('1.1.1')
          done()
        })
        .catch(done)
    })
})
