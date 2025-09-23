import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../helpers/test-app.js'
import { setupMockDatabase, teardownMockDatabase, clearMockDatabase } from '../helpers/mock-database.js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'))

chai.config.includeStack = true

describe('## version', () => {
  before(async function() {
    this.timeout(10000)
    await setupMockDatabase()
    console.log('📋 Mock database ready for version tests')
  })
  
  after(async function() {
    this.timeout(5000)
    await teardownMockDatabase()
  })
  
  beforeEach(async () => {
    await clearMockDatabase()
  })

  it('should return OK and have properties version and commit', (done) => {
    request(app)
        .get('/v1/version')
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('version')
          expect(res.body).to.have.property('commit')
          done()
        })
        .catch(done)
  })
})
