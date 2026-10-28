import { expect } from 'chai';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { prepareForWrite } from '../../models/dynamo/compression.js';
import DynamoQuery from '../../models/dynamo/dynamo-query.js';

// Scan-backed metadata lists read only the fields they filter, sort and page
// by, then load full items for the requested page (2026-10-28: a scan that
// returned full `ap` items held 268 MB of heap, and three at once ended the
// process). These tests pin the results and the bounds.

const TABLE = 'chronas-metadata';

let MetadataDynamo;
let metadataCache;
const ops = { counts: {}, scanInputs: [], scansInFlight: 0, maxScansInFlight: 0 };

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/metadata.dynamo.js');
  MetadataDynamo = mod.default;
  ({ metadataCache } = mod);
});

after(async () => {
  await teardownDynamoLocal();
});

// Wrapped per test: other test files replace the shared doc client.
function instrument() {
  const docClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
  ops.counts = {};
  ops.scanInputs = [];
  ops.scansInFlight = 0;
  ops.maxScansInFlight = 0;
  if (docClient.__listMemoryWrapped) return;
  const realSend = docClient.send.bind(docClient);
  docClient.send = async (command, ...rest) => {
    const name = command?.constructor?.name || 'Unknown';
    ops.counts[name] = (ops.counts[name] || 0) + 1;
    if (name !== 'ScanCommand') return realSend(command, ...rest);
    ops.scanInputs.push(command.input);
    ops.scansInFlight++;
    ops.maxScansInFlight = Math.max(ops.maxScansInFlight, ops.scansInFlight);
    try {
      return await realSend(command, ...rest);
    } finally {
      ops.scansInFlight--;
    }
  };
  docClient.__listMemoryWrapped = true;
}

// Province-timeline shaped items: year-keyed one-entry maps.
function timeline(seed) {
  return {
    capital: [{ '-200': `cap${seed}` }, { 500: `mid${seed}` }, { 1000: `late${seed}` }],
    ruler: [{ 1: `r${seed}` }, { 800: `k${seed}` }]
  };
}

const ITEMS = [
  { _id: 'tt_b', type: 'tt', score: 3, name: 'Bravo', coo: [1, 2], data: timeline(1) },
  { _id: 'tt_a', type: 'tt', score: 3, name: 'Alpha', data: timeline(2) },
  { _id: 'tt_top', type: 'tt', score: 9, name: 'Top', coo: [3, 4], data: timeline(3) },
  { _id: 'tt_low', type: 'tt', score: 1, name: 'Low', coo: [5], data: timeline(4) },
  { _id: 'tt_none', type: 'tt', name: 'No score', data: timeline(5) },
  { _id: 'other', type: 'zz', score: 100, name: 'Other type', data: { a: 1 } },
  { _id: 'nodata', type: 'yy', score: 50, name: 'No data' }
];
// Large enough to be stored gzip-compressed, like `provinces`.
const BIG = { _id: 'tt_big', type: 'tt', score: 5, name: 'Big', data: { blob: 'x'.repeat(120 * 1024) } };

