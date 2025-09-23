import request from 'supertest-as-promised'
import httpStatus from 'http-status'
import chai from 'chai'
const { expect } = chai
import app from '../../../index.js'
import mongoUnit from 'mongo-unit'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'))

chai.config.includeStack = true

describe('## default route', () => {
  const testMongoUrl = process.env.MONGO_HOST

  before(() => mongoUnit.initDb(testMongoUrl, testData))
  after(() => mongoUnit.drop())

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
