/**
 * Israel, the West Bank, East Jerusalem, Gaza and the Golan Heights
 * (scripts/data-validation/israel-1967-borders.js).
 *
 * The geometry is computed from the committed fixtures (the affected live
 * provinces before the fix, and the KML). Besides matching the committed
 * result, it must be valid, without exclaves, put key places in the right
 * province, and leave every place's history before 1948 as it was outside
 * the declared border seams. The area rules run on synthetic years; the
 * direct write and revert against in-memory fakes of the models.
 */

import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  AFFECTED,
  AFTER_FILE,
  NEW_NAMES,
  NEW_PROVINCES,
  applyDirect,
  computeFix,
  correctAreaYear,
  geometryInvariants,
  geometryProblem,
  gridPoints,
  historyDiff,
  inDeclaredChange,
  provincesAt,
  readGeoJSON,
  revertDirect,
  writeAreaPass
} from '../../../scripts/data-validation/israel-1967-borders.js';

// [lon, lat] -> the one province it must lie in after the fix.
const PLACES = [
  ['Jenin', [35.30, 32.46], 'Samaria'],
  ['Nablus', [35.26, 32.22], 'Judea'],
  ['Jericho', [35.45, 31.86], 'Judea'],
  ['Jordan valley, west bank', [35.52, 32.0], 'Jordan Valley'],
  ['Jordan valley, east bank', [35.62, 32.0], 'Hawran'],
  ['Hebron', [35.10, 31.53], 'Judea'],
  ['Old City of Jerusalem', [35.2345, 31.7767], 'East Jerusalem'],
  ['Sheikh Jarrah', [35.233, 31.792], 'East Jerusalem'],
  ['West Jerusalem', [35.19, 31.78], 'Jerusalem Corridor'],
  ['Beit Shemesh', [34.99, 31.75], 'Jerusalem Corridor'],
  ['Gaza City', [34.46, 31.50], 'Gaza Strip'],
  ['Khan Yunis', [34.33, 31.33], 'Gaza Strip'],
  ['Arish (North Sinai keeps its province)', [33.80, 31.05], 'Gaza'],
  ['Katzrin', [35.69, 32.99], 'Golan'],
  ['Hamat Gader', [35.665, 32.684], 'Golan'],
  ['Majdal Shams', [35.77, 33.27], 'Hermon'],
  ['East shore of the Sea of Galilee', [35.628, 32.80], 'Kinneret East Shore'],
  ['Safed', [35.50, 32.97], 'Acre'],
  ['Kiryat Shmona', [35.57, 33.21], 'Upper Galilee'],
  ['Bint Jbeil', [35.43, 33.12], 'Sidon'],
  ['Eilat', [34.95, 29.56], 'Arava'],
  ['Taba–Eilat border, Egyptian side', [34.872, 29.56], 'Kuntilla'],
  ['Aqaba', [35.01, 29.53], "Ma'an"],
  ['Tel Aviv', [34.78, 32.08], 'Acre']
];

describe('israel-1967-borders: geometry', () => {
  let original;
  let features;
  let plan;
  before(() => ({ before: original, features, plan } = computeFix()));

  it('matches the committed result', () => {
    const names = [...AFFECTED, ...NEW_NAMES];
    const result = JSON.parse(JSON.stringify(features.filter((f) => names.includes(f.properties.name))));
    expect(result).to.deep.equal(readGeoJSON(AFTER_FILE).features);
  });

  it('every changed or new province is valid, without self-intersections, in one part', () => {
    const changed = features.filter((f) => [...AFFECTED, ...NEW_NAMES].includes(f.properties.name));
    expect(changed).to.have.lengthOf(AFFECTED.length + NEW_NAMES.length);
    for (const f of changed) expect(geometryProblem(f), f.properties.name).to.equal(null);
  });

  it('the changed provinces neither overlap nor lose land', () => {
    const inv = geometryInvariants(original, features);
    expect(inv.overlapKm2).to.be.below(0.01);
    expect(inv.lostKm2).to.be.below(0.01);
    expect(inv.problems).to.deep.equal([]);
  });

  PLACES.forEach(([name, pt, province]) => {
    it(`${name} lies in ${province} only`, () => {
      expect(provincesAt(features, pt)).to.deep.equal([province]);
    });
  });

  it('the land whose history before 1948 changes is a short, declared list of border seams', () => {
    const total = plan.historyChanges.reduce((s, h) => s + h.km2, 0);
    expect(total).to.be.below(400);
    for (const h of plan.historyChanges) expect(h.km2, `${h.from} -> ${h.to}`).to.be.below(100);
  });

  // Each original province gets values of its own, so any point whose
  // province changed shows whether it kept its history.
  const uniqueYear = () => Object.fromEntries(AFFECTED.map((n) => [n, [`${n}-ruler`, `${n}-culture`, `${n}-religion`, `${n}-capital`, 1000]]));

  [-1500, 1200, 1900, 1947].forEach((year) => {
    it(`${year}: every point outside the declared seams shows what it showed before`, () => {
      const points = gridPoints(original, 0.04);
      expect(points.length).to.be.above(5000);
      const diffs = historyDiff(original, features, uniqueYear(), plan, year, points);
      const undeclared = diffs.filter((d) => !inDeclaredChange(plan, d.pt));
      expect(undeclared.slice(0, 3)).to.deep.equal([]);
      expect(diffs.length / points.length).to.be.below(0.01);
    });
  });
});

