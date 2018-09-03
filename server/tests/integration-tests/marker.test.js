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

  let marker = {
    _id: "AuisMarker",
    name: "new Marker",
    wiki: "new%20Marker",
    type: "politician",
    year: 1987,
    coo: [
      12.5,
      41.9
    ]
  }

  let updateMarker = {
    _id: "Mamurra",
    name: "Mamurra",
    wiki: "Mamurra",
    type: "politician",
    year: -91,
    coo: [
      13.616666666667,
      41.266666666667
    ]
  }

  let jwtToken

  describe('# GET /v1/markers', () => {

    it('should get valid JWT token', (done) => {
      request(app)
        .post('/v1/auth/login')
        .send(validUserCredentials)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('token')
          jwtToken = `Bearer ${res.body.token}`
          done()
        })
        .catch(done)
    })

    describe('# POST /v1/markers', () => {
      it('should create a new marker', (done) => {
        request(app)
          .post('/v1/markers')
          .set('Authorization', jwtToken)
          .send(marker)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(marker._id)
            expect(res.body.year).to.equal(marker.year)
            done()
          })
          .catch(done)
      })

      it('should fail to post markers because of missing token', (done) => {
        request(app)
          .post('/v1/markers')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })
    })

    describe('# Get /v1/markers', () => {
      it('should get array of markres', (done) => {
        request(app)
          .get('/v1/markers')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('array')
            expect(res.body[0]).to.have.property('coo')
            expect(res.body[0]).to.have.property('name')
            done()
          })
          .catch(done)
      })

      it('should get specifc marker', (done) => {
        request(app)
          .get('/v1/markers/Mamurra')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal("Mamurra")
            expect(res.body.year).to.equal(-91)
            done()
          })
          .catch(done)
      })
    })

    describe('# Put /v1/markers', () => {

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

      it('should update a marker', (done) => {
        updateMarker.wiki = 'aui'
        console.log(updateMarker)
        request(app)
          .put(`/v1/markers/${updateMarker._id}`)
          .set('Authorization', jwtToken)
          .send(updateMarker)
          .expect(httpStatus.OK)
          .then((res) => {
            console.log(res.body)
            expect(res.body._id).to.equal(updateMarker._id)
            expect(res.body.wiki).to.equal('aui')
            done()
          })
          .catch(done)
      })
    })
  })
})
