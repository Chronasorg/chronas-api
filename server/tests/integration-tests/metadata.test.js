import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../..'
import mongoUnit from 'mongo-unit'

chai.config.includeStack = true

describe('## Metadata APIs', () => {

  const testMongoUrl = process.env.MONGO_HOST
  const testData = require('./fixtures/testData.json')

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  }

  let metadata = {
      _id: "religion",
      data: "{\"south_arabian\":[\"South Arabian\",\"rgb(153,26,51)\",\"Arabian_mythology\",\"Paganism\"],\"ashurism\":[\"Ashurism\",\"rgb(230,230,230)\",\"Ancient_Mesopotamian_religion\",\"Paganism\"],\"african\":[\"African\",\"rgb(204,5",
      __v: 0,
      score: 0,
      type: "g",
      coo: []

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

  describe('# GET /v1/metadata', () => {

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

    describe('# POST /v1/metadata', () => {
      it('should create a new metadata', (done) => {
        console.log(jwtToken)
        request(app)
          .post('/v1/metadata')
          .set('Authorization', jwtToken)
          .send(metadata)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(metadata._id)
            expect(res.body.year).to.equal(metadata.year)
            done()
          })
          .catch(done)
      })      

      it('should fail to post metadata because of missing token', (done) => {
        request(app)
          .post('/v1/metadata')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })
    })

    describe('# Get /v1/metadata', () => {
      it('should get array of metadata information', (done) => {
        request(app)
          .get('/v1/metadata')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('array')
            expect(res.body[0]).to.have.property('coo')
            expect(res.body[0]).to.have.property('data')
            done()
          })
          .catch(done)
      })

      it('should get specifc metadata information', (done) => {
        request(app)
          .get('/v1/metadata/culture')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal("culture")
            expect(res.body.type).to.equal("g")
            expect(res.body).to.have.property('data')
            done()
          })
          .catch(done)
      })
    })

    // describe('# Put /v1/markers', () => {

    //   it('should fail to put markers because of wrong token', (done) => {
    //     request(app)
    //       .put('/v1/markers/Mamurra')
    //       .set('Authorization', 'Bearer inValidToken')
    //       .expect(httpStatus.UNAUTHORIZED)
    //       .then((res) => {
    //         expect(res.body.message).to.equal('Unauthorized')
    //         done()
    //       })
    //       .catch(done)
    //   })

    //   it('should update a marker', (done) => {
    //     updateMarker.type = 'aui'
    //     console.log(updateMarker)
    //     request(app)
    //       .put(`/v1/markers/${updateMarker._id}`)
    //       .set('Authorization', jwtToken)
    //       .send(updateMarker)
    //       .expect(httpStatus.OK)
    //       .then((res) => {
    //         console.log(res.body)
    //         expect(res.body._id).to.equal(updateMarker._id)
    //         expect(res.body.type).to.equal('aui')
    //         done()
    //       })
    //       .catch(done)
    //   })
    // })

    // describe('# delete /v1/markers', () => {

    //   it('should fail to delete markers because of wrong token', (done) => {
    //     request(app)
    //       .delete('/v1/markers/Mamurra')
    //       .set('Authorization', 'Bearer inValidToken')
    //       .expect(httpStatus.UNAUTHORIZED)
    //       .then((res) => {
    //         expect(res.body.message).to.equal('Unauthorized')
    //         done()
    //       })
    //       .catch(done)
    //   })

    //   it('should delete a marker', (done) => {
    //     request(app)
    //       .delete('/v1/markers/deleteMamurra')
    //       .set('Authorization', jwtToken)
    //       .expect(httpStatus.OK)
    //       .then((res) => {
    //         expect(res.body._id).to.equal('deleteMamurra')
    //         expect(res.body.type).to.equal('politician')
    //         done()
    //       })
    //       .catch(done)
    //   })
    // })
  })


})
