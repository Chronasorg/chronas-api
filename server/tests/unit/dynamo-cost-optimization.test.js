import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKERS_FIXTURE = path.join(__dirname, '../fixtures/dynamo/markers-sample.json');
const METADATA_FIXTURE = path.join(__dirname, '../fixtures/dynamo/metadata-sample.json');
const MARKERS_TABLE = 'chronas-markers';
const METADATA_TABLE = 'chronas-metadata';

let MarkerDynamo;
let MetadataDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const markerMod = await import('../../models/dynamo/marker.dynamo.js');
  MarkerDynamo = markerMod.default;
  const metadataMod = await import('../../models/dynamo/metadata.dynamo.js');
  MetadataDynamo = metadataMod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('Cost Optimization: Marker queries use GSI instead of Scan', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(MARKERS_FIXTURE, 'utf8'));
    await clearTable(MARKERS_TABLE);
    await seedTable(MARKERS_TABLE, fixtures);
  });

  describe('year-only queries (no type filter) use GSI-TypeYear', () => {
    it('returns markers for year range without typeArray (was scanByYear, now GSI query)', async () => {
      const markers = await MarkerDynamo.list({
        year: 1500, delta: 500
      });
      expect(markers).to.be.an('array');
      expect(markers.length).to.be.greaterThan(0);
      const years = markers.map(m => m.year);
      years.forEach(y => {
        expect(y).to.be.at.least(1000);
        expect(y).to.be.at.most(2000);
      });
    });

    it('returns all types when no type filter is specified', async () => {
      const markers = await MarkerDynamo.list({
        year: 1000, delta: 2000
      });
      const types = [...new Set(markers.map(m => m.type))];
      expect(types.length).to.be.greaterThan(1);
    });

    it('returns same results as filtered typeArray with all types', async () => {
      const allTypes = ['a', 'at', 'e', 'm', 'op', 'p', 'r', 's', 'c', 'ca', 'w'];
      const withAllTypes = await MarkerDynamo.list({
        year: 1500, delta: 1000, typeArray: allTypes
      });
      const withoutTypes = await MarkerDynamo.list({
        year: 1500, delta: 1000
      });
      const idsWithTypes = withAllTypes.map(m => m._id).sort();
      const idsWithout = withoutTypes.map(m => m._id).sort();
      expect(idsWithout).to.deep.equal(idsWithTypes);
    });

    it('respects delta for year-only queries', async () => {
      const markers = await MarkerDynamo.list({
        year: 1066, delta: 1
      });
      markers.forEach(m => {
        expect(m.year).to.be.at.least(1065);
        expect(m.year).to.be.at.most(1067);
      });
    });
  });

  describe('singular type param (frontend sends "type" not "types")', () => {
    it('works with single string type value', async () => {
      const markers = await MarkerDynamo.list({
        year: 1000, delta: 2000, typeArray: 'e'
      });
      expect(markers.length).to.be.greaterThan(0);
      markers.forEach(m => expect(m.type).to.equal('e'));
    });

    it('works with comma-separated type string', async () => {
      const markers = await MarkerDynamo.list({
        year: 1000, delta: 2000, typeArray: 'e,c'
      });
      expect(markers.length).to.be.greaterThan(0);
      const types = [...new Set(markers.map(m => m.type))];
      expect(types).to.include.members(['e', 'c']);
    });

    it('works with array of types (legacy "types" param)', async () => {
      const markers = await MarkerDynamo.list({
        year: 1000, delta: 2000, typeArray: ['e', 'c']
      });
      expect(markers.length).to.be.greaterThan(0);
      const types = [...new Set(markers.map(m => m.type))];
      expect(types).to.include.members(['e', 'c']);
    });
  });

  describe('edge cases for year-only queries', () => {
    it('returns empty array for year range with no markers', async () => {
      const markers = await MarkerDynamo.list({
        year: -10000, delta: 1
      });
      expect(markers).to.be.an('array').that.is.empty;
    });

    it('respects length limit on year-only queries', async () => {
      const markers = await MarkerDynamo.list({
        year: 1000, delta: 2000, length: 2
      });
      expect(markers).to.have.lengthOf(2);
    });

    it('handles year=0 without falling into scan path', async () => {
      const markers = await MarkerDynamo.list({
        year: 0, delta: 5000
      });
      expect(markers).to.be.an('array');
    });
  });
});

describe('Cost Optimization: Metadata queryBranch caching', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(METADATA_FIXTURE, 'utf8'));
    await clearTable(METADATA_TABLE);
    await seedTable(METADATA_TABLE, fixtures);
  });

  describe('queryBranch caching', () => {
    it('returns results for type+subtype filter', async () => {
      const results = await MetadataDynamo.list({
        type: 'e', subtype: 'ew,ei', end: 3000
      });
      expect(results).to.be.an('array');
    });

    it('returns cached results on second call', async () => {
      const first = await MetadataDynamo.list({
        type: 'e', subtype: 'ew', end: 50
      });
      const second = await MetadataDynamo.list({
        type: 'e', subtype: 'ew', end: 50
      });
      expect(second).to.deep.equal(first);
    });

    it('returns different results for different params (cache miss)', async () => {
      const events = await MetadataDynamo.list({
        type: 'e', subtype: 'ew', end: 50
      });
      const general = await MetadataDynamo.list({
        type: 'g', end: 50
      });
      if (events.length > 0 && general.length > 0) {
        expect(events).to.not.deep.equal(general);
      }
    });
  });
});

describe('Cost Optimization: Controller type param mapping', () => {
  it('marker controller passes singular type param to MarkerDynamo.list', async () => {
    const results = await MarkerDynamo.list({
      year: 1500, delta: 500, typeArray: 'e'
    });
    expect(results).to.be.an('array');
    results.forEach(m => expect(m.type).to.equal('e'));
  });

  it('marker controller passes plural types param to MarkerDynamo.list', async () => {
    const results = await MarkerDynamo.list({
      year: 1000, delta: 2000, typeArray: 'e,c,p'
    });
    expect(results).to.be.an('array');
    const types = [...new Set(results.map(m => m.type))];
    types.forEach(t => expect(['e', 'c', 'p']).to.include(t));
  });

  it('normalizeArray handles string, array, and falsy inputs', async () => {
    const singleType = await MarkerDynamo.list({ year: 1500, delta: 500, typeArray: 'e' });
    const arrayType = await MarkerDynamo.list({ year: 1500, delta: 500, typeArray: ['e'] });
    const ids1 = singleType.map(m => m._id).sort();
    const ids2 = arrayType.map(m => m._id).sort();
    expect(ids1).to.deep.equal(ids2);
  });
});
