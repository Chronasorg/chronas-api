import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../..'
import mongoUnit from 'mongo-unit'
import testData from './fixtures/testData.json'

chai.config.includeStack = true

describe('## version', () => {
  const testMongoUrl = process.env.MONGO_HOST

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

  it('should return OK and have properties version and commit', (done) => {
    request(app)
        .get('/v1/version')
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('version')
          expect(res.body).to.have.property('commit')
          done()
        })
        .catch(done)
  })
})
