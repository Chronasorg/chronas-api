import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai, { expect } from 'chai'
import app from '../../../index.js'

chai.config.includeStack = true

describe('## Areas APIs', () => {

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'asdf'
  }

  const area = {
    _id: '1887',
    year: 1887,
    data: {
      Mentawai: [
        'SWE',
        'swedish',
        'redo',
        'Stockholm',
        1001
      ],
      Belitung: [
        'GBR',
        'sumatran',
        'sunni',
        'Bangka',
        1000
      ]
    }
  }

  const updateArea = {
    _id: '1001',
    year: 1001,
    data: {
      LinggaUpdate: [
        'undefined',
        'malayan',
        'sunni',
        'Lingga',
        1000
      ],
      SognUpdate: [
        'DAN',
        'norwegian',
        'protestant',
        'Sogndal',
        15240
      ]
    }
  }

  let jwtToken

  describe('# GET /v1/area', () => {
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

    describe('# POST /v1/areas', () => {
      it('should create a new area', (done) => {
        request(app)
          .post('/v1/areas')
          .set('Authorization', jwtToken)
          .send(area)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body.id).to.equal(area.id)
            expect(res.body.year).to.equal(area.year)
            done()
          })
          .catch(done)
      })

      it('should fail to post areas because of missing token', (done) => {
        request(app)
          .post('/v1/areas')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })
    })

    describe('# Get /v1/areas', () => {
      it('should get array of areas', (done) => {
        request(app)
          .get('/v1/areas')
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('array')
            expect(res.body[0]).to.have.property('year')
            expect(res.body[0]).to.have.property('data')
            done()
          })
          .catch(done)
      })

      it('should get unauthorized when no token is send ', (done) => {
        request(app)
          .get('/v1/areas')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })

      it('should aggregateProvinces', (done) => {
        request(app)
          .get('/v1/areas/aggregateProvinces')
          .expect(httpStatus.OK)
          .then((res) => {
            done()
          })
          .catch(done)
      })

      it('should fail to aggreagteDiminsion as nothing is specified', (done) => {
        request(app)
          .get('/v1/areas/aggregateDimension')
          .expect(httpStatus.BAD_REQUEST)
          .then((res) => {
            done()
          })
          .catch(done)
      })

      it('should  aggreagteDiminsion', (done) => {
        request(app)
          .get('/v1/areas/aggregateDimension?dimension=religion')
          .expect(httpStatus.OK)
          .then((res) => {
            done()
          })
          .catch(done)
      })


      it('should get specifc area', (done) => {
        request(app)
          .get('/v1/areas/1001')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('object')
            expect(res.body.Sogn).to.be.an('array')
            done()
          })
          .catch(done)
      })
    })

    describe('# Put /v1/areas', () => {
      it('should fail to put area because of wrong token', (done) => {
        request(app)
          .put('/v1/areas/1001')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })

      it('should update a area', (done) => {
        updateArea.year = 1987

        request(app)
          .put(`/v1/areas/${updateArea._id}`)
          .set('Authorization', jwtToken)
          .send(updateArea)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(updateArea._id)
            expect(res.body.year).to.equal(1987)
            done()
          })
          .catch(done)
      })
    })

    describe('# delete /v1/areas', () => {
      it('should fail to delete area because of wrong token', (done) => {
        request(app)
          .delete('/v1/areas/1000')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized')
            done()
          })
          .catch(done)
      })

      it('should delete a area', (done) => {
        request(app)
          .delete('/v1/areas/1000')
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal('1000')
            expect(res.body.year).to.equal(1000)
            done()
          })
          .catch(done)
      })
    })
  })
})
