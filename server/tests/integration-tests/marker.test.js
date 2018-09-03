import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../..'
import mongoUnit from 'mongo-unit'

chai.config.includeStack = true

describe('## Marker APIs', () => {  

  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  }

  let user = {
    _id : "test@test.de",
    username: 'doubtful-throne',
    privilege: 1
  }

  let jwtToken

  describe('# GET /v1/markers', () => {
    it('should get array of markres', (done) => {
      request(app)
        .get('/v1/markers')
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.be.an('array')
          console.log(res.body)
          expect(res.body[0]).to.have.property('coo')
          expect(res.body[0]).to.have.property('name')
          done()
        })
        .catch(done)
    })

    it('should fail to put markers because of wrong token', (done) => {
      request(app)
        .put('/v1/markers/Mamurra')
        .set('Authorization', 'Bearer inValidToken')
        .expect(httpStatus.UNAUTHORIZED)
        .then((res) => {
          expect(res.body.message).to.equal('Unauthorized')
          done()
        })
        .catch(done)
    })

  })
})
