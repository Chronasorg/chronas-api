import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/areas-sample.json');
const TABLE = 'chronas-areas';

let AreaDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  // Force USE_DYNAMODB_AREAS so the switch file loads the dynamo model.
  process.env.USE_DYNAMODB_AREAS = 'true';
  const mod = await import('../../models/dynamo/area.dynamo.js');
  AreaDynamo = mod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('AreaDynamo (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('.findById()', () => {
    it('returns area doc by year string', async () => {
      const area = await AreaDynamo.findById('1000');
      expect(area).to.not.be.null;
      expect(area._id).to.equal('1000');
      expect(area.year).to.equal(1000);
      expect(area.data).to.have.property('Kiev');
      expect(area.data.Kiev[0]).to.equal('RUS');
    });

    it('returns null for non-existent year', async () => {
      const area = await AreaDynamo.findById('9999');
      expect(area).to.be.null;
    });

    it('handles negative year (BCE)', async () => {
      const area = await AreaDynamo.findById('-2000');
      expect(area).to.not.be.null;
      expect(area.year).to.equal(-2000);
      expect(area.data).to.have.property('Lower_Egypt');
    });

    it('handles year 0', async () => {
      const area = await AreaDynamo.findById('0');
      expect(area).to.not.be.null;
      expect(area.year).to.equal(0);
      expect(area.data).to.have.property('Italia');
    });
  });

  describe('.get()', () => {
    it('returns area for valid id', async () => {
      const area = await AreaDynamo.get('2000');
      expect(area._id).to.equal('2000');
      expect(area.data).to.have.property('Bohemia');
    });

    it('throws NotFound for missing id', async () => {
      try {
        await AreaDynamo.get('9999');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/no such area/i);
      }
    });
  });

  describe('.findOne()', () => {
    it('finds by year number (converted to string key)', async () => {
      const area = await AreaDynamo.findOne({ year: 1500 });
      expect(area).to.not.be.null;
      expect(area._id).to.equal('1500');
      expect(area.data).to.have.property('Castile');
    });

    it('returns null for non-existent year', async () => {
      const area = await AreaDynamo.findOne({ year: 8888 });
      expect(area).to.be.null;
    });
  });

  describe('new AreaDynamo().save()', () => {
    it('creates a new area and retrieves it', async () => {
      const newArea = new AreaDynamo({
        _id: '1234',
        year: 1234,
        data: { TestProvince: ['TST', 'test_culture', 'test_religion', 'TestCity', 100] }
      });
      await newArea.save();

      const fetched = await AreaDynamo.findById('1234');
      expect(fetched).to.not.be.null;
      expect(fetched.year).to.equal(1234);
      expect(fetched.data.TestProvince[0]).to.equal('TST');
    });

    it('overwrites existing area on save', async () => {
      const area = await AreaDynamo.findById('1000');
      area.data.Kiev[0] = 'MODIFIED';
      await area.save();

      const refetched = await AreaDynamo.findById('1000');
      expect(refetched.data.Kiev[0]).to.equal('MODIFIED');
    });
  });

  describe('.deleteOne()', () => {
    it('deletes an existing area', async () => {
      const area = await AreaDynamo.findById('1947');
      expect(area).to.not.be.null;
      await area.deleteOne();

      const deleted = await AreaDynamo.findById('1947');
      expect(deleted).to.be.null;
    });
  });

  describe('.find()', () => {
    it('returns all areas via scan when no filter', async () => {
      const areas = await AreaDynamo.find().exec();
      expect(areas).to.have.lengthOf(fixtures.length);
    });

    it('supports .lean() (returns plain objects)', async () => {
      const areas = await AreaDynamo.find().lean().exec();
      expect(areas).to.have.lengthOf(fixtures.length);
      expect(areas[0]).to.not.be.instanceOf(AreaDynamo);
    });

    it('supports .limit()', async () => {
      const areas = await AreaDynamo.find().limit(2).exec();
      expect(areas).to.have.lengthOf(2);
    });
  });

  describe('.toObject() and .markModified()', () => {
    it('toObject returns plain data', async () => {
      const area = await AreaDynamo.findById('1000');
      const obj = area.toObject();
      expect(obj._id).to.equal('1000');
      expect(typeof obj.save).to.not.equal('function');
    });

    it('markModified is a no-op (does not throw)', async () => {
      const area = await AreaDynamo.findById('1000');
      area.markModified('data');
    });
  });
});
