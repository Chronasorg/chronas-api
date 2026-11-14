/**
 * Israel, the West Bank, Gaza and the Golan Heights (scripts/data-validation/israel-1967-borders.js).
 *
 * The geometry is checked against the committed fixtures: the live
 * provinces before the fix (inputs/israel-1967-before.geojson) reshaped
 * with the KML (inputs/israel-1967-kml.geojson) must give the committed
 * result (inputs/israel-1967-after.geojson), and that result must put key
 * cities into the right province. The area rules and the direct write and
 * revert run against in-memory fakes of the models.
 */

import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  AFFECTED,
  NEW_PROVINCE,
  applyDirect,
  buildRegions,
  correctAreaYear,
  geometryInvariants,
  provincesAt,
  readKml,
  reshapeProvinces,
  revertDirect,
  writeAreaPass
} from '../../../scripts/data-validation/israel-1967-borders.js';

const INPUTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/data-validation/inputs');
const load = (name) => JSON.parse(fs.readFileSync(path.join(INPUTS, name), 'utf8')).features;

// [lon, lat] -> province after the fix.
const CITIES = [
  ['Jenin', [35.30, 32.46], 'Judea'],
  ['Nablus', [35.26, 32.22], 'Judea'],
  ['Jericho', [35.45, 31.86], 'Judea'],
  ['Jordan valley, west bank', [35.52, 32.0], 'Judea'],
  ['Hebron', [35.10, 31.53], 'Judea'],
  ['West Jerusalem', [35.19, 31.78], 'Acre'],
  ['Beit Shemesh', [34.99, 31.75], 'Acre'],
  ['Gaza City', [34.46, 31.50], 'Gaza'],
  ['Khan Yunis', [34.33, 31.33], 'Gaza'],
  ['Arish', [33.80, 31.05], 'Sinai'],
  ['Katzrin', [35.69, 32.99], 'Golan'],
  ['Majdal Shams', [35.77, 33.27], 'Golan'],
  ['Safed', [35.50, 32.97], 'Acre'],
  ['Kiryat Shmona', [35.57, 33.21], 'Acre'],
  ['Bint Jbeil', [35.43, 33.12], 'Sidon'],
  ['Eilat', [34.95, 29.56], 'Negev'],
  ['Taba', [34.86, 29.56], 'Sinai'],
  ['Jordan valley, east bank', [35.62, 32.0], 'Hawran']
];

describe('israel-1967-borders: geometry', () => {
  let after;
  before(() => { after = load('israel-1967-after.geojson'); });

  it('reshaping the before fixture with the KML gives the committed after fixture', () => {
    const features = load('israel-1967-before.geojson');
    reshapeProvinces(features, buildRegions(readKml()));
    const byName = (fs_) => Object.fromEntries(fs_.map((f) => [f.properties.name, f]));
    expect(Object.keys(byName(features)).sort()).to.deep.equal([...AFFECTED, NEW_PROVINCE].sort());
    expect(JSON.parse(JSON.stringify(byName(features)))).to.deep.equal(byName(after));
  });

  it('refuses to run twice', () => {
    expect(() => reshapeProvinces(load('israel-1967-after.geojson'), buildRegions(readKml()))).to.throw(/already/);
  });

  it('the changed provinces neither overlap nor lose land', () => {
    const inv = geometryInvariants(load('israel-1967-before.geojson'), after);
    expect(inv.overlapKm2).to.be.below(1);
    expect(inv.lostKm2).to.be.below(1);
  });

  it('Golan and Gaza link to their articles', () => {
    const props = (n) => after.find((f) => f.properties.name === n).properties;
    expect(props('Golan').wikiUrl).to.equal('Golan_Heights');
    expect(props('Gaza').wikiUrl).to.equal('Gaza_Strip');
  });

  CITIES.forEach(([name, pt, province]) => {
    it(`${name} lies in ${province} only`, () => {
      expect(provincesAt(after, pt)).to.deep.equal([province]);
    });
  });
});

// A year's data with the provinces the rules read.
const year = (over = {}) => ({
  Acre: ['GBR', 'palestinian', 'sunni', 'Rio Branco', 50000],
  Judea: ['GBR', 'palestinian', 'sunni', 'Jerusalem', 100000],
  Gaza: ['_Kingdom_of_Egypt', 'al_misr_arabic', 'sunni', 'Arish', 32250],
  Damascus: ['SYR', 'al_suryah_arabic', 'sunni', 'Damascus', 800000],
  Sidon: ['LEB', 'al_suryah_arabic', 'shiite', 'Sidon', 70000],
  ...over
});
const ruler = (y, prov, data = year()) => correctAreaYear(y, data).data[prov][0];

