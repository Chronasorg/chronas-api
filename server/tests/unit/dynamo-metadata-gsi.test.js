import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { cache } from '../../../config/config.js';

// Issue #154: queryBranch was always running a full table Scan because
// onIndex() was never invoked. Under a Lambda cold-start storm this consumed
// 120k+ RCUs in a 5-minute window. These tests prove the new code routes
// type+subtype(+year) queries through a GSI Query and only falls back to
// Scan for shapes the GSI can't safely cover (type-only, year-only, etc).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/metadata-sample.json');
const TABLE = 'chronas-metadata';

let MetadataDynamo;
const opCounts = {};

function resetCounts() {
  for (const k of Object.keys(opCounts)) delete opCounts[k];
}

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/metadata.dynamo.js');
  MetadataDynamo = mod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

// Wrap the doc client per-test rather than once in `before`. Mocha
// runs all top-level `before` hooks (across files) before any test,
// and several test files reassign `globalThis.__TEST_DYNAMO_DOC_CLIENT`.
// Wrapping on demand inside `beforeEach` guarantees we instrument the
// client that's actually live for our assertions.
function instrumentDocClient() {
  const docClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
  if (!docClient) throw new Error('No __TEST_DYNAMO_DOC_CLIENT');
  if (docClient.__gsiWrapped) {
    resetCounts();
    return docClient;
  }
  const realSend = docClient.send.bind(docClient);
  docClient.send = (command, ...rest) => {
    const name = command?.constructor?.name || 'Unknown';
    opCounts[name] = (opCounts[name] || 0) + 1;
    if (name === 'QueryCommand') {
      opCounts._lastQueryIndex = command.input?.IndexName;
    }
    return realSend(command, ...rest);
  };
  docClient.__gsiWrapped = true;
  resetCounts();
  return docClient;
}

describe('MetadataDynamo queryBranch — GSI routing (issue #154)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
    // Wrap the live doc client and reset counts/cache so each test body
    // observes a fresh dispatch, not a memoized hit.
    instrumentDocClient();
    for (const key of cache.keys()) {
      if (key.startsWith('query:') || key.startsWith('default:') || key.startsWith('init:')) {
        cache.del(key);
      }
    }
  });

  it('type+subtype+year goes through GSI-SubtypeYear (Query, not Scan)', async () => {
    const items = await MetadataDynamo.list({
      type: 'e', subtype: 'ew', year: 1300, delta: 500, end: 50
    });
    expect(items).to.be.an('array').with.length.greaterThan(0);
    expect(items.every(i => i.subtype === 'ew' && i.type === 'e')).to.equal(true);
    expect(opCounts.QueryCommand || 0).to.be.greaterThan(0);
    expect(opCounts.ScanCommand || 0).to.equal(0);
    expect(opCounts._lastQueryIndex).to.equal('GSI-SubtypeYear');
  });

  it('type+multi-subtype+year fans out one Query per subtype on GSI-SubtypeYear', async () => {
    const items = await MetadataDynamo.list({
      type: 'e', subtype: 'ew,ei', year: 1500, delta: 1000, end: 50
    });
    const ids = items.map(i => i._id);
    expect(ids).to.include('e_Battle_of_Hastings');
    expect(ids).to.include('e_Fall_of_Constantinople');
    expect(opCounts.QueryCommand || 0).to.equal(2);
    expect(opCounts.ScanCommand || 0).to.equal(0);
  });

  it('type+subtype (no year) goes through GSI-TypeSubtype (Query, not Scan)', async () => {
    const items = await MetadataDynamo.list({
      type: 'i', subtype: 'monuments', end: 50
    });
    const ids = items.map(i => i._id);
    expect(ids).to.include('i_Notre_Dame');
    expect(ids).to.include('i_Colosseum_art');
    expect(opCounts.QueryCommand || 0).to.be.greaterThan(0);
    expect(opCounts.ScanCommand || 0).to.equal(0);
    expect(opCounts._lastQueryIndex).to.equal('GSI-TypeSubtype');
  });

  it('subtype-only (no type, no year) falls back to Scan with FilterExpression', async () => {
    // We don't have a guarantee that all items in `subtype=monuments` carry
    // both subtype AND year, so subtype-only without a year stays on Scan.
    const items = await MetadataDynamo.list({
      subtype: 'monuments', end: 50
    });
    expect(items).to.be.an('array');
    expect(opCounts.ScanCommand || 0).to.be.greaterThan(0);
    expect(opCounts.QueryCommand || 0).to.equal(0);
  });

  it('type-only (no subtype) stays on Scan to avoid losing items missing subtype attr', async () => {
    // Issue: items lacking the `subtype` attribute don't appear in
    // GSI-TypeSubtype at all, so we cannot use that index without losing
    // ~5,400 production items. Confirm we still Scan in this case.
    const items = await MetadataDynamo.list({ type: 'i', end: 50 });
    expect(items).to.be.an('array').with.length.greaterThan(0);
    expect(opCounts.ScanCommand || 0).to.be.greaterThan(0);
    expect(opCounts.QueryCommand || 0).to.equal(0);
  });

  it('returns same items via GSI as Scan would', async () => {
    // Sanity check: the GSI-routed result for type+subtype+year matches a
    // bare Scan filtered on the same conditions.
    const viaGSI = await MetadataDynamo.list({
      type: 'e', subtype: 'ew', year: 1300, delta: 500, end: 50
    });

    const scanItems = fixtures.filter(i =>
      i.type === 'e' && i.subtype === 'ew' &&
      typeof i.year === 'number' && i.year >= 800 && i.year <= 1800
    );

    const viaGSIIds = viaGSI.map(i => i._id).sort();
    const scanIds = scanItems.map(i => i._id).sort();
    expect(viaGSIIds).to.deep.equal(scanIds);
  });

  it('search keeps working (filtered after GSI fetch, returned as id array)', async () => {
    const ids = await MetadataDynamo.list({
      type: 'e', subtype: 'ew', year: 1300, delta: 500, search: 'Constantinople'
    });
    expect(ids).to.deep.equal(['e_Fall_of_Constantinople']);
    expect(opCounts.QueryCommand || 0).to.be.greaterThan(0);
  });

  it('mustGeo filters to items with valid coo array', async () => {
    const items = await MetadataDynamo.list({
      type: 'e', subtype: 'ew', year: 1300, delta: 500, geo: true
    });
    items.forEach(i => {
      expect(i.coo).to.be.an('array').with.lengthOf(2);
    });
  });

  it('cache hit on second call avoids re-issuing DynamoDB ops', async () => {
    await MetadataDynamo.list({ type: 'e', subtype: 'ew', year: 1300, delta: 500 });
    const queriesAfterFirst = opCounts.QueryCommand || 0;
    await MetadataDynamo.list({ type: 'e', subtype: 'ew', year: 1300, delta: 500 });
    expect(opCounts.QueryCommand || 0).to.equal(queriesAfterFirst);
  });
});