describe('MetadataDynamo scan-backed lists (bounded memory)', () => {
  beforeEach(async function () {
    this.timeout(10000);
    await clearTable(TABLE);
    await seedTable(TABLE, [...ITEMS, prepareForWrite(BIG)]);
    metadataCache.clear();
    instrument();
  });

  it('scans only _id, name, score and coo', async () => {
    await MetadataDynamo.list({ type: 'tt' });
    expect(ops.scanInputs).to.have.length.greaterThan(0);
    for (const input of ops.scanInputs) {
      const fields = input.ProjectionExpression.split(', ').map(n => input.ExpressionAttributeNames[n]);
      expect(fields).to.have.members(['_id', 'name', 'score', 'coo']);
    }
  });

  it('pages by score (highest first, then _id), with full and decoded items', async () => {
    const page = await MetadataDynamo.list({ type: 'tt', start: 0, end: 4 });
    expect(page.map(i => i._id)).to.deep.equal(['tt_top', 'tt_big', 'tt_a', 'tt_b']);
    expect(page[0].data).to.deep.equal(timeline(3));
    expect(page[0].coo).to.deep.equal([3, 4]);
    expect(page[1].data.blob).to.have.length(120 * 1024);
    expect(page[1]).to.not.have.property('dataCompressed');

    const next = await MetadataDynamo.list({ type: 'tt', start: 4, end: 4 });
    expect(next.map(i => i._id)).to.deep.equal(['tt_low', 'tt_none']);
  });

  it('serves later pages from the cached list without scanning again', async () => {
    await MetadataDynamo.list({ type: 'tt', start: 0, end: 2 });
    const scans = ops.counts.ScanCommand;
    const page = await MetadataDynamo.list({ type: 'tt', start: 2, end: 2 });
    expect(page.map(i => i._id)).to.deep.equal(['tt_a', 'tt_b']);
    expect(ops.counts.ScanCommand).to.equal(scans);
  });

  it('keeps search results as an id list without loading items', async () => {
    const ids = await MetadataDynamo.list({ type: 'tt', search: 'a' });
    expect(ids).to.deep.equal(['tt_a', 'tt_b']);
    expect(ops.counts.BatchGetCommand || 0).to.equal(0);
  });

  it('keeps the geo filter', async () => {
    const page = await MetadataDynamo.list({ type: 'tt', mustGeo: 'true' });
    expect(page.map(i => i._id)).to.deep.equal(['tt_top', 'tt_b']);
  });

  it('loads at most 1000 full items for one page', async function () {
    this.timeout(20000);
    const many = Array.from({ length: 1005 }, (_, i) => ({ _id: `cap_${String(i).padStart(4, '0')}`, type: 'cap', score: i }));
    await seedTable(TABLE, many);
    expect(await MetadataDynamo.list({ type: 'cap', start: 0, end: 5000 })).to.have.length(1000);
    // A negative end counts from the back of the list; still capped.
    expect(await MetadataDynamo.list({ type: 'cap', start: 0, end: -1 })).to.have.length(1000);
    expect(await MetadataDynamo.list({ type: 'cap', start: 1000, end: 10 })).to.have.length(5);
  });

  it('shares one scan and one page load between identical concurrent requests', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => MetadataDynamo.list({ type: 'tt', end: 3 })));
    expect(ops.counts.ScanCommand).to.equal(1);
    expect(ops.counts.BatchGetCommand).to.equal(1);
    for (const r of results) expect(r.map(i => i._id)).to.deep.equal(['tt_top', 'tt_big', 'tt_a']);
  });

  it('runs at most two scan-backed loads at once', async () => {
    const queries = [{ type: 'tt' }, { type: 'zz' }, { type: 'yy' }, { year: 1000 }, { type: 'tt', search: 'o' }, { wiki: 'x' }];
    await Promise.all(queries.map(q => MetadataDynamo.list(q)));
    expect(ops.counts.ScanCommand).to.be.at.least(queries.length);
    expect(ops.maxScansInFlight).to.be.at.most(2);
  });

  it('plain list: same order as the full-item query, truncated data, no error without data', async () => {
    // The previous implementation: full items, same scan, sort and paging.
    const before = await new DynamoQuery(MetadataDynamo, {}).skip(1).limit(6).sort({ score: -1 }).lean().exec();
    instrument();
    const page = await MetadataDynamo.list({ start: 1, end: 6 });
    expect(page.map(i => i._id)).to.deep.equal(before.map(i => i._id));

    const all = await MetadataDynamo.list({ start: 0, end: 20 });
    expect(all).to.have.length(ITEMS.length + 1);
    expect(all.find(i => i._id === 'nodata').data).to.equal('');
    const big = all.find(i => i._id === 'tt_big');
    expect(big.data).to.have.length(203);
    expect(big.data.endsWith('...')).to.equal(true);
    for (const input of ops.scanInputs) expect(input.ProjectionExpression).to.be.a('string');
  });
});

describe('DynamoQuery.project()', () => {
  it('adds a ProjectionExpression next to the filter names', () => {
    const Model = { tableName: 'chronas-metadata', name: 'M' };
    const params = new DynamoQuery(Model, { type: 'e' }).project(['_id', 'score'])._buildParams({ select: 'ALL' });
    expect(params.ProjectionExpression).to.equal('#__p0, #__p1');
    expect(params.ExpressionAttributeNames).to.include({ '#__p0': '_id', '#__p1': 'score', '#type': 'type' });
    expect(params.FilterExpression).to.equal('#type = :v0');
  });

  it('leaves counts without a projection', () => {
    const Model = { tableName: 'chronas-metadata', name: 'M' };
    const params = new DynamoQuery(Model, {}).project(['_id'])._buildParams({ select: 'COUNT' });
    expect(params.Select).to.equal('COUNT');
    expect(params).to.not.have.property('ProjectionExpression');
  });
});