describe('israel-1967-borders: correctAreaYear', () => {
  it('Golan follows Damascus until 1966 and is Israeli from 1967', () => {
    expect(correctAreaYear(1960, year({ Damascus: ['_Egypt', 'al_suryah_arabic', 'sunni', 'Damascus', 800000] })).data.Golan)
      .to.deep.equal(['_Egypt', 'al_suryah_arabic', 'sunni', 'Quneitra', 40000]);
    expect(ruler(1966, 'Golan')).to.equal('SYR');
    expect(correctAreaYear(1967, year()).data.Golan).to.deep.equal(['ISR', 'al_suryah_arabic', 'sunni', 'Quneitra', 6400]);
    expect(correctAreaYear(1977, year()).data.Golan[3]).to.equal('Katzrin');
    expect(correctAreaYear(-1500, { Gaza: ['EGY', 'x', 'y', 'Gaza', 1] }).data.Golan).to.deep.equal(['', '', '', 'Quneitra', 0]);
  });

  it('Acre is Israeli from 1948 and its capital is Acre', () => {
    expect(correctAreaYear(1947, year()).data.Acre).to.deep.equal(['GBR', 'palestinian', 'sunni', 'Acre', 50000]);
    expect(correctAreaYear(1948, year()).data.Acre).to.deep.equal(['ISR', 'israeli', 'jewish', 'Acre', 50000]);
    expect(ruler(1949, 'Acre')).to.equal('ISR');
  });

  it('Judea: Jordan 1948–66, Israel 1967–93 (capital Jerusalem), PA from 1994 (Ramallah)', () => {
    expect(ruler(1947, 'Judea')).to.equal('GBR');
    expect(ruler(1948, 'Judea')).to.equal('JOR');
    expect(ruler(1966, 'Judea', year({ Judea: ['JOR', 'palestinian', 'sunni', 'Jerusalem', 1] }))).to.equal('JOR');
    expect(ruler(1967, 'Judea', year({ Judea: ['JOR', 'palestinian', 'sunni', 'Jerusalem', 1] }))).to.equal('ISR');
    const plsEarly = year({ Judea: ['PLS', 'palestinian', 'sunni', 'Ramallah', 1] });
    expect(correctAreaYear(1993, plsEarly).data.Judea).to.deep.equal(['ISR', 'palestinian', 'sunni', 'Jerusalem', 1]);
    expect(correctAreaYear(1994, year({ Judea: ['ISR', 'palestinian', 'sunni', 'Jerusalem', 1] })).data.Judea)
      .to.deep.equal(['PLS', 'palestinian', 'sunni', 'Ramallah', 1]);
  });

  it('Gaza: as Acre 1517–1947, Egypt 1948–66, Israel 1967–93, PA from 1994; capital Gaza', () => {
    expect(correctAreaYear(1516, year()).data.Gaza).to.deep.equal(['_Kingdom_of_Egypt', 'al_misr_arabic', 'sunni', 'Gaza', 32250]);
    expect(correctAreaYear(1945, year()).data.Gaza).to.deep.equal(['GBR', 'palestinian', 'sunni', 'Gaza', 32250]);
    expect(correctAreaYear(1948, year()).data.Gaza).to.deep.equal(['_Kingdom_of_Egypt', 'palestinian', 'sunni', 'Gaza', 250000]);
    expect(ruler(1953, 'Gaza')).to.equal('_Egypt');
    expect(correctAreaYear(1967, year()).data.Gaza).to.deep.equal(['ISR', 'palestinian', 'sunni', 'Gaza', 355000]);
    expect(ruler(1993, 'Gaza')).to.equal('ISR');
    expect(correctAreaYear(1994, year()).data.Gaza[0]).to.equal('PLS');
    expect(correctAreaYear(2000, year()).data.Gaza[4]).to.equal(1130000);
  });

  it('applies only the parts asked for, and changes nothing the second time', () => {
    const base = correctAreaYear(1970, year(), { parts: ['base'] });
    expect(base.changes).to.have.all.keys('Golan', 'Acre', 'Judea');
    expect(base.data.Gaza).to.deep.equal(year().Gaza);
    const both = correctAreaYear(1970, year());
    expect(correctAreaYear(1970, both.data).changes).to.deep.equal({});
  });

  it('records the previous value, null for the new province', () => {
    const { changes } = correctAreaYear(1970, year());
    expect(changes.Golan.before).to.equal(null);
    expect(changes.Acre.before).to.deep.equal(year().Acre);
  });
});

