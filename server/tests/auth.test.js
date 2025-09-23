// import request from 'supertest-as-promised'
// import httpStatus from 'http-status'
// import jwt from 'jsonwebtoken'
// import chai from 'chai'
// const { expect } = chai
// import app from '../../index'
// import { config } from '../../config/config.js'
//
// chai.config.includeStack = true
//
// describe('## Auth APIs', () => {
//   const validUserCredentials = {
//     username: 'react',
//     password: 'express'
//   }
//
//   const invalidUserCredentials = {
//     username: 'react',
//     password: 'IDontKnow'
//   }
//
//   let jwtToken
//
//   describe('# POST /v1/auth/login', () => {
//     it('should return Authentication error', (done) => {
//       request(app)
//         .post('/v1/auth/login')
//         .send(invalidUserCredentials)
//         .expect(httpStatus.UNAUTHORIZED)
//         .then((res) => {
//           expect(res.body.message).to.equal('Authentication error')
//           done()
//         })
//         .catch(done)
//     })
//
//     it('should get valid JWT token', (done) => {
//       request(app)
//         .post('/v1/auth/login')
//         .send(validUserCredentials)
//         .expect(httpStatus.OK)
//         .then((res) => {
//           expect(res.body).to.have.property('token')
//           jwt.verify(res.body.token, config.jwtSecret, (err, decoded) => {
//             expect(err).to.not.be.ok // eslint-disable-line no-unused-expressions
//             expect(decoded.username).to.equal(validUserCredentials.username)
//             jwtToken = `Bearer ${res.body.token}`
//             done()
//           })
//         })
//         .catch(done)
//     })
//   })
//
//   describe('# GET /v1/markers', () => {
//     it('should fail to get markers because of missing Authorization', (done) => {
//       request(app)
//         .get('/v1/markers')
//         .expect(httpStatus.UNAUTHORIZED)
//         .then((res) => {
//           expect(res.body.message).to.equal('Unauthorized')
//           done()
//         })
//         .catch(done)
//     })
//
//     it('should fail to get markers because of wrong token', (done) => {
//       request(app)
//         .get('/v1/markers')
//         .set('Authorization', 'Bearer inValidToken')
//         .expect(httpStatus.UNAUTHORIZED)
//         .then((res) => {
//           expect(res.body.message).to.equal('Unauthorized')
//           done()
//         })
//         .catch(done)
//     })
//
//     it('should not fail to get list of markers', (done) => {
//       request(app)
//         .get('/v1/markers')
//         .set('Authorization', jwtToken)
//         .expect(httpStatus.OK)
//         .then((res) => {
//           expect(res.body).to.be.an('array')
//           done()
//         })
//         .catch(done)
//     })
//   })
// })
