import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../helpers/test-app.js'
import { setupMockDatabase, teardownMockDatabase, clearMockDatabase, populateMockData } from '../helpers/mock-database.js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

chai.config.includeStack = true

describe('## Marker APIs', () => {
  const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'))

  before(async function() {
    this.timeout(10000)
    await setupMockDatabase()
    await populateMockData(testData)
    console.log('📋 Mock database ready for marker tests')
  })
  
  after(async function() {
    this.timeout(5000)
    await teardownMockDatabase()
  })
  
  beforeEach(async () => {
    await clearMockDatabase()
    await populateMockData(testData)
  })

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  }

  const marker = {
    _id: 'AuisMarker',
    name: 'new Marker',
    wiki: 'new%20Marker',
    type: 'politician',
    year: 1987,
    coo: [
      12.5,
      41.9
    ]
  }

  const updateMarker = {
    _id: 'Mamurra',
    name: 'Mamurra',
    wiki: 'Mamurra',
    type: 'politician',
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
      it('should get array of markers', (done) => {
        request(app)
          .get('/v1/markers')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('array')
            // expect(res.body[0]).to.have.property('year')
            // expect(res.body[0]).to.have.property('_id')
            done()
          })
          .catch(done)
      })

      it('should get specifc marker', (done) => {
        request(app)
          .get('/v1/markers/Mamurra')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal('Mamurra')
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
        updateMarker.type = 'aui'

        request(app)
          .put(`/v1/markers/${updateMarker._id}`)
          .set('Authorization', jwtToken)
          .send(updateMarker)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(updateMarker._id)
            expect(res.body.type).to.equal('aui')
            done()
          })
          .catch(done)
      })
    })

    describe('# delete /v1/markers', () => {
      it('should fail to delete markers because of wrong token', (done) => {
        request(app)
          .delete('/v1/markers/Mamurra')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })

      it('should delete a marker', (done) => {
        request(app)
          .delete('/v1/markers/deleteMamurra')
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal('deleteMamurra')
            expect(res.body.type).to.equal('politician')
            done()
          })
          .catch(done)
      })
    })
  })
})