// In-memory stand-ins for AreaDynamo and MetadataDynamo.
function fakeModels(areas, metadata) {
  const saves = [];
  const doc = (store, id) => {
    if (!store.has(id)) return null;
    const d = { ...JSON.parse(JSON.stringify(store.get(id))) };
    d.save = async () => {
      const rest = { ...d };
      delete rest.save;
      store.set(id, JSON.parse(JSON.stringify(rest)));
      saves.push(id);
    };
    return d;
  };
  const model = (store) => ({ findById: (id) => ({ exec: async () => doc(store, String(id)) }) });
  return { saves, loadModels: async () => ({ AreaDynamo: model(areas), MetadataDynamo: model(metadata) }) };
}

describe('israel-1967-borders: direct write and revert', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'israel-1967-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('a pass backs up and writes only the years that change', async () => {
    const areas = new Map([['1000', { _id: '1000', year: 1000, data: { Acre: ['X', 'a', 'b', 'Acre', 1] } }]]);
    const { saves, loadModels } = fakeModels(areas, new Map());
    const { AreaDynamo } = await loadModels();
    const backupFile = path.join(dir, 'areas.jsonl');
    const run = () => writeAreaPass({ AreaDynamo, which: ['base'], backupFile, years: [999, 1000], log: () => {} });
    expect(await run()).to.equal(1);
    expect(await run()).to.equal(0);
    expect(saves).to.deep.equal(['1000']);
    expect(fs.readFileSync(backupFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)))
      .to.deep.equal([{ year: 1000, before: { Golan: null } }]);
  });

  it('applyDirect writes every part and revertDirect restores the previous state exactly', async () => {
    const original = {
      areas: [
        ['1950', { _id: '1950', year: 1950, data: year() }],
        ['1970', { _id: '1970', year: 1970, data: year({ Judea: ['JOR', 'palestinian', 'sunni', 'Jerusalem', 1] }) }]
      ],
      metadata: [
        ['provinces', { _id: 'provinces', data: { type: 'FeatureCollection', features: [{ properties: { name: 'Acre' } }] } }],
        ['province', { _id: 'province', data: { Acre: 'Samaria', Gaza: 'Gaza' } }]
      ]
    };
    const areas = new Map(JSON.parse(JSON.stringify(original.areas)));
    const metadata = new Map(JSON.parse(JSON.stringify(original.metadata)));
    const { loadModels } = fakeModels(areas, metadata);
    const invalidated = [];
    const invalidate = async (resources) => { invalidated.push(resources); return true; };
    const newFeatures = [{ properties: { name: 'Acre' } }, { properties: { name: 'Golan' } }];

    expect(await applyDirect({ features: newFeatures, backupDir: dir, invalidate, log: () => {}, loadModels, years: [1950, 1970] })).to.equal(true);
    expect(areas.get('1970').data.Golan[0]).to.equal('ISR');
    expect(areas.get('1970').data.Gaza[0]).to.equal('ISR');
    expect(areas.get('1970').data.Judea[0]).to.equal('ISR');
    expect(areas.get('1950').data.Gaza[0]).to.equal('_Kingdom_of_Egypt');
    expect(metadata.get('provinces').data.features).to.deep.equal(newFeatures);
    expect(metadata.get('province').data).to.deep.equal({ Acre: 'Samaria', Gaza: 'Gaza_Strip', Golan: 'Golan_Heights' });

    // A second run stops before writing anything.
    await applyDirect({ features: newFeatures, backupDir: dir, invalidate, log: () => {}, loadModels, years: [1950, 1970] })
      .then(() => expect.fail('should refuse'), (e) => expect(e.message).to.match(/already/));

    expect(await revertDirect({ backupDir: dir, invalidate, log: () => {}, loadModels })).to.equal(true);
    expect([...areas.entries()]).to.deep.equal(original.areas);
    expect([...metadata.entries()]).to.deep.equal(original.metadata);
    expect(invalidated).to.deep.equal([['areas', 'metadata'], ['areas', 'metadata']]);
  });
});
