import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../../../index.js'
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

  const metadata = {
    _id: 'religionNew',
    data: '{"south_arabian":["South Arabian","rgb(153,26,51)","Arabian_mythology","Paganism"],"ashurism":["Ashurism","rgb(230,230,230)","Ancient_Mesopotamian_religion","Paganism"],"african":["African","rgb(204,5',
    __v: 0,
    score: 0,
    type: 'g',
    coo: []

  }

  const updateMetadata = {
    _id: 'culture',
    data: {
      sapmiii: [
        'sapmi',
        'rgb(157,51,167)',
        'asdf'
      ],
      samoyed: [
        'samoyed',
        'rgb(220,220,103)',
        'Samoyedic peoples'
      ]
    },
    __v: 1,
    coo: [],
    score: 0,
    type: 'g'
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
            expect(res.body[0]).to.have.property('_id')
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
            expect(res.body._id).to.equal('culture')
            expect(res.body.type).to.equal('g')
            expect(res.body).to.have.property('data')
            done()
          })
          .catch(done)
      })
    })

    describe('# Put /v1/metadata', () => {
      it('should fail to update metadata because of wrong token', (done) => {
        request(app)
          .put('/v1/metadata/culture')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })

      it('should update a metadat value', (done) => {
        request(app)
          .put(`/v1/metadata/${updateMetadata._id}`)
          .set('Authorization', jwtToken)
          .send(updateMetadata)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(updateMetadata._id)
            expect(Object.keys(res.body.data).length).to.equal(2)
            done()
          })
          .catch(done)
      })
    })

    describe('# upvote /v1/metadata', () => {
      it('should update a metadat value', (done) => {
        request(app)
          .put(`/v1/metadata/${updateMetadata._id}/upvote`)
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(updateMetadata._id)
            expect(res.body.score).to.equal(1)
            done()
          })
          .catch(done)
      })
    })


    describe('# getLinked /v1/metadata/:id/getLinked', () => {
      it('should get bad request because source is not set', (done) => {
        request(app)
          .get('/v1/metadata/culture/getLinked')
          .expect(httpStatus.BAD_REQUEST)
          .then((res) => {
            done()
          })
          .catch(done)
      })
    })


    describe('# downvote /v1/metadata', () => {
      it('should update a metadat value', (done) => {
        request(app)
          .put(`/v1/metadata/${updateMetadata._id}/downvote`)
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(updateMetadata._id)
            expect(res.body.score).to.equal(0)
            done()
          })
          .catch(done)
      })
    })


    describe('# delete /v1/metadata', () => {
      it('should fail to delete metadata because of wrong token', (done) => {
        request(app)
          .delete('/v1/metadata/culture')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })

      it('should delete a metadata ', (done) => {
        request(app)
          .delete('/v1/metadata/culture')
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal('culture')
            expect(res.body.type).to.equal('g')
            done()
          })
          .catch(done)
      })
    })
  })
})
