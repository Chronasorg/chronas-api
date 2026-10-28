import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/revisions-sample.json');
const TABLE = 'chronas-revisions';

let RevisionDynamo;
let STATS_ID;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/revision.dynamo.js');
  RevisionDynamo = mod.default;
  STATS_ID = mod.STATS_ID;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('RevisionDynamo (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('.findById()', () => {
    it('returns revision by UUID', async () => {
      const r = await RevisionDynamo.findById('rev-001');
      expect(r).to.not.be.null;
      expect(r.type).to.equal('PUT');
      expect(r.entityId).to.equal('Battle_of_Hastings');
      expect(r.user).to.equal('admin@chronas.org');
    });

    it('returns null for non-existent revision', async () => {
      expect(await RevisionDynamo.findById('nonexistent')).to.be.null;
    });
  });

  describe('.get()', () => {
    it('returns revision for valid id', async () => {
      const r = await RevisionDynamo.get('rev-003');
      expect(r.resource).to.equal('areas');
      expect(r.subEntityId).to.equal('Kiev');
    });

    it('throws for missing revision', async () => {
      try {
        await RevisionDynamo.get('nonexistent');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/no such revision/i);
      }
    });
  });

  describe('.findOne({entityId})', () => {
    it('finds latest revision for entity via GSI', async () => {
      const r = await RevisionDynamo.findOne({ entityId: 'Battle_of_Hastings' });
      expect(r).to.not.be.null;
      expect(r._id).to.equal('rev-001');
    });

    it('returns null for entity with no revisions', async () => {
      const r = await RevisionDynamo.findOne({ entityId: 'nonexistent_entity' });
      expect(r).to.be.null;
    });
  });

  describe('new RevisionDynamo().save()', () => {
    it('creates a revision with auto-generated UUID', async () => {
      const r = new RevisionDynamo({
        type: 'POST', entityId: 'new_marker',
        resource: 'markers', user: 'testuser@test.de',
        nextBody: { name: 'New Marker' }
      });
      await r.save();
      expect(r._id).to.be.a('string').with.length.greaterThan(0);

      const fetched = await RevisionDynamo.findById(r._id);
      expect(fetched.entityId).to.equal('new_marker');
      expect(fetched.timestamp).to.be.a('string');
      expect(typeof fetched.nextBody).to.equal('string');
    });

    it('stringifies object nextBody/prevBody', async () => {
      const r = new RevisionDynamo({
        type: 'PUT', entityId: 'test',
        resource: 'markers', user: 'admin@chronas.org',
        nextBody: { key: 'val' }, prevBody: { key: 'old' }
      });
      await r.save();
      const fetched = await RevisionDynamo.findById(r._id);
      expect(JSON.parse(fetched.nextBody)).to.deep.equal({ key: 'val' });
      expect(JSON.parse(fetched.prevBody)).to.deep.equal({ key: 'old' });
    });
  });

  describe('.aggregate() — statistics', () => {
    it('groups by type', async () => {
      const result = await RevisionDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
      expect(result).to.be.an('array');
      const puts = result.find(r => r._id === 'PUT');
      expect(puts.count).to.equal(3);
    });

    it('supports .exec().then() chain (statistics controller pattern)', async () => {
      const result = await RevisionDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec();
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('lastEdit summary item', () => {
    const save = (timestamp) => new RevisionDynamo({ type: 'PUT', entityId: 'x', resource: 'markers', user: 'u', timestamp }).save();

    it('returns null before any revision is saved through the model', async () => {
      expect(await RevisionDynamo.lastEdit()).to.be.null;
    });

    it('save() records the newest timestamp', async () => {
      await save('2026-05-01T00:00:00Z');
      expect(await RevisionDynamo.lastEdit()).to.equal('2026-05-01T00:00:00Z');
      await save('2026-06-01T00:00:00Z');
      expect(await RevisionDynamo.lastEdit()).to.equal('2026-06-01T00:00:00Z');
    });

    it('an older revision does not move lastEdit back', async () => {
      await save('2026-06-01T00:00:00Z');
      await save('2026-05-01T00:00:00Z');
      expect(await RevisionDynamo.lastEdit()).to.equal('2026-06-01T00:00:00Z');
    });

    it('save() without a timestamp records the generated one', async () => {
      const r = await new RevisionDynamo({ type: 'PUT', entityId: 'x', resource: 'markers', user: 'u' }).save();
      const stored = await RevisionDynamo.findById(r._id);
      expect(await RevisionDynamo.lastEdit()).to.equal(stored.timestamp);
    });

    it('is hidden from findById, find, countDocuments and aggregate', async () => {
      await save('2026-05-01T00:00:00Z');
      expect(await RevisionDynamo.findById(STATS_ID)).to.be.null;
      const all = await RevisionDynamo.find().lean().exec();
      expect(all.map(r => r._id)).to.not.include(STATS_ID);
      expect(all).to.have.length(fixtures.length + 1);
      expect(await RevisionDynamo.countDocuments().exec()).to.equal(fixtures.length + 1);
      const groups = await RevisionDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec();
      expect(groups.find(g => g._id === null)).to.be.undefined;
      expect(groups.reduce((a, g) => a + g.count, 0)).to.equal(fixtures.length + 1);
    });
  });

  describe('.list() — stubbed', () => {
    it('throws NotImplementedError', () => {
      expect(() => RevisionDynamo.list()).to.throw(/NotImplemented/);
    });
  });
});
