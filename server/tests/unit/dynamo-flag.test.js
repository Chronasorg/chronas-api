import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/flags-sample.json');
const TABLE = 'chronas-flags';

let FlagDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/flag.dynamo.js');
  FlagDynamo = mod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('FlagDynamo (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('.findById()', () => {
    it('returns flag by ID', async () => {
      const f = await FlagDynamo.findById('flag-001');
      expect(f).to.not.be.null;
      expect(f.resource).to.equal('markers');
    });
  });

  describe('.get()', () => {
    it('throws for missing flag', async () => {
      try {
        await FlagDynamo.get('nonexistent');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/no such flag/i);
      }
    });
  });

  describe('.findOne()', () => {
    it('finds by fullUrl via GSI', async () => {
      const f = await FlagDynamo.findOne({ fullUrl: '%2Fv1%2Fmarkers%2FBattle_of_Hastings' });
      expect(f).to.not.be.null;
      expect(f._id).to.equal('flag-001');
    });

    it('returns null for non-existent fullUrl', async () => {
      const f = await FlagDynamo.findOne({ fullUrl: 'nonexistent' });
      expect(f).to.be.null;
    });
  });

  describe('.list()', () => {
    it('returns all flags with default params', async () => {
      const flags = await FlagDynamo.list();
      expect(flags).to.have.lengthOf(5);
    });

    it('decodes fullUrl in returned items', async () => {
      const flags = await FlagDynamo.list();
      const f1 = flags.find(f => f._id === 'flag-001');
      expect(f1.fullUrl).to.equal('/v1/markers/Battle_of_Hastings');
    });

    it('filters by fixed status', async () => {
      const flags = await FlagDynamo.list({ fixed: true });
      expect(flags.length).to.equal(2);
      flags.forEach(f => expect(f.fixed).to.equal(true));
    });

    it('respects pagination', async () => {
      const page = await FlagDynamo.list({ start: 0, end: 2 });
      expect(page).to.have.lengthOf(2);
    });
  });

  describe('new FlagDynamo().save()', () => {
    it('creates a new flag with auto-generated ID', async () => {
      const f = new FlagDynamo({
        fullUrl: '%2Fv1%2Ftest',
        resource: 'test',
        fixed: false
      });
      await f.save();
      expect(f._id).to.be.a('string').with.length.greaterThan(0);
      const fetched = await FlagDynamo.findById(f._id);
      expect(fetched.resource).to.equal('test');
    });
  });

  describe('.deleteOne()', () => {
    it('removes a flag', async () => {
      const f = await FlagDynamo.findById('flag-003');
      await f.deleteOne();
      expect(await FlagDynamo.findById('flag-003')).to.be.null;
    });
  });
});
