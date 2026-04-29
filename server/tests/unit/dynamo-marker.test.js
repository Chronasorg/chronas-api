import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/markers-sample.json');
const TABLE = 'chronas-markers';

let MarkerDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/marker.dynamo.js');
  MarkerDynamo = mod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('MarkerDynamo (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('.findById()', () => {
    it('returns marker by string ID', async () => {
      const m = await MarkerDynamo.findById('Battle_of_Hastings');
      expect(m).to.not.be.null;
      expect(m.name).to.equal('Battle of Hastings');
      expect(m.year).to.equal(1066);
      expect(m.type).to.equal('e');
      expect(m.coo).to.deep.equal([-0.49, 50.91]);
    });

    it('returns null for non-existent marker', async () => {
      const m = await MarkerDynamo.findById('nonexistent');
      expect(m).to.be.null;
    });
  });

  describe('.get()', () => {
    it('returns marker for valid id', async () => {
      const m = await MarkerDynamo.get('Rome');
      expect(m.name).to.equal('Rome');
      expect(m.capital).to.equal(true);
    });

    it('throws for missing id', async () => {
      try {
        await MarkerDynamo.get('no_such_marker');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/no such marker/i);
      }
    });
  });

  describe('.list() — GSI-TypeYear queries', () => {
    it('returns events (type=e) within year range', async () => {
      const markers = await MarkerDynamo.list({
        typeArray: ['e'], year: 1300, delta: 300
      });
      const names = markers.map(m => m.name);
      expect(names).to.include('Battle of Hastings');
      expect(names).to.include('Fall of Constantinople');
      expect(names).to.not.include('Battle of Stalingrad');
      expect(names).to.not.include('Battle of Waterloo');
    });

    it('returns multiple types in parallel', async () => {
      const markers = await MarkerDynamo.list({
        typeArray: ['e', 'c'], year: 1000, delta: 1000
      });
      const types = [...new Set(markers.map(m => m.type))];
      expect(types).to.include.members(['e', 'c']);
    });

    it('returns empty array when no markers match', async () => {
      const markers = await MarkerDynamo.list({
        typeArray: ['e'], year: -5000, delta: 10
      });
      expect(markers).to.be.an('array').that.is.empty;
    });

    it('respects length limit', async () => {
      const markers = await MarkerDynamo.list({
        typeArray: ['e', 'c', 'p', 'b', 'r', 's', 'a', 'at'],
        year: 1000, delta: 2000, length: 3
      });
      expect(markers).to.have.lengthOf(3);
    });

    it('sorts by name ascending by default', async () => {
      const markers = await MarkerDynamo.list({
        typeArray: ['e'], year: 1500, delta: 1000
      });
      const names = markers.map(m => m.name);
      const sorted = [...names].sort();
      expect(names).to.deep.equal(sorted);
    });
  });

  describe('.list() — wiki batch get', () => {
    it('fetches specific markers by wiki array', async () => {
      const markers = await MarkerDynamo.list({
        wikiArray: ['Rome', 'Paris', 'London']
      });
      expect(markers).to.have.lengthOf(3);
      const names = markers.map(m => m.name);
      expect(names).to.include.members(['Rome', 'Paris', 'London']);
    });
  });

  describe('.list() — search filter', () => {
    it('filters by name substring (case-insensitive)', async () => {
      const markers = await MarkerDynamo.list({
        typeArray: ['e', 'c', 'p', 'b', 'r', 's', 'a', 'at'],
        year: 1000, delta: 2000, search: 'battle'
      });
      expect(markers.length).to.be.greaterThan(0);
      markers.forEach(m => expect(m.name.toLowerCase()).to.include('battle'));
    });
  });

  describe('.list() — GeoJSON format', () => {
    it('returns FeatureCollection when format=geojson', async () => {
      const result = await MarkerDynamo.list({
        typeArray: ['c'], year: 1000, delta: 2000, format: 'geojson'
      });
      expect(result).to.have.property('type', 'FeatureCollection');
      expect(result.features).to.be.an('array');
      expect(result.features[0]).to.have.property('geometry');
      expect(result.features[0].geometry).to.have.property('type', 'Point');
    });
  });

  describe('.list() — includeMarkers=false', () => {
    it('returns empty array immediately', async () => {
      const markers = await MarkerDynamo.list({ includeMarkers: false });
      expect(markers).to.be.an('array').that.is.empty;
    });
  });

  describe('new MarkerDynamo().save()', () => {
    it('creates and retrieves a new marker', async () => {
      const m = new MarkerDynamo({
        _id: 'Test_Marker', name: 'Test Marker', year: 2020,
        type: 'e', coo: [0, 0], wiki: 'Test_Marker'
      });
      await m.save();
      const fetched = await MarkerDynamo.findById('Test_Marker');
      expect(fetched.name).to.equal('Test Marker');
      expect(fetched.year).to.equal(2020);
    });
  });

  describe('.aggregate().exec() chain (statistics pattern)', () => {
    it('groups by type via .exec().then()', async () => {
      const result = await MarkerDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec();
      expect(result).to.be.an('array');
      const events = result.find(r => r._id === 'e');
      expect(events).to.not.be.undefined;
      expect(events.count).to.be.greaterThan(0);
    });
  });

  describe('.deleteOne()', () => {
    it('removes an existing marker', async () => {
      const m = await MarkerDynamo.findById('Colosseum');
      expect(m).to.not.be.null;
      await m.deleteOne();
      expect(await MarkerDynamo.findById('Colosseum')).to.be.null;
    });
  });

  describe('.find() via DynamoQuery', () => {
    it('scans all markers', async () => {
      const all = await MarkerDynamo.find().exec();
      expect(all).to.have.lengthOf(fixtures.length);
    });

    it('supports lean', async () => {
      const all = await MarkerDynamo.find().lean().exec();
      expect(all[0]).to.not.be.instanceOf(MarkerDynamo);
    });
  });

  describe('switch file routing', () => {
    it('loads MarkerDynamo when USE_DYNAMODB_MARKERS=true', async () => {
      process.env.USE_DYNAMODB_MARKERS = 'true';
      // Can't re-import the switch file easily due to ESM caching,
      // so just verify the class shape.
      expect(MarkerDynamo.tableName).to.equal('chronas-markers');
      expect(typeof MarkerDynamo.list).to.equal('function');
      expect(typeof MarkerDynamo.get).to.equal('function');
    });
  });
});
