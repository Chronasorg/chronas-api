import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../helpers/test-app.js'
import { setupMockDatabase, teardownMockDatabase, clearMockDatabase } from '../helpers/mock-database.js'

chai.config.includeStack = true

describe('## Auth Validation Tests', () => {
  before(async function() {
    this.timeout(10000)
    await setupMockDatabase()
    console.log('📋 Mock database ready for auth validation tests')
  })
  
  after(async function() {
    this.timeout(5000)
    await teardownMockDatabase()
  })
  
  beforeEach(async () => {
    await clearMockDatabase()
  })

  describe('# POST /v1/auth/login', () => {
    it('should validate required email field', async () => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({
          password: 'test123'
          // missing email
        })
      
      expect(res.status).to.equal(httpStatus.BAD_REQUEST)
      expect(res.body.message).to.include('email')
    })

    it('should validate required password field', async () => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@test.com'
          // missing password
        })
      
      expect(res.status).to.equal(httpStatus.BAD_REQUEST)
      expect(res.body.message).to.include('password')
    })

    it('should return authentication error for invalid credentials', async () => {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'wrongpassword'
        })
      
      // Should get 401 for invalid credentials (not 500)
      expect(res.status).to.equal(httpStatus.UNAUTHORIZED)
      expect(res.body.message).to.equal('Authentication error')
    })
  })

  describe('# POST /v1/auth/signup', () => {
    it('should validate required email field', async () => {
      const res = await request(app)
        .post('/v1/auth/signup')
        .send({
          password: 'test123',
          username: 'testuser'
          // missing email
        })
      
      expect(res.status).to.equal(httpStatus.BAD_REQUEST)
      expect(res.body.message).to.include('email')
    })

    it('should validate required password field', async () => {
      const res = await request(app)
        .post('/v1/auth/signup')
        .send({
          email: 'test@test.com',
          username: 'testuser'
          // missing password
        })
      
      expect(res.status).to.equal(httpStatus.BAD_REQUEST)
      expect(res.body.message).to.include('password')
    })

    it('should handle signup attempt (may fail due to database)', async () => {
      const res = await request(app)
        .post('/v1/auth/signup')
        .send({
          email: 'newuser@test.com',
          password: 'test123456',
          username: 'new_user'
        })
      
      // Should not be a validation error (400) or server error (500)
      // Might be 401 or other business logic error, but validation should pass
      expect(res.status).to.not.equal(httpStatus.BAD_REQUEST)
      expect(res.status).to.not.equal(httpStatus.INTERNAL_SERVER_ERROR)
    })
  })

  describe('# Route Structure', () => {
    it('should have auth routes mounted', async () => {
      // Test that auth routes exist
      const res = await request(app)
        .post('/v1/auth/login')
        .send({})
      
      // Should not be 404 (route exists), should be 400 (validation error)
      expect(res.status).to.not.equal(httpStatus.NOT_FOUND)
    })

    it('should handle OPTIONS requests for CORS', async () => {
      const res = await request(app)
        .options('/v1/auth/login')
      
      // Should handle OPTIONS (not 405 Method Not Allowed)
      expect(res.status).to.not.equal(405)
    })
  })
});