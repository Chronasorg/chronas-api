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

describe('## Simple Mock Integration Tests', () => {
  const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData-modern.json'), 'utf8'))

  before(async function() {
    this.timeout(10000)
    await setupMockDatabase()
    await populateMockData(testData)
    console.log('📋 Mock database ready for integration tests')
  })
  
  after(async function() {
    this.timeout(5000)
    await teardownMockDatabase()
  })
  
  beforeEach(async () => {
    await clearMockDatabase()
    await populateMockData(testData)
  })

  describe('# Health and Version Endpoints', () => {
    it('should return OK status for health endpoint', async () => {
      const res = await request(app)
        .get('/health')
        .expect(httpStatus.OK)
      
      expect(res.body).to.have.property('status', 'OK')
      expect(res.body).to.have.property('timestamp')
      expect(res.body).to.have.property('uptime')
      expect(res.body).to.have.property('environment', 'test')
    })

    it('should return version information', async () => {
      const res = await request(app)
        .get('/v1/version')
        .expect(httpStatus.OK)
      
      expect(res.body).to.have.property('version')
      expect(res.body).to.have.property('commit')
    })

    it('should return version for default route', async () => {
      const res = await request(app)
        .get('/')
        .expect(httpStatus.OK)
      
      expect(res.body).to.have.property('version')
      expect(res.body).to.have.property('commit')
    })
  })

  describe('# Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app)
        .get('/unknown-route')
        .expect(httpStatus.NOT_FOUND)
      
      expect(res.body).to.have.property('message')
    })

    it('should return 404 for unknown API routes', async () => {
      const res = await request(app)
        .get('/v1/unknown')
        .expect(httpStatus.NOT_FOUND)
      
      expect(res.body).to.have.property('message')
    })
  })

  describe('# CORS and Security', () => {
    it('should include CORS headers', async () => {
      const res = await request(app)
        .get('/health')
        .expect(httpStatus.OK)
      
      expect(res.headers).to.have.property('access-control-allow-origin')
    })

    it('should include security headers', async () => {
      const res = await request(app)
        .get('/health')
        .expect(httpStatus.OK)
      
      expect(res.headers).to.have.property('x-content-type-options')
    })
  })

  describe('# Request Processing', () => {
    it('should handle JSON POST requests', async () => {
      const testData = { test: 'data', number: 42 }
      
      // This will hit a 404 since we don't have a /test endpoint, but it should process the JSON
      const res = await request(app)
        .post('/test')
        .send(testData)
        .expect(httpStatus.NOT_FOUND)
      
      // Should still return proper error format
      expect(res.body).to.have.property('message')
    })

    it('should handle large JSON payloads', async () => {
      const largeData = {
        data: 'x'.repeat(1000),
        array: new Array(100).fill('test')
      }
      
      const res = await request(app)
        .post('/test-large')
        .send(largeData)
        .expect(httpStatus.NOT_FOUND)
      
      expect(res.body).to.have.property('message')
    })
  })

  describe('# API Route Structure', () => {
    it('should mount API routes on /v1 path', async () => {
      // Test that /v1 path exists (even if it returns an error due to missing auth)
      const res = await request(app)
        .get('/v1/')
      
      // Should not be 404, might be 401/403/500 due to auth/db requirements
      expect(res.status).to.not.equal(httpStatus.NOT_FOUND)
    })

    it('should handle OPTIONS requests for CORS preflight', async () => {
      const res = await request(app)
        .options('/v1/test')
      
      // Should handle OPTIONS request (might be 404 but not 405 Method Not Allowed)
      expect(res.status).to.not.equal(405)
    })
  })
});