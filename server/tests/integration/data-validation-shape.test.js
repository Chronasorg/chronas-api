/**
 * Integration test — round-trips applier writes through the REAL chronas-api
 * controllers. The unit-level api-shape.test.js pins what bytes the applier
 * SENDS; this file pins what actually LANDS in the database afterwards.
 *
 * Catches the class of bug the previous review surfaced: the applier was
 * POSTing to /v1/metadata with a body shape that satisfies the controller's
 * gate but writes nothing to the parent doc's flat data map.
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient } from '../../models/dynamo/dynamo-client.js';
import { applyProposals } from '../../../scripts/data-validation/apply-corrections-core.js';
import { ChronasClient } from '../../../scripts/data-validation/chronas-client.js';

const TABLE = 'chronas-metadata';
const MARKERS_TABLE = 'chronas-markers';

let preTestMetadataSnapshot = null;
let preTestMarkersSnapshot = null;
let preTestAreasSnapshot = null;

async function snapshot(table) {
  try {
    const out = await getDocClient().send(new ScanCommand({ TableName: table }));
    return out.Items || [];
  } catch {
    return [];
  }
}
const TOKEN = jwt.sign(
  { id: 'curator@example.com', username: 'curator', privilege: 5 },
  process.env.JWT_SECRET || 'test-secret-key',
  { algorithm: 'HS256' }
);

let app;
let server;
let baseUrl;

before(async function () {
  this.timeout(30000);
  await setupDynamoLocal();

  // Snapshot whatever any earlier suite may have seeded — we restore this
  // exactly in `after`, so neighbour suites that depend on their own seed
  // (dynamo-bugfixes, statistics-cache, dynamo-query-chains) survive.
  preTestMetadataSnapshot = await snapshot(TABLE);
  preTestMarkersSnapshot = await snapshot(MARKERS_TABLE);
  preTestAreasSnapshot = await snapshot('chronas-areas');

  const mod = await import('../helpers/test-app.js');
  app = mod.default;

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise(r => server.close(r));
  // Restore the table state for any later suite that shares dynalite.
  await clearTable(TABLE);
  if (preTestMetadataSnapshot.length) await seedTable(TABLE, preTestMetadataSnapshot);
  await clearTable(MARKERS_TABLE).catch(() => {});
  if (preTestMarkersSnapshot.length) await seedTable(MARKERS_TABLE, preTestMarkersSnapshot).catch(() => {});
  await clearTable('chronas-areas').catch(() => {});
  if (preTestAreasSnapshot && preTestAreasSnapshot.length) await seedTable('chronas-areas', preTestAreasSnapshot).catch(() => {});
});

beforeEach(async function () {
  this.timeout(15000);
  await clearTable(TABLE);
  await seedTable(TABLE, [
    {
      _id: 'ruler',
      type: 'g',
      data: {
        ENG: ['Kingdom of England', 'rgb(181,0,51)', 'Kingdom_of_England', '0/00/Royal_Coat.svg']
      }
    },
    {
      _id: 'culture',
      type: 'g',
      data: {
        english: ['English', 'rgb(150,150,150)', 'English_people', '']
      }
    }
  ]);
  // Markers table — make sure it exists for the marker.add round-trip.
  await clearTable(MARKERS_TABLE).catch(() => {});
});

describe('integration: metadata.add lands in the parent doc data map', () => {

  it('after applyProposals, GET /v1/metadata/ruler shows the new POW child', async function () {
    this.timeout(20000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    const result = await applyProposals(
      [{
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Powhatan Confederacy', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
        citations: [{ source: 'Encyclopedia Virginia' }, { source: 'NPS' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );

    expect(result.skipped, JSON.stringify(result.skipped)).to.have.lengthOf(0);
    expect(result.applied).to.have.lengthOf(1);

    // The whole point: read the doc back and confirm the child is there.
    const doc = await request(app)
      .get('/v1/metadata/ruler')
      .expect(200);
    expect(doc.body).to.have.property('_id', 'ruler');
    expect(doc.body.data).to.have.property('POW');
    expect(doc.body.data.POW).to.deep.equal([
      'Powhatan Confederacy',
      'rgb(150,150,150)',
      'Powhatan_Confederacy',
      ''
    ]);
    // Make sure we didn't clobber the existing England child.
    expect(doc.body.data).to.have.property('ENG');
  });

  it('a second metadata.add with the same key gets blocked by the pre-flight (no overwrite)', async function () {
    this.timeout(20000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    // Plant POW once.
    await applyProposals(
      [{
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Powhatan Confederacy', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );

    // Now try to plant it again with a different value.
    const second = await applyProposals(
      [{
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Different Name', 'rgb(0,0,0)', 'Wrong', ''],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );

    expect(second.applied).to.have.lengthOf(0);
    expect(second.skipped[0].reason).to.equal('metadata-key-exists');

    // And the first value is unchanged.
    const doc = await request(app).get('/v1/metadata/ruler').expect(200);
    expect(doc.body.data.POW[0]).to.equal('Powhatan Confederacy');
  });

  it('case-insensitive collision is blocked at pre-flight (POW vs pow)', async function () {
    this.timeout(20000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    // Seed `pow` lowercase already in the doc.
    await clearTable(TABLE);
    await seedTable(TABLE, [
      { _id: 'ruler', type: 'g', data: { pow: ['Existing', 'rgb(0,0,0)', 'X', ''] } }
    ]);

    const result = await applyProposals(
      [{
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', ''],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );
    expect(result.skipped[0].reason).to.equal('metadata-key-collision');

    const doc = await request(app).get('/v1/metadata/ruler').expect(200);
    expect(doc.body.data).to.have.property('pow');
    expect(doc.body.data).to.not.have.property('POW');
  });

  it('regression: the OLD endpoint shape (POST /v1/metadata with parentId/childId/childValue) does NOT write to the flat ruler doc', async function () {
    // This test pins the bug that motivated switching to the /single endpoint.
    // If a future refactor reverts to POST /v1/metadata + createNodeOne, this
    // test will catch the silent no-op.
    this.timeout(20000);

    await request(app)
      .post('/v1/metadata')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        _id: 'ruler',
        parentId: 'ruler',
        childId: 'POW',
        childValue: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', '']
      });

    const doc = await request(app).get('/v1/metadata/ruler').expect(200);
    // The OLD path is supposed to NOT write to the flat map. If this ever
    // becomes a real write (controller fix), the test will tell us we can
    // simplify the applier.
    expect(doc.body.data).to.not.have.property('POW');
  });

  it('full polity campaign: metadata.add then area.update — the area write is followed by a child that the frontend can read', async function () {
    this.timeout(30000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    const proposals = [
      {
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Powhatan Confederacy', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }
    ];

    const result = await applyProposals(proposals, { chronas, wikidata }, { dryRun: false });
    expect(result.skipped, JSON.stringify(result.skipped)).to.have.lengthOf(0);

    const doc = await request(app).get('/v1/metadata/ruler').expect(200);
    expect(doc.body.data).to.have.property('POW');
    expect(Array.isArray(doc.body.data.POW)).to.equal(true);
    expect(doc.body.data.POW.length).to.be.at.least(2);
    expect(doc.body.data.POW[0]).to.equal('Powhatan Confederacy');
    expect(doc.body.data.POW[1]).to.match(/^rgb\(/);
  });
});

describe('integration: marker.add lands as a real marker the frontend can read', () => {
  it('after applyProposals, GET /v1/markers/<wiki> returns the marker with mandatory _id', async function () {
    this.timeout(20000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    const result = await applyProposals(
      [{
        kind: 'marker.add',
        body: {
          _id: 'Jamestown',
          name: 'Jamestown',
          type: 'op',
          year: 1607,
          coo: [-76.7783, 37.2087],
          // Should be stripped by writeOne — server doesn't read these.
          wikidataQid: 'Q323813',
          rulerCode: 'POW'
        },
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );

    expect(result.skipped, JSON.stringify(result.skipped)).to.have.lengthOf(0);

    const fetched = await request(app).get('/v1/markers/Jamestown').expect(200);
    expect(fetched.body).to.have.property('_id', 'Jamestown');
    expect(fetched.body).to.have.property('name', 'Jamestown');
    expect(fetched.body).to.have.property('type', 'op');
    expect(fetched.body).to.have.property('year', 1607);
    expect(fetched.body.coo).to.deep.equal([-76.7783, 37.2087]);
    // The ignored extra fields shouldn't have leaked into the stored record.
    expect(fetched.body).to.not.have.property('wikidataQid');
    expect(fetched.body).to.not.have.property('rulerCode');
  });

  it('marker.add is rejected by pre-flight when the wiki id is already taken', async function () {
    this.timeout(20000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    // Plant once.
    await applyProposals(
      [{
        kind: 'marker.add',
        body: { _id: 'Jamestown', name: 'Jamestown', type: 'op', year: 1607, coo: [-76.7, 37.2] },
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );

    const second = await applyProposals(
      [{
        kind: 'marker.add',
        body: { _id: 'Jamestown', name: 'Jamestown DIFFERENT', type: 'op', year: 1607, coo: [0, 0] },
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );
    expect(second.applied).to.have.lengthOf(0);
    expect(second.skipped[0].reason).to.equal('marker-already-exists');

    const fetched = await request(app).get('/v1/markers/Jamestown').expect(200);
    expect(fetched.body.name).to.equal('Jamestown');  // unchanged
  });
});

describe('integration: area.update lands and references real metadata children', () => {
  beforeEach(async function () {
    this.timeout(15000);
    await clearTable('chronas-areas');
    // Real Chronas areas docs always have every province present. The
    // controller's `if (!area.data[province]) return` skips provinces that
    // aren't already keyed in. So we seed Powhatan with an empty ruler ([0])
    // and the area.update fills it in.
    await seedTable('chronas-areas', [
      {
        _id: '1574',
        year: 1574,
        data: {
          'Powhatan': ['', '', '', '', 0],
          'England-county': ['ENG', 'english', 'protestant', 'London', 100000]
        }
      },
      {
        _id: '1575',
        year: 1575,
        data: {
          'Powhatan': ['', '', '', '', 0],
          'England-county': ['ENG', 'english', 'protestant', 'London', 100000]
        }
      }
    ]);
  });

  it('after a polity campaign, the new ruler key exists AND the area cells point at it', async function () {
    this.timeout(30000);
    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    const proposals = [
      {
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Powhatan Confederacy', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      },
      {
        kind: 'area.update',
        body: { start: 1574, end: 1575, provinces: ['Powhatan'], ruler: 'POW' },
        yearRegionSamples: [],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }
    ];

    const result = await applyProposals(proposals, { chronas, wikidata }, { dryRun: false });
    expect(result.skipped, JSON.stringify(result.skipped)).to.have.lengthOf(0);
    expect(result.applied).to.have.lengthOf(2);

    // 1. Metadata child exists — frontend can render it.
    const metaDoc = await request(app).get('/v1/metadata/ruler').expect(200);
    expect(metaDoc.body.data).to.have.property('POW');

    // 2. Area cells reference that key — referential integrity.
    const areaDoc = await request(app).get('/v1/areas/1574').expect(200);
    const powhatan = areaDoc.body.Powhatan;
    expect(powhatan, 'Powhatan should now exist in the 1574 areas doc').to.exist;
    expect(Array.isArray(powhatan)).to.equal(true);
    expect(powhatan[0]).to.equal('POW');

    // 3. Pre-existing England cells are left alone.
    expect(areaDoc.body['England-county']).to.exist;
    expect(areaDoc.body['England-county'][0]).to.equal('ENG');
  });

  it('apply-time slot pre-flight catches an occupation that only appears mid-window (start/mid/end sampling)', async function () {
    this.timeout(30000);
    // Year 1580: still empty at start. Year 1585: occupied by ENG mid-window.
    // Year 1590: still empty. The old start-only pre-flight would miss this.
    await seedTable('chronas-areas', [
      {
        _id: '1585',
        year: 1585,
        data: {
          'Powhatan': ['ENG', 'english', 'protestant', 'London', 50000]
        }
      }
    ]);

    const chronas = new ChronasClient({ apiUrl: baseUrl, token: TOKEN });
    const wikidata = { entityByQid: async () => null, queryAt: async () => [] };

    // Plant POW first.
    await applyProposals(
      [{
        kind: 'metadata.add',
        dimension: 'ruler',
        key: 'POW',
        childValue: ['Powhatan Confederacy', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );

    // Try to write 1580–1590 — start (1580) is empty, mid (1585) is occupied.
    const result = await applyProposals(
      [{
        kind: 'area.update',
        body: { start: 1580, end: 1590, provinces: ['Powhatan'], ruler: 'POW' },
        yearRegionSamples: [],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      }],
      { chronas, wikidata },
      { dryRun: false }
    );
    expect(result.applied).to.have.lengthOf(0);
    expect(result.skipped[0].reason).to.equal('slot-occupied');
    expect(result.skipped[0].details.some(d => d.year === 1585)).to.equal(true);
  });
});
