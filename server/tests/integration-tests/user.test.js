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

describe('## User APIs', () => {
  const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'))

  before(async function() {
    this.timeout(10000)
    await setupMockDatabase()
    await populateMockData(testData)
    console.log('📋 Mock database ready for user tests')
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

  let user = {
    email: 'test2@test.de', // email is required
    username: 'doubtful-throne',
    password: 'doubtful-throne',
    privilege: 1
  }

  let jwtToken

  describe('# POST /v1/auth/login', () => {
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
  })

  describe('# POST /v1/users', () => {
    it('should create a new user', (done) => {
      request(app)
        .post('/v1/users')
        .send(user)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal(user.username)
          expect(res.body.privilege).to.equal(user.privilege)
          user = res.body
          done()
        })
        .catch(done)
    })
  })

  // describe('# GET /v1/users/', () => {
  //   it('should get all users', (done) => {
  //     request(app)
  //       .get('/v1/users')
  //       .set('Authorization', jwtToken)
  //       .expect(httpStatus.OK)
  //       .then((res) => {
  //         expect(res.body).to.be.an('array')
  //         done()
  //       })
  //       .catch(done)
  //   })
  // })
  //
  // describe('# GET /v1/users/ without token', () => {
  //   it('should return unauthorized', (done) => {
  //     request(app)
  //       .get('/v1/users')
  //       .expect(httpStatus.UNAUTHORIZED)
  //       .then((res) => {
  //         expect(res.body.message).to.equal("Unauthorized")
  //         done()
  //       })
  //       .catch(done)
  //   })
  // })

  it('should handle if user not exist 404', (done) => {
    request(app)
      .get('/v1/users/56z787zzz67fc')
      .expect(httpStatus.NOT_FOUND)
      .then((res) => {
        expect(res.body.message).to.equal('Not Found')
        done()
      })
      .catch(done)
  })

  it('should handle express validation error - username is required', (done) => {
    request(app)
      .post('/v1/users')
      .send({
        privilege: 'public'
      })
      .expect(httpStatus.BAD_REQUEST)
      .then((res) => {
        expect(res.body.message).to.equal('"username" is required')
        done()
      })
      .catch(done)
  })

  describe('# GET /v1/users/:userId', () => {
    it('should get user details', (done) => {
      request(app)
        .get(`/v1/users/${user._id}`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal(user.username)
          expect(res.body.privilege).to.equal(user.privilege)
          done()
        })
        .catch(done)
    })

    it('should report error with message - Not found, when user does not exists', (done) => {
      request(app)
        .get('/v1/users/56c787ccc67fc16ccc1a5e92')
        .set('Authorization', jwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then((res) => {
          expect(res.body.message).to.equal('Not Found')
          done()
        })
        .catch(done)
    })
  })

  describe('# PUT /v1/users/:userId', () => {
    it('should update user details', (done) => {
      user.username = 'KK'
      request(app)
        .put(`/v1/users/${user._id}`)
        .set('Authorization', jwtToken)
        .send(user)
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body.username).to.equal('KK')
          expect(res.body.privilege).to.equal(user.privilege)
          done()
        })
        .catch(done)
    })
  })

  describe('# DELETE /v1/users/', () => {
    it('should delete user', (done) => {
      request(app)
        .delete(`/v1/users/${user._id}`)
        .set('Authorization', jwtToken)
        .expect(200)
        .then((res) => {
          expect(res.body.username).to.equal('KK')
          expect(res.body.privilege).to.equal(user.privilege)
          done()
        })
        .catch(done)
    })
  })
})
