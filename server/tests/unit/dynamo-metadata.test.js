import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { compressData, shouldCompress } from '../../models/dynamo/compression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/metadata-sample.json');
const TABLE = 'chronas-metadata';

let MetadataDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/metadata.dynamo.js');
  MetadataDynamo = mod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('MetadataDynamo (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('.findById()', () => {
    it('returns metadata by string ID', async () => {
      const m = await MetadataDynamo.findById('ruler');
      expect(m).to.not.be.null;
      expect(m.type).to.equal('g');
      expect(m.data).to.have.property('RUS');
    });

    it('returns null for non-existent ID', async () => {
      const m = await MetadataDynamo.findById('nonexistent');
      expect(m).to.be.null;
    });

    it('returns event metadata with year and subtype', async () => {
      const m = await MetadataDynamo.findById('e_Battle_of_Hastings');
      expect(m.year).to.equal(1066);
      expect(m.subtype).to.equal('ew');
      expect(m.data.participants).to.be.an('array');
    });
  });

  describe('.get()', () => {
    it('returns metadata for valid id', async () => {
      const m = await MetadataDynamo.get('culture');
      expect(m.data).to.have.property('east_slavic');
    });

    it('throws for missing id', async () => {
      try {
        await MetadataDynamo.get('nonexistent');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/no such metadata/i);
      }
    });
  });

  describe('.list() — fList branch', () => {
    it('returns init bundle with data keyed by _id', async () => {
      const result = await MetadataDynamo.list({
        fList: 'ruler,culture,religion'
      });
      expect(result).to.have.property('ruler');
      expect(result).to.have.property('culture');
      expect(result).to.have.property('religion');
      expect(result.ruler).to.have.property('RUS');
    });

    it('caches the result', async () => {
      const r1 = await MetadataDynamo.list({ fList: 'ruler,culture' });
      const r2 = await MetadataDynamo.list({ fList: 'ruler,culture' });
      expect(r1).to.deep.equal(r2);
    });
  });

  describe('.list() — type/subtype/year query branch', () => {
    it('returns events by type and year range', async () => {
      const items = await MetadataDynamo.list({
        type: 'e', year: 1300, delta: 500
      });
      expect(items).to.be.an('array');
      const ids = items.map(i => i._id || i);
      expect(ids).to.include('e_Battle_of_Hastings');
      expect(ids).to.include('e_Fall_of_Constantinople');
    });

    it('returns search results as ID array', async () => {
      const items = await MetadataDynamo.list({
        type: 'e', search: 'Constantinople'
      });
      expect(items).to.be.an('array');
      expect(items).to.include('e_Fall_of_Constantinople');
    });
  });

  describe('.list() — default branch', () => {
    it('returns truncated data strings', async () => {
      const items = await MetadataDynamo.list({ start: 0, end: 3 });
      expect(items).to.be.an('array');
      expect(items.length).to.be.at.most(3);
    });
  });

  describe('.find({_id: {$in: [...]}}) — BatchGetProxy', () => {
    it('returns multiple items by ID array', async () => {
      const items = await MetadataDynamo.find({
        _id: { $in: ['ruler', 'culture', 'religion'] }
      }).lean().exec();
      expect(items).to.have.lengthOf(3);
      const ids = items.map(i => i._id);
      expect(ids).to.include.members(['ruler', 'culture', 'religion']);
    });

    it('returns items as MetadataDynamo instances when not lean', async () => {
      const items = await MetadataDynamo.find({
        _id: { $in: ['ruler'] }
      }).exec();
      expect(items[0]).to.be.instanceOf(MetadataDynamo);
    });
  });

  describe('.aggregate() — statistics support', () => {
    it('groups by type field', async () => {
      const result = await MetadataDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
      expect(result).to.be.an('array');
      const gType = result.find(r => r._id === 'g');
      expect(gType).to.not.be.undefined;
      expect(gType.count).to.be.greaterThan(0);
    });

    it('groups by subtype field', async () => {
      const result = await MetadataDynamo.aggregate([{ $group: { _id: '$subtype', count: { $sum: 1 } } }]);
      expect(result).to.be.an('array');
      const ewType = result.find(r => r._id === 'ew');
      expect(ewType).to.not.be.undefined;
      expect(ewType.count).to.equal(2);
    });

    it('supports .exec().then() chain (statistics controller pattern)', async () => {
      const result = await MetadataDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec();
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('compression round-trip', () => {
    it('saves and retrieves a large compressed item transparently', async () => {
      const bigData = { features: Array.from({ length: 3000 }, (_, i) => ({ id: i, name: 'x'.repeat(100) })) };
      expect(shouldCompress(bigData)).to.equal(true);

      const m = new MetadataDynamo({
        _id: 'provinces_test',
        type: 'g',
        data: bigData
      });
      await m.save();

      const fetched = await MetadataDynamo.findById('provinces_test');
      expect(fetched.data.features).to.have.lengthOf(3000);
      expect(fetched.data.features[0].name).to.equal('x'.repeat(100));
    });
  });

  describe('new MetadataDynamo().save() + CRUD', () => {
    it('creates and retrieves metadata', async () => {
      const m = new MetadataDynamo({
        _id: 'new_test', type: 'i', subtype: 'test',
        year: 2026, score: 0, data: { created: true }
      });
      await m.save();
      const fetched = await MetadataDynamo.findById('new_test');
      expect(fetched.data.created).to.equal(true);
    });

    it('updates existing metadata via save', async () => {
      const m = await MetadataDynamo.findById('test_metadata');
      m.data.updated = true;
      m.markModified('data');
      await m.save();
      const fetched = await MetadataDynamo.findById('test_metadata');
      expect(fetched.data.updated).to.equal(true);
    });

    it('deletes metadata', async () => {
      const m = await MetadataDynamo.findById('test_metadata');
      await m.deleteOne();
      expect(await MetadataDynamo.findById('test_metadata')).to.be.null;
    });
  });
});