describe('israel-1967-borders: correctAreaYear', () => {
  let plan;
  before(() => ({ plan } = computeFix()));

  const year = (over = {}) => ({
    Acre: ['ISR', 'israeli', 'jewish', 'Rio Branco', 400000],
    Judea: ['JOR', 'palestinian', 'sunni', 'Jerusalem', 400000],
    Negev: ['ISR', 'israeli', 'jewish', 'Beersheba', 120000],
    Sidon: ['LEB', 'al_suryah_arabic', 'shiite', 'Sidon', 70000],
    Damascus: ['SYR', 'al_suryah_arabic', 'sunni', 'Damascus', 800000],
    Hawran: ['JOR', 'bedouin_arabic', 'sunni', 'Amman', 500000],
    'Al Karak': ['JOR', 'bedouin_arabic', 'sunni', 'Al Karak', 15000],
    Sinai: ['_Egypt', 'bedouin_arabic', 'sunni', 'Sharm el-Sheikh', 25000],
    Gaza: ['_Egypt', 'al_misr_arabic', 'sunni', 'Arish', 32250],
    ...over
  });
  const fix = (y, data = year()) => correctAreaYear(y, data, plan).data;

  it('before 1948 a new province copies its source exactly, with a share of its population', () => {
    const data = year({ Acre: ['OTT', 'palestinian', 'sunni', 'Acre', 100000], Sidon: ['OTT', 'x', 'y', 'Sidon', 70000] });
    const out = fix(1900, data);
    expect(out['Gaza Strip'].slice(0, 4)).to.deep.equal(['OTT', 'palestinian', 'sunni', 'Acre']);
    expect(out['Upper Galilee'].slice(0, 4)).to.deep.equal(['OTT', 'x', 'y', 'Sidon']);
    const acreShares = ['Gaza Strip', 'Samaria', 'Sheikh Zuweid'].reduce((s, n) => s + out[n][4], 0);
    expect(out.Acre[4] + acreShares).to.equal(100000);
  });

  it('no new province value in a year without its source', () => {
    const data = year();
    delete data.Damascus;
    const out = fix(-1500, data);
    expect(out).to.not.have.property('Golan');
    expect(out).to.not.have.property('Kinneret East Shore');
    expect(out).to.have.property('Hermon');
  });

  it('Acre: Israeli from 1948, capital Acre', () => {
    expect(fix(1948, year({ Acre: ['GBR', 'palestinian', 'sunni', 'Rio Branco', 1] })).Acre).to.deep.equal(['ISR', 'israeli', 'jewish', 'Acre', 1]);
    expect(fix(1945, year({ Acre: ['GBR', 'palestinian', 'sunni', 'Rio Branco', 1] })).Acre[0]).to.equal('GBR');
  });

  it('the West Bank: Jordan 1948–66, Israel 1967–95, PA from 1996', () => {
    for (const n of ['Judea', 'Samaria', 'Jordan Valley']) {
      expect(fix(1948)[n][0], `${n} 1948`).to.equal('JOR');
      expect(fix(1967)[n][0], `${n} 1967`).to.equal('ISR');
      expect(fix(1995)[n][0], `${n} 1995`).to.equal('ISR');
      expect(fix(1996)[n][0], `${n} 1996`).to.equal('PLS');
    }
    expect(fix(1990).Judea[3]).to.equal('Jerusalem');
    expect(fix(1996).Judea[3]).to.equal('Ramallah');
    expect(fix(1960).Samaria[3]).to.equal('Nablus');
  });

  it('East Jerusalem: Jordan 1948–66, Israel from 1967', () => {
    expect(fix(1955)['East Jerusalem'][0]).to.equal('JOR');
    expect(fix(1967)['East Jerusalem'][0]).to.equal('ISR');
    expect(fix(2000)['East Jerusalem'][0]).to.equal('ISR');
  });

  it('Gaza Strip: Egypt 1948–66, Israel 1967–93, PA from 1994', () => {
    expect(fix(1950)['Gaza Strip'][0]).to.equal('_Kingdom_of_Egypt');
    expect(fix(1960)['Gaza Strip'][0]).to.equal('_Egypt');
    expect(fix(1993)['Gaza Strip'][0]).to.equal('ISR');
    expect(fix(1994)['Gaza Strip']).to.deep.equal(['PLS', 'palestinian', 'sunni', 'Gaza', 935500]);
  });

  it('Golan and Hermon follow Damascus until 1966 and are Israeli from 1967', () => {
    expect(fix(1960, year({ Damascus: ['_Egypt', 'a', 'b', 'Damascus', 800000] })).Golan.slice(0, 4)).to.deep.equal(['_Egypt', 'a', 'b', 'Quneitra']);
    expect(fix(1966).Hermon.slice(0, 4)).to.deep.equal(['SYR', 'al_suryah_arabic', 'sunni', 'Majdal Shams']);
    expect(fix(1967).Golan[0]).to.equal('ISR');
    expect(fix(1977).Golan[3]).to.equal('Katzrin');
  });

  it('Israeli pieces copy Acre or Negev, Egyptian pieces Sinai, with their own capital', () => {
    expect(fix(1950)['Upper Galilee'].slice(0, 4)).to.deep.equal(['ISR', 'israeli', 'jewish', 'Safed']);
    expect(fix(1950)['Kinneret East Shore'][0]).to.equal('ISR');
    expect(fix(1950).Arava.slice(0, 4)).to.deep.equal(['ISR', 'israeli', 'jewish', 'Eilat']);
    expect(fix(1970, year({ Sinai: ['ISR', 'bedouin_arabic', 'sunni', 'Sharm el-Sheikh', 25000] })).Kuntilla[0]).to.equal('ISR');
  });

  it('leaves a year that has the new provinces already alone', () => {
    const once = fix(1970);
    expect(correctAreaYear(1970, once, plan).changes).to.deep.equal({});
  });

  it('every new province has a name in the plan and a wiki link', () => {
    expect(Object.keys(plan.newProvinces).sort()).to.deep.equal([...NEW_NAMES].sort());
    for (const n of NEW_NAMES) expect(NEW_PROVINCES[n].wiki, n).to.be.a('string');
  });
});

