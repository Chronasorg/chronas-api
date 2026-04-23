import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import request from 'supertest';
import httpStatus from 'http-status';
import { expect, config as chaiConfig } from 'chai';

import app from '../helpers/test-app.js';
import { setupTestDatabase, teardownTestDatabase, clearTestDatabase } from '../helpers/mongodb-memory.js';
import Marker from '../../models/marker.model.js';
import Metadata from '../../models/metadata.model.js';
import Area from '../../models/area.model.js';
import User from '../../models/user.model.js';
import Flag from '../../models/flag.model.js';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
chaiConfig.includeStack = true;

describe('## Production Endpoint Tests (Issue #35)', () => {
  const productionData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/productionData.json'), 'utf8')
  );

  let jwtToken;

  before(async function () {
    this.timeout(30000);
    await setupTestDatabase();
    console.log('In-memory database ready for production endpoint tests');
  });

  after(async function () {
    this.timeout(10000);
    await teardownTestDatabase();
  });

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
    await testUser.save();
  });

  describe('# Marker endpoints', () => {
    beforeEach(async () => {
      // Seed all production marker data using collection.insertMany to bypass schema validation
      const allMarkers = [
        ...productionData.markers.year714,
        ...productionData.markers.year1195cp,
        ...productionData.markers.singleCount
      ];
      await Marker.collection.insertMany(allMarkers);
    });

    it('should return markers filtered by multiple types and year', async () => {
      const res = await request(app)
        .get('/v1/markers?types=a,ar,at,b,c,ca,cp,e,m,op,p,r,s,si&year=714&count=3000')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
    });

    it('should return markers filtered by single type (cp) and year', async () => {
      const res = await request(app)
        .get('/v1/markers?types=cp&year=1195&count=3000')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      // The response should contain markers within the year delta of 1195
      expect(res.body.length).to.be.greaterThan(0);
    });

    it('should respect count parameter', async () => {
      const res = await request(app)
        .get('/v1/markers?count=1')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      expect(res.body).to.have.lengthOf(1);
    });

    it('should return markers with required fields (_id, type, year)', async () => {
      const res = await request(app)
        .get('/v1/markers?year=714&count=3000')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
      res.body.forEach((marker) => {
        expect(marker).to.have.property('_id');
        expect(marker).to.have.property('type');
        expect(marker).to.have.property('year');
      });
    });

    it('should return markers with coordinate arrays', async () => {
      const res = await request(app)
        .get('/v1/markers?year=714&count=3000')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
      res.body.forEach((marker) => {
        expect(marker).to.have.property('coo');
        expect(marker.coo).to.be.an('array');
        expect(marker.coo).to.have.lengthOf(2);
      });
    });
  });

  describe('# Metadata endpoints', () => {
    it('should return metadata as object when f= parameter is provided', async () => {
      // Seed metadata with type 'g' and _id matching the f-list items
      const metadataDocs = [
        {
          _id: 'provinces',
          type: 'g',
          score: 0,
          data: { Alaska: ['USA', 'inuit', 'protestant', 'Juneau', 741894] },
          coo: []
        },
        {
          _id: 'ruler',
          type: 'g',
          score: 0,
          data: { USA: ['United States', 'rgb(0,0,128)', 'United_States'] },
          coo: []
        },
        {
          _id: 'culture',
          type: 'g',
          score: 0,
          data: { inuit: ['Inuit', 'rgb(100,200,255)', 'Inuit_peoples'] },
          coo: []
        },
        {
          _id: 'religion',
          type: 'g',
          score: 0,
          data: { protestant: ['Protestant', 'rgb(255,0,0)', 'Protestantism', 'Christianity'] },
          coo: []
        },
        {
          _id: 'capital',
          type: 'g',
          score: 0,
          data: { Juneau: ['Juneau'] },
          coo: []
        },
        {
          _id: 'province',
          type: 'g',
          score: 0,
          data: { Alaska: 'Alaska' },
          coo: []
        },
        {
          _id: 'religionGeneral',
          type: 'g',
          score: 0,
          data: { Christianity: ['Christianity', 'rgb(200,200,200)'] },
          coo: []
        }
      ];
      await Metadata.insertMany(metadataDocs);

      const res = await request(app)
        .get('/v1/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral')
        .expect(httpStatus.OK);

      // When f= is present, the API returns an object keyed by _id values
      expect(res.body).to.be.an('object');
      expect(res.body).to.not.be.an('array');
      expect(res.body).to.have.property('provinces');
      expect(res.body).to.have.property('ruler');
      expect(res.body).to.have.property('culture');
      expect(res.body).to.have.property('religion');
      expect(res.body).to.have.property('capital');
      expect(res.body).to.have.property('province');
      expect(res.body).to.have.property('religionGeneral');
    });

    it('should return wars metadata with battle mappings for subtype=ew', async () => {
      // Seed war metadata entries with type 'e' and subtype 'ew'
      const warMetadata = [
        {
          _id: 'e_Bosnian_War',
          type: 'e',
          subtype: 'ew',
          year: 1992,
          score: 10,
          data: {
            title: 'Bosnian War',
            participants: [['BIH'], ['SRB', 'HRV']]
          }
        },
        {
          _id: 'e_American_Civil_War',
          type: 'e',
          subtype: 'ew',
          year: 1861,
          score: 15,
          data: {
            title: 'American Civil War',
            participants: [['USA'], ['CSA']]
          }
        }
      ];
      await Metadata.insertMany(warMetadata);

      // Seed battle markers with type 'b' and partOf field referencing wars
      const battleMarkers = [
        {
          _id: 'Battle_of_Kupres_1992',
          name: 'Battle of Kupres (1992)',
          coo: [17.28, 43.98],
          type: 'b',
          year: 1992,
          partOf: 'e_Bosnian_War'
        },
        {
          _id: 'Battle_for_Vozuca',
          name: 'Battle for Vozuca',
          coo: [18.08, 44.33],
          type: 'b',
          year: 1995,
          partOf: 'e_Bosnian_War'
        },
        {
          _id: 'Battle_of_Adairsville',
          name: 'Battle of Adairsville',
          coo: [-84.93, 34.37],
          type: 'b',
          year: 1864,
          partOf: 'e_American_Civil_War'
        }
      ];
      await Marker.collection.insertMany(battleMarkers);

      const res = await request(app)
        .get('/v1/metadata?type=e&end=3000&subtype=ew')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
      // The first item should be the war-battles mapping object (unshifted by the ew logic)
      const battleMap = res.body[0];
      expect(battleMap).to.be.an('object');
      // The battle map should have keys corresponding to war partOf values
      const hasWarKey = Object.keys(battleMap).some(
        (key) => key === 'e_Bosnian_War' || key === 'e_American_Civil_War'
      );
      expect(hasWarKey).to.equal(true);
    });

    it('should return 400 for getLinked without source parameter', async () => {
      // Seed a links metadata doc so the route param loader succeeds
      const linksMetadata = new Metadata({
        _id: 'links',
        type: 'g',
        score: 0,
        data: {}
      });
      await linksMetadata.save();

      await request(app)
        .get('/v1/metadata/links/getLinked')
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('# Board/Forum endpoints', () => {
    it('should return discussions array for KHI query', async () => {
      const res = await request(app)
        .get('/v1/board/forum/questions/discussions?sorting_method=date&q=1:ae|ruler|KHI&limit=5')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
    });

    it('should return discussions array for AAC query', async () => {
      const res = await request(app)
        .get('/v1/board/forum/questions/discussions?sorting_method=date&q=1:ae|ruler|AAC&limit=5')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
    });
  });

  describe('# Version endpoints', () => {
    it('should return welcome info with version and commit', async () => {
      const res = await request(app)
        .get('/v1/version/welcome')
        .expect(httpStatus.OK);

      expect(res.body).to.have.property('version');
      expect(res.body).to.have.property('commit');
    });
  });

  describe('# Area endpoints', () => {
    beforeEach(async () => {
      // Seed area with _id "2000" containing production-style province data
      // Use collection.insertMany to bypass schema validation (production area docs
      // don't have geometry/name/createdBy fields required by the modernized schema)
      await Area.collection.insertMany([
        {
          _id: '2000',
          year: 2000,
          data: productionData.areas.year2000_sample
        }
      ]);
    });

    it('should return area data for year 2000', async () => {
      const res = await request(app)
        .get('/v1/areas/2000')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('object');
      // The area controller returns data property when it exists
      expect(res.body).to.have.property('Alaska');
      expect(res.body).to.have.property('Hawaii');
      expect(res.body).to.have.property('Svalbard');
    });

    it('should return province data as arrays with 5 elements', async () => {
      const res = await request(app)
        .get('/v1/areas/2000')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('object');
      const provinces = Object.keys(res.body);
      expect(provinces.length).to.be.greaterThan(0);

      provinces.forEach((province) => {
        const data = res.body[province];
        expect(data).to.be.an('array');
        expect(data).to.have.lengthOf(5);
        // [ruler, culture, religion, capital, population]
        expect(data[0]).to.be.a('string'); // ruler
        expect(data[1]).to.be.a('string'); // culture
        expect(data[2]).to.be.a('string'); // religion
        expect(data[3]).to.be.a('string'); // capital
        expect(data[4]).to.be.a('number'); // population
      });
    });
  });

  describe('# Statistics endpoint', () => {
    beforeEach(async () => {
      const allMarkers = [
        ...productionData.markers.year714,
        ...productionData.markers.year1195cp
      ];
      await Marker.collection.insertMany(allMarkers);

      const metadataDocs = [
        { _id: 'ruler', type: 'g', score: 0, data: { USA: ['United States'] }, coo: [] },
        { _id: 'culture', type: 'g', score: 0, data: { inuit: ['Inuit'] }, coo: [] },
        { _id: 'religion', type: 'g', score: 0, data: { sunni: ['Sunni'] }, coo: [] },
        { _id: 'religionGeneral', type: 'g', score: 0, data: { Islam: ['Islam'] }, coo: [] }
      ];
      await Metadata.insertMany(metadataDocs);
    });

    it('should return statistics object with marker and metadata breakdowns', async () => {
      const res = await request(app)
        .get('/v1/statistics')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('object');
      expect(res.body).to.have.property('area');
      expect(res.body).to.have.property('marker');
      expect(res.body).to.have.property('metadata');
      expect(res.body).to.have.property('user');
      expect(res.body).to.have.property('markerTotal');
      expect(res.body.markerTotal).to.be.a('number');
      expect(res.body.markerTotal).to.be.greaterThan(0);
    });

    it('should return hardcoded area statistics', async () => {
      const res = await request(app)
        .get('/v1/statistics')
        .expect(httpStatus.OK);

      expect(res.body.area).to.deep.equal({ provinces: 2479, areaDatapoints: 49580000 });
    });
  });

  describe('# Flags endpoint', () => {
    beforeEach(async () => {
      const flags = [
        { fullUrl: encodeURIComponent('markers/Battle_of_Guadalete'), subEntityId: 'wrong_date', resource: 'markers', wrongWiki: 'Battle_of_Guadalete', fixed: false },
        { fullUrl: encodeURIComponent('areas/1001/Sogn/ruler'), subEntityId: 'wrong_ruler', resource: 'areas', wrongWiki: 'Sogn', fixed: true },
        { fullUrl: encodeURIComponent('metadata/culture/inuit'), subEntityId: 'wrong_color', resource: 'metadata', wrongWiki: 'Inuit', fixed: false }
      ];
      await Flag.insertMany(flags);
    });

    it('should return list of flags', async () => {
      const res = await request(app)
        .get('/v1/flags')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      expect(res.body.length).to.equal(3);
    });

    it('should return flags with expected fields', async () => {
      const res = await request(app)
        .get('/v1/flags')
        .expect(httpStatus.OK);

      expect(res.body).to.be.an('array');
      res.body.forEach((flag) => {
        expect(flag).to.have.property('fullUrl');
        expect(flag).to.have.property('fixed');
        expect(flag).to.have.property('resource');
      });
    });

    it('should create a new flag', async () => {
      const newFlag = {
        fullUrl: encodeURIComponent('markers/Li_Bai'),
        subEntityId: 'wrong_year',
        resource: 'markers',
        wrongWiki: 'Li_Bai'
      };

      const res = await request(app)
        .post('/v1/flags')
        .send(newFlag)
        .expect(httpStatus.OK);

      expect(res.body).to.have.property('fullUrl');
      expect(res.body.fixed).to.equal(false);
    });
  });
});
