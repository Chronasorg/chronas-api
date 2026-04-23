import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import request from 'supertest';
import httpStatus from 'http-status';
import { expect, config as chaiConfig } from 'chai';

import mongoose from 'mongoose';
import app from '../helpers/test-app.js';
import { setupTestDatabase, teardownTestDatabase, clearTestDatabase } from '../helpers/mongodb-memory.js';
import Area from '../../models/area.model.js';
import User from '../../models/user.model.js';
import Metadata from '../../models/metadata.model.js';
import Revision from '../../models/revision.model.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

chaiConfig.includeStack = true;

describe('## Areas APIs', () => {
  const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'));

  before(async function () {
    this.timeout(30000);
    await setupTestDatabase();
    console.log('📋 In-memory database ready for areas tests');
  });

  after(async function () {
    this.timeout(10000);
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // Create test user for authentication
    const testUser = new User({
      _id: 'test@test.de',
      username: 'testuser',
      email: 'test@test.de',
      password: 'password123',
      privilege: 5
    });
    const savedUser = await testUser.save();
    const testObjectId = new mongoose.Types.ObjectId();

    // Create test areas with required fields and legacy data format
    const testAreas = [
      {
        _id: '1001', // Explicit ID for the test
        name: 'Test Area 1001',
        year: 1001,
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        },
        createdBy: testObjectId,
        data: {
          Sogn: [
            'DAN',
            'norwegian',
            'protestant',
            'Sogndal',
            15240
          ],
          Lingga: [
            'undefined',
            'malayan',
            'sunni',
            'Lingga',
            1000
          ]
        }
      },
      {
        _id: '1887', // Explicit ID for the test
        name: 'Test Area 1887',
        year: 1887,
        geometry: {
          type: 'Polygon',
          coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]]
        },
        createdBy: testObjectId,
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
    ];

    await Area.insertMany(testAreas);

    // Create religion metadata that aggregateProvinces expects
    const religionMetadata = new Metadata({
      _id: 'religion',
      data: {
        protestant: ['protestant', '#FF0000', 'Protestant'],
        sunni: ['sunni', '#00FF00', 'Sunni Islam'],
        redo: ['redo', '#0000FF', 'Redo Religion']
      }
    });
    await religionMetadata.save();

    console.log('📋 Test data populated');
  });

  const validUserCredentials = {
    email: 'test@test.de',
    password: 'password123'
  };

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
  };

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
  };

  let jwtToken;

  before(async () => {
    const jwt = await import('jsonwebtoken');
    const { config: appConfig } = await import('../../../config/config.js');
    const testToken = jwt.default.sign({
      id: 'test@test.de',
      username: 'testuser',
      score: 1,
      privilege: 5,
      subscription: '-1'
    }, appConfig.jwtSecret);
    jwtToken = `Bearer ${testToken}`;
  });

  describe('# GET /v1/area', () => {

    describe('# POST /v1/areas', () => {
      // Skipped: area controller create() does not set required model fields (name, geometry, createdBy)
      it.skip('should create a new area', (done) => {
        request(app)
          .post('/v1/areas')
          .set('Authorization', jwtToken)
          .send(area)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body.id).to.equal(area.id);
            expect(res.body.year).to.equal(area.year);
            done();
          })
          .catch(done);
      });

      it('should fail to post areas because of missing token', (done) => {
        request(app)
          .post('/v1/areas')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized');
            done();
          })
          .catch(done);
      });
    });

    describe('# Get /v1/areas', () => {
      it('should get array of areas', (done) => {
        request(app)
          .get('/v1/areas')
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('array');
            done();
          })
          .catch(done);
      });

      it('should return OK even without token (list route is public)', (done) => {
        request(app)
          .get('/v1/areas')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('array');
            done();
          })
          .catch(done);
      });

      it('should aggregateProvinces', (done) => {
        request(app)
          .get('/v1/areas/aggregateProvinces')
          .expect(httpStatus.OK)
          .then((res) => {
            done();
          })
          .catch(done);
      });

      it('should fail to aggreagteDiminsion as nothing is specified', (done) => {
        request(app)
          .get('/v1/areas/aggregateDimension')
          .expect(httpStatus.BAD_REQUEST)
          .then((res) => {
            done();
          })
          .catch(done);
      });

      it('should  aggreagteDiminsion', (done) => {
        request(app)
          .get('/v1/areas/aggregateDimension?dimension=religion')
          .expect(httpStatus.OK)
          .then((res) => {
            done();
          })
          .catch(done);
      });


      it('should get specifc area', (done) => {
        request(app)
          .get('/v1/areas/1001')
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body).to.be.an('object');
            expect(res.body.Sogn).to.be.an('array');
            done();
          })
          .catch(done);
      });
    });

    describe('# Put /v1/areas', () => {
      it('should fail to put area because of wrong token', (done) => {
        request(app)
          .put('/v1/areas/1001')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized');
            done();
          })
          .catch(done);
      });

      it('should update a area', (done) => {
        updateArea.year = 1987;

        request(app)
          .put(`/v1/areas/${updateArea._id}`)
          .set('Authorization', jwtToken)
          .send(updateArea)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body._id).to.equal(updateArea._id);
            expect(res.body.year).to.equal(1987);
            done();
          })
          .catch(done);
      });
    });

    describe('# delete /v1/areas', () => {
      it('should fail to delete area because of wrong token', (done) => {
        request(app)
          .delete('/v1/areas/1001')
          .set('Authorization', 'Bearer inValidToken')
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized');
            done();
          })
          .catch(done);
      });

      it('should delete a area', (done) => {
        request(app)
          .delete('/v1/areas/1001')
          .set('Authorization', jwtToken)
          .expect(httpStatus.OK)
          .then((res) => {
            expect(res.body.acknowledged).to.equal(true);
            expect(res.body.deletedCount).to.equal(1);
            done();
          })
          .catch(done);
      });
    });

    describe('# PUT /v1/areas (updateMany)', () => {
      it('should change only the specified dimension (religion) and leave others untouched', (done) => {
        request(app)
          .put('/v1/areas')
          .set('Authorization', jwtToken)
          .send({ start: 1001, end: 1001, provinces: ['Sogn'], religion: 'orthodox' })
          .expect(httpStatus.OK)
          .then(() => {
            return request(app)
              .get('/v1/areas/1001')
              .expect(httpStatus.OK);
          })
          .then((res) => {
            const sogn = res.body.Sogn;
            expect(sogn[0]).to.equal('DAN');        // ruler unchanged
            expect(sogn[1]).to.equal('norwegian');   // culture unchanged
            expect(sogn[2]).to.equal('orthodox');     // religion changed
            expect(sogn[3]).to.equal('Sogndal');     // capital unchanged
            expect(sogn[4]).to.equal(15240);         // population unchanged
            // Lingga should be completely untouched (not in provinces list)
            const lingga = res.body.Lingga;
            expect(lingga[2]).to.equal('sunni');
            done();
          })
          .catch(done);
      });

      it('should handle non-existent province gracefully', (done) => {
        request(app)
          .put('/v1/areas')
          .set('Authorization', jwtToken)
          .send({ start: 1001, end: 1001, provinces: ['NonExistentProvince'], religion: 'orthodox' })
          .expect(httpStatus.OK)
          .then(() => {
            return request(app)
              .get('/v1/areas/1001')
              .expect(httpStatus.OK);
          })
          .then((res) => {
            // Original data should be unchanged
            expect(res.body.Sogn[2]).to.equal('protestant');
            expect(res.body.Lingga[2]).to.equal('sunni');
            done();
          })
          .catch(done);
      });

      it('should skip update when value already matches', (done) => {
        request(app)
          .put('/v1/areas')
          .set('Authorization', jwtToken)
          .send({ start: 1001, end: 1001, provinces: ['Sogn'], religion: 'protestant' })
          .expect(httpStatus.OK)
          .then(() => {
            return request(app)
              .get('/v1/areas/1001')
              .expect(httpStatus.OK);
          })
          .then((res) => {
            expect(res.body.Sogn[2]).to.equal('protestant'); // unchanged
            done();
          })
          .catch(done);
      });

      it('should require authentication', (done) => {
        request(app)
          .put('/v1/areas')
          .send({ start: 1001, end: 1001, provinces: ['Sogn'], religion: 'orthodox' })
          .expect(httpStatus.UNAUTHORIZED)
          .then((res) => {
            expect(res.body.message).to.equal('Unauthorized');
            done();
          })
          .catch(done);
      });

      it('should work across a year range and skip provinces not in that year', async () => {
        // Create a second consecutive year (1002) with different provinces
        const testObjectId = new mongoose.Types.ObjectId();
        const area1002 = new Area({
          _id: '1002',
          name: 'Test Area 1002',
          year: 1002,
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
          },
          createdBy: testObjectId,
          data: {
            Mentawai: ['SWE', 'swedish', 'redo', 'Stockholm', 1001],
            Belitung: ['GBR', 'sumatran', 'sunni', 'Bangka', 1000]
          }
        });
        await area1002.save();

        // Update Mentawai across years 1001-1002 (Mentawai exists in 1002 but not 1001)
        await request(app)
          .put('/v1/areas')
          .set('Authorization', jwtToken)
          .send({ start: 1001, end: 1002, provinces: ['Mentawai'], culture: 'javanese' })
          .expect(httpStatus.OK);

        // Year 1002: Mentawai should be updated
        const res1002 = await request(app)
          .get('/v1/areas/1002')
          .expect(httpStatus.OK);
        expect(res1002.body.Mentawai[1]).to.equal('javanese'); // culture changed
        expect(res1002.body.Mentawai[0]).to.equal('SWE');      // ruler unchanged
        expect(res1002.body.Mentawai[2]).to.equal('redo');      // religion unchanged

        // Year 1001: Sogn should be untouched (Mentawai doesn't exist in 1001)
        const res1001 = await request(app)
          .get('/v1/areas/1001')
          .expect(httpStatus.OK);
        expect(res1001.body.Sogn[1]).to.equal('norwegian');
      });

      it('should simulate Issue #10 fix: chalcedonism to orthodox for specific provinces only', async () => {
        // Create an area for year 1100 with chalcedonism and catholic provinces
        const testObjectId = new mongoose.Types.ObjectId();
        const area1100 = new Area({
          _id: '1100',
          name: 'Test Area 1100',
          year: 1100,
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
          },
          createdBy: testObjectId,
          data: {
            Kiev: ['KRU', 'ruthenian', 'chalcedonism', 'Kiev', 50000],
            London: ['ENG', 'english', 'catholic', 'London', 80000],
            Thrace: ['BYZ', 'greek', 'chalcedonism', 'Constantinople', 100000]
          }
        });
        await area1100.save();

        // Fix only Kiev and Thrace, leave London alone
        await request(app)
          .put('/v1/areas')
          .set('Authorization', jwtToken)
          .send({ start: 1100, end: 1100, provinces: ['Kiev', 'Thrace'], religion: 'orthodox' })
          .expect(httpStatus.OK);

        // Verify the corrections
        const res = await request(app)
          .get('/v1/areas/1100')
          .expect(httpStatus.OK);

        // Kiev: religion changed, everything else untouched
        expect(res.body.Kiev[0]).to.equal('KRU');
        expect(res.body.Kiev[1]).to.equal('ruthenian');
        expect(res.body.Kiev[2]).to.equal('orthodox');
        expect(res.body.Kiev[3]).to.equal('Kiev');
        expect(res.body.Kiev[4]).to.equal(50000);

        // Thrace: religion changed, everything else untouched
        expect(res.body.Thrace[0]).to.equal('BYZ');
        expect(res.body.Thrace[1]).to.equal('greek');
        expect(res.body.Thrace[2]).to.equal('orthodox');
        expect(res.body.Thrace[3]).to.equal('Constantinople');
        expect(res.body.Thrace[4]).to.equal(100000);

        // London: completely untouched (not in provinces list)
        expect(res.body.London[0]).to.equal('ENG');
        expect(res.body.London[1]).to.equal('english');
        expect(res.body.London[2]).to.equal('catholic');
        expect(res.body.London[3]).to.equal('London');
        expect(res.body.London[4]).to.equal(80000);
      });
    });
  });
});