// In-memory stand-ins for AreaDynamo and MetadataDynamo.
function fakeModels(areas, metadata) {
  const doc = (store, id) => {
    if (!store.has(id)) return null;
    const d = JSON.parse(JSON.stringify(store.get(id)));
    d.save = async () => {
      const rest = { ...d };
      delete rest.save;
      store.set(id, JSON.parse(JSON.stringify(rest)));
    };
    return d;
  };
  const model = (store) => ({ findById: (id) => ({ exec: async () => doc(store, String(id)) }) });
  return async () => ({ AreaDynamo: model(areas), MetadataDynamo: model(metadata) });
}

describe('israel-1967-borders: direct write and revert', () => {
  let dir;
  let fix;
  before(() => { fix = computeFix(); });
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'israel-1967-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const other = { type: 'Feature', properties: { name: 'Elsewhere' }, geometry: { type: 'Point', coordinates: [0, 0] } };
  const initial = () => ({
    areas: [
      ['1900', { _id: '1900', year: 1900, data: { Acre: ['OTT', 'a', 'b', 'Acre', 1000], Judea: ['OTT', 'a', 'b', 'Jerusalem', 1000] } }],
      ['1970', { _id: '1970', year: 1970, data: { Acre: ['ISR', 'a', 'b', 'Rio Branco', 1000], Judea: ['JOR', 'a', 'b', 'Jerusalem', 1000] } }]
    ],
    metadata: [
      ['provinces', { _id: 'provinces', data: { type: 'FeatureCollection', features: [other, ...JSON.parse(JSON.stringify(fix.before))] } }],
      ['province', { _id: 'province', data: { Acre: 'Samaria', Gaza: 'Gaza' } }]
    ]
  });
  const quiet = { log: () => {}, invalidate: async () => true };
  const setup = () => {
    const state = initial();
    const areas = new Map(JSON.parse(JSON.stringify(state.areas)));
    const metadata = new Map(JSON.parse(JSON.stringify(state.metadata)));
    return { state, areas, metadata, loadModels: fakeModels(areas, metadata) };
  };
  const apply = (loadModels) => applyDirect({ ...fix, backupDir: dir, loadModels, years: [1900, 1970], ...quiet });

  it('applies, then reverts to exactly the previous state', async () => {
    const { state, areas, metadata, loadModels } = setup();
    expect(await apply(loadModels)).to.equal(true);
    const names = metadata.get('provinces').data.features.map((f) => f.properties.name);
    expect(names).to.include.members(['Elsewhere', ...AFFECTED, ...NEW_NAMES]);
    expect(areas.get('1970').data.Samaria[0]).to.equal('ISR');
    expect(areas.get('1970').data.Acre[3]).to.equal('Acre');
    expect(metadata.get('province').data['East Jerusalem']).to.equal('East_Jerusalem');

    const { conflicts } = await revertDirect({ backupDir: dir, loadModels, ...quiet });
    expect(conflicts).to.deep.equal([]);
    expect([...areas.entries()]).to.deep.equal(state.areas);
    expect([...metadata.entries()]).to.deep.equal(state.metadata);
  });

  it('refuses to apply when a live province differs from the fixture', async () => {
    const { metadata, loadModels } = setup();
    metadata.get('provinces').data.features[1].properties.color = '#000';
    await apply(loadModels).then(() => expect.fail('should refuse'), (e) => expect(e.message).to.match(/differs from the fixture/));
  });

  it('refuses to apply twice', async () => {
    const { loadModels } = setup();
    await apply(loadModels);
    await apply(loadModels).then(() => expect.fail('should refuse'), (e) => expect(e.message).to.match(/already/));
  });

  it('refuses to revert when a written province was edited since', async () => {
    const { metadata, loadModels } = setup();
    await apply(loadModels);
    const f = metadata.get('provinces').data.features.find((x) => x.properties.name === 'Golan');
    f.properties.color = '#123456';
    await revertDirect({ backupDir: dir, loadModels, ...quiet })
      .then(() => expect.fail('should refuse'), (e) => expect(e.message).to.match(/Golan changed since/));
  });

  it('leaves and reports an area value edited since', async () => {
    const { areas, loadModels } = setup();
    await apply(loadModels);
    areas.get('1970').data.Samaria = ['EDITED'];
    const { conflicts } = await revertDirect({ backupDir: dir, loadModels, ...quiet });
    expect(conflicts).to.deep.equal([{ year: 1970, prov: 'Samaria' }]);
    expect(areas.get('1970').data.Samaria).to.deep.equal(['EDITED']);
    expect(areas.get('1970').data).to.not.have.property('Golan');
  });

  it('a first-run backup without `after` values needs --legacy-backup', async () => {
    const { loadModels } = setup();
    await apply(loadModels);
    const file = path.join(dir, 'areas.jsonl');
    const legacy = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => {
      const { year, before } = JSON.parse(l);
      return JSON.stringify({ year, before });
    });
    fs.writeFileSync(file, `${legacy.join('\n')}\n`);
    await revertDirect({ backupDir: dir, loadModels, ...quiet })
      .then(() => expect.fail('should refuse'), (e) => expect(e.message).to.match(/legacy-backup/));
    expect((await revertDirect({ backupDir: dir, loadModels, legacy: true, ...quiet })).conflicts).to.deep.equal([]);
  });

  it('a pass writes nothing for years it already corrected', async () => {
    const { areas, loadModels } = setup();
    const { AreaDynamo } = await loadModels();
    const backupFile = path.join(dir, 'areas.jsonl');
    const run = () => writeAreaPass({ AreaDynamo, plan: fix.plan, backupFile, years: [1900, 1970, 1971], log: () => {} });
    expect(await run()).to.equal(2);
    expect(await run()).to.equal(0);
    expect(areas.get('1900').data['Gaza Strip'].slice(0, 4)).to.deep.equal(['OTT', 'a', 'b', 'Acre']);
  });
});
