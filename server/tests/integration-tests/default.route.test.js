import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../helpers/test-app.js'
import { setupTestDatabase, teardownTestDatabase, clearTestDatabase } from '../helpers/mongodb-memory.js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'))

chai.config.includeStack = true

describe('## default route', () => {
  before(async function() {
    this.timeout(30000)
    await setupTestDatabase()
    console.log('📋 Test database ready for default route tests')
  })
  
  after(async function() {
    this.timeout(10000)
    await teardownTestDatabase()
  })
  
  beforeEach(async () => {
    await clearTestDatabase()
  })

  it('should return version endpoint', (done) => {
    request(app)
        .get('')
        .expect(httpStatus.OK)
        .then((res) => {
          expect(res.body).to.have.property('version')
          expect(res.body).to.have.property('commit')
          done()
        })
        .catch(done)
  })
})
