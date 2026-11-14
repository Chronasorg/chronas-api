/**
 * Israel, the West Bank, Gaza and the Golan Heights, 1948–2000.
 *
 * Problem (verified 2026-11-14 against live `provinces` metadata and
 * /v1/areas/1945–2000, compared with a KML of the 2026 borders,
 * inputs/israel-1967-kml.geojson):
 *   - The Gaza Strip has no province: it lies in `Acre` (ISR from 1950). The
 *     province named `Gaza` is really North Sinai (capital Arish).
 *   - The Golan Heights have no province: they lie in `Damascus` (SYR) and
 *     `Sidon` (LEB) and never become Israeli.
 *   - The northern West Bank (Jenin, Nablus) lies in `Acre` (ISR from 1950);
 *     the west bank of the Jordan valley lies in `Hawran` (always JOR).
 *   - `Judea` reaches into Israel (Jerusalem corridor, south of Hebron).
 *   - Upper Galilee lies in `Sidon` (LEB); Eilat and the Arava in `Al Karak`
 *     (JOR); parts of `Negev` and `Acre` lie in Egypt.
 *   - Years: `Acre` is GBR in 1948–49, `Judea` turns ISR only in 1968 and PLS
 *     already in 1989, and `Acre`'s capital is "Rio Branco" (the Brazilian
 *     state of Acre) from 1883 on.
 *
 * Fix:
 *   Geometry, using only the KML's land borders (its coastline is coarse, so
 *   every clip region is extended into the sea and our coastline stays):
 *     - `Judea` becomes the West Bank, `Gaza` the Gaza Strip (the old North
 *       Sinai polygon joins `Sinai`), and a new province `Golan` is cut from
 *       `Damascus` and `Sidon`.
 *     - The rest of Israel goes to `Acre` (north of 31.45°N) or `Negev`.
 *     - The parts of `Acre` and `Negev` west of the Egyptian border join `Sinai`.
 *   Area data (correctAreaYear), every year -2000..2000:
 *     - `Golan`: Damascus's values (capital Quneitra, population 5 % of
 *       Damascus), ISR from 1967, capital Katzrin from 1977.
 *     - `Gaza`: capital Gaza; 1517–1947 the ruler, culture and religion of
 *       `Acre`; 1948–66 Egypt, 1967 ISR, from PA_YEAR PLS (palestinian, sunni).
 *     - `Judea`: JOR 1948–66, ISR 1967 to PA_YEAR-1 (capital Jerusalem), PLS
 *       from PA_YEAR (capital Ramallah).
 *     - `Acre`: ISR, israeli, jewish in 1948–49; capital Acre, not Rio Branco.
 *
 * Usage:
 *   node scripts/data-validation/israel-1967-borders.js
 *        # dry run: reads the live API, writes inputs/israel-1967-{before,after}.geojson,
 *        # runs the city checks, prints what would change; writes nothing
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/israel-1967-borders.js --direct [--distribution-id ID]
 *        # writes through the models (AWS credentials), backs up everything it
 *        # changes to infra/backups/israel-1967-<timestamp>/ first, then
 *        # invalidates /v1/areas/* and /v1/metadata* on CloudFront
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/israel-1967-borders.js --revert <backup dir>
 *        # puts back what a --direct run changed, from its backup
 *
 * Order of a --direct run: (1) every year gets `Golan` and the Acre/Judea
 * fixes, while the old geometry is still live (the new key is unused there);
 * (2) the provinces geometry and the province wiki links; (3) the Gaza Strip
 * values for 1517–2000, which only make sense with the new geometry.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  area as turfArea,
  booleanPointInPolygon,
  buffer,
  centroid,
  difference,
  featureCollection,
  flatten,
  intersect,
  polygon as turfPolygon,
  union
} from '@turf/turf';
import { ChronasClient } from './chronas-client.js';
import { distributionIdFrom, invalidateAfterDirectWrites } from './edge-invalidation-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(__dirname, 'inputs');
const KML_FILE = path.join(INPUTS_DIR, 'israel-1967-kml.geojson');
const BACKUP_ROOT = process.env.EDGE_BACKUP_DIR || path.join(__dirname, '../../infra/backups');
const API_URL = process.env.CHRONAS_API_URL || 'https://api.chronas.org';

/** Gaza–Jericho Agreement (May 1994): the Palestinian Authority takes over. */
export const PA_YEAR = 1994;
export const FIRST_YEAR = -2000;
export const LAST_YEAR = 2000;

/** Every province whose polygon this script may change, plus the new one. */
export const AFFECTED = ['Acre', 'Judea', 'Negev', 'Sidon', 'Damascus', 'Hawran', 'Al Karak', "Ma'an", 'Gaza', 'Sinai'];
export const NEW_PROVINCE = 'Golan';
export const WIKI = { Golan: 'Golan_Heights', Gaza: 'Gaza_Strip' };

// ---------------------------------------------------------------------------
// Clip regions
// ---------------------------------------------------------------------------

export function readKml(file = KML_FILE) {
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(fc.features.map((f) => [f.properties.name, f]));
}

const fc = (...features) => featureCollection(features.filter(Boolean));
const inter = (a, b) => (a && b ? intersect(fc(a, b)) : null);
const minus = (a, b) => (a && b ? difference(fc(a, b)) : a);
const plus = (a, b) => (a && b ? union(fc(a, b)) : a || b);
const km2 = (g) => (g ? turfArea(g) / 1e6 : 0);

/**
 * The KML as clip regions. Its coastline is a few straight lines, so the
 * Gaza Strip, the Egyptian side and Israel are extended into the sea: only
 * their land borders cut our provinces.
 */
export function buildRegions(kml) {
  const ring = (name) => kml[name].geometry.coordinates[0];
  const gaza = ring('Gaza');
  // Gaza ring: Rafah (0) along the Egyptian and Israeli land borders to the
  // northern beach (11), then the KML's straight coastline back to Rafah.
  const gazaStrip = turfPolygon([[...gaza.slice(0, 12), [34.40, 31.66], [34.17, 31.37], gaza[0]]]);

  // Israel ring: index 0 Taba … the Jordan, Golan and Lebanese borders …
  // 253 Rosh HaNikra, the coast, 260 Rafah, the Egyptian border back to Taba.
  const israel = ring('Israel 2026');
  const rafah = israel.findIndex(([x, y]) => x === 34.213992 && y === 31.3306473);
  const roshHanikra = israel.findIndex(([x, y]) => x === 35.1063106 && y === 33.0932007);
  if (rafah < 0 || roshHanikra < 0) throw new Error('KML: Rafah or Rosh HaNikra vertex not found');
  // West of the Egyptian border (Gaza–Egypt part from the Gaza ring), out to
  // the Suez canal and into the Gulf of Aqaba.
  const egyptBorder = israel.slice(rafah + 1, israel.length - 1); // … to Taba
  const egyptSide = turfPolygon([[
    [34.17, 31.37], gaza[0], gaza[1], ...egyptBorder, israel[0], [34.90, 29.35], [32.0, 29.35], [32.0, 31.37], [34.17, 31.37]
  ]]);
  // The sea off Israel's coast, from Rosh HaNikra due west down to Rafah;
  // its eastern edge runs well inland, inside Israel.
  const sea = turfPolygon([[
    israel[roshHanikra], [34.0, 33.0932007], [34.0, 31.37], [34.17, 31.37], [34.6, 31.4], [35.0, 32.8], israel[roshHanikra]
  ]]);
  const golan = kml['Golan Heights'];
  const westBank = kml['Pal Auth'];
  let israelProper = plus(kml['Israel 2026'], sea);
  for (const r of [golan, westBank, gazaStrip, egyptSide]) israelProper = minus(israelProper, r);
  return { golan, westBank, gazaStrip, egyptSide, israelProper };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Parts of a (multi)polygon, without slivers under 0.01 km². */
function parts(g) {
  if (!g) return [];
  return flatten(g).features.filter((p) => km2(p) >= 0.01);
}

function setGeometry(feature, g) {
  const kept = parts(g);
  if (kept.length === 0) throw new Error(`${feature.properties.name} would have no area left`);
  feature.geometry = kept.length === 1
    ? kept[0].geometry
    : { type: 'MultiPolygon', coordinates: kept.map((p) => p.geometry.coordinates) };
}

/**
 * Reshapes the affected provinces in place (and appends `Golan`). Returns
 * the moves, in km², for the report.
 */
export function reshapeProvinces(features, regions) {
  const byName = new Map(features.map((f) => [f.properties.name, f]));
  for (const n of AFFECTED) if (!byName.has(n)) throw new Error(`Feature not found: ${n}`);
  if (byName.has(NEW_PROVINCE)) throw new Error(`${NEW_PROVINCE} already exists: the fix was applied already`);

  // Working geometries (Features or null).
  const geo = new Map(AFFECTED.map((n) => [n, { type: 'Feature', properties: {}, geometry: byName.get(n).geometry }]));
  geo.set(NEW_PROVINCE, null);
  const moves = [];
  // The candidate whose polygon touches the piece the most (within 300 m), or null.
  const touching = (piece, candidates) => {
    const near = buffer(piece, 0.3, { units: 'kilometers' });
    let best = null;
    let most = 0;
    for (const n of candidates) {
      const a = km2(inter(geo.get(n), near));
      if (a > most) [best, most] = [n, a];
    }
    return best;
  };
  const move = (from, to, piece) => {
    const a = km2(piece);
    if (a < 0.01) return;
    geo.set(from, minus(geo.get(from), piece));
    geo.set(to, plus(geo.get(to), piece));
    moves.push({ from, to, km2: Math.round(a) });
  };

  // North Sinai, which the old `Gaza` polygon covers, joins Sinai.
  move('Gaza', 'Sinai', geo.get('Gaza'));

  const steps = [
    { region: regions.golan, owner: () => NEW_PROVINCE },
    { region: regions.westBank, owner: () => 'Judea' },
    { region: regions.gazaStrip, owner: () => 'Gaza' },
    // Only Israeli provinces give land to Sinai; Egyptian ones stay.
    { region: regions.egyptSide, owner: () => 'Sinai', from: ['Acre', 'Negev', 'Judea', 'Al Karak', "Ma'an"] },
    {
      region: regions.israelProper,
      // Pieces under 15 km² are seams between the KML's layers (its Israel
      // outline runs a little outside its Golan and West Bank outlines):
      // they join the Golan or the West Bank they touch.
      owner: (piece) => (km2(piece) < 15 && touching(piece, ['Golan', 'Judea']))
        || (centroid(piece).geometry.coordinates[1] < 31.45 ? 'Negev' : 'Acre'),
      keep: ['Acre', 'Negev']
    }
  ];
  for (const { region, owner, from = AFFECTED, keep = [] } of steps) {
    for (const n of from) {
      if (keep.includes(n)) continue;
      for (const piece of parts(inter(geo.get(n), region))) {
        const to = owner(piece);
        if (to !== n) move(n, to, piece);
      }
    }
  }

  // A tail of `Sidon` reaches down the Jordan valley into Jordan, south of
  // the Yarmouk (about 32.6°N): Jordanian, not Lebanese.
  for (const piece of parts(geo.get('Sidon'))) {
    if (centroid(piece).geometry.coordinates[1] < 32.8) move('Sidon', 'Hawran', piece);
  }
  // Crumbs under 1 km² cut off from a province's main part join the
  // neighbour they touch the most.
  const names = [...AFFECTED, NEW_PROVINCE];
  for (const n of names) {
    const ps = parts(geo.get(n)).sort((a, b) => km2(b) - km2(a));
    for (const piece of ps.slice(1)) {
      if (km2(piece) >= 1) continue;
      const to = touching(piece, names.filter((x) => x !== n));
      if (to) move(n, to, piece);
    }
  }

  for (const n of AFFECTED) setGeometry(byName.get(n), geo.get(n));
  const golan = {
    type: 'Feature',
    properties: { wikiUrl: WIKI.Golan, name: NEW_PROVINCE, color: '#b5a1c9' },
    geometry: null
  };
  setGeometry(golan, geo.get(NEW_PROVINCE));
  features.push(golan);
  byName.get('Gaza').properties.wikiUrl = WIKI.Gaza;

  // Merge the moves per pair for the report.
  const merged = {};
  for (const m of moves) merged[`${m.from} -> ${m.to}`] = (merged[`${m.from} -> ${m.to}`] || 0) + m.km2;
  return merged;
}

// ---------------------------------------------------------------------------
// Area data
// ---------------------------------------------------------------------------

/** Linear between [year, value] anchors, clamped at both ends. */
function interpolate(anchors, year) {
  if (year <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [y1, v1] = anchors[i];
    const [y0, v0] = anchors[i - 1];
    if (year <= y1) return Math.round(v0 + (((v1 - v0) * (year - y0)) / (y1 - y0)));
  }
  return anchors[anchors.length - 1][1];
}
// Gaza Strip: ~250k after the 1948 refugee influx, 354,700 (1967 census),
// 1,001,569 (PCBS 1997), ~1.13M (2000).
const gazaPopulation = (year) => interpolate([[1948, 250000], [1967, 355000], [1997, 1000000], [2000, 1130000]], year);
// Israeli-held Golan: ~6,400 (1967) to ~35,000 (2000).
const golanPopulation = (year) => interpolate([[1967, 6400], [2000, 35000]], year);

/**
 * Which parts to apply: 'base' (Golan, Acre, Judea: safe with the old
 * geometry), 'gaza' (the Gaza Strip values: need the new geometry), or both.
 */
export function correctAreaYear(year, data, { parts: which = ['base', 'gaza'] } = {}) {
  const out = { ...data };
  const changes = {};
  const set = (prov, value) => {
    const before = Object.prototype.hasOwnProperty.call(data, prov) ? data[prov] : null;
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    out[prov] = value;
    changes[prov] = { before, after: value };
  };
  const copy = (prov) => (Array.isArray(data[prov]) ? [...data[prov]] : null);

  if (which.includes('base')) {
    const dam = copy('Damascus') || ['', '', '', '', 0];
    const golan = [dam[0], dam[1], dam[2], 'Quneitra', Math.round((Number(dam[4]) || 0) * 0.05)];
    if (year >= 1967) {
      golan[0] = 'ISR';
      golan[4] = golanPopulation(year);
    }
    if (year >= 1977) golan[3] = 'Katzrin';
    set(NEW_PROVINCE, golan);

    const acre = copy('Acre');
    if (acre) {
      if (acre[3] === 'Rio Branco') acre[3] = 'Acre';
      if (year === 1948 || year === 1949) [acre[0], acre[1], acre[2]] = ['ISR', 'israeli', 'jewish'];
      set('Acre', acre);
    }

    const judea = copy('Judea');
    if (judea && year >= 1948) {
      if (year <= 1966) judea[0] = 'JOR';
      else if (year < PA_YEAR) {
        judea[0] = 'ISR';
        if (judea[3] === 'Ramallah') judea[3] = 'Jerusalem';
      } else {
        judea[0] = 'PLS';
        judea[3] = 'Ramallah';
      }
      set('Judea', judea);
    }
  }

  if (which.includes('gaza')) {
    const gaza = copy('Gaza');
    if (gaza) {
      gaza[3] = 'Gaza';
      const acre = data.Acre;
      if (year >= 1517 && year <= 1947 && Array.isArray(acre)) [gaza[0], gaza[1], gaza[2]] = acre;
      if (year >= 1948) {
        let ruler = 'PLS';
        if (year < 1953) ruler = '_Kingdom_of_Egypt';
        else if (year < 1967) ruler = '_Egypt';
        else if (year < PA_YEAR) ruler = 'ISR';
        [gaza[0], gaza[1], gaza[2], gaza[4]] = [ruler, 'palestinian', 'sunni', gazaPopulation(year)];
      }
      set('Gaza', gaza);
    }
  }
  return { data: out, changes };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** [lon, lat], year -> expected ruler after the fix. */
export const CHECKS = [
  { name: 'Jenin', pt: [35.30, 32.46], expect: { 1955: 'JOR', 1970: 'ISR', 1990: 'ISR', 2000: 'PLS' } },
  { name: 'Nablus', pt: [35.26, 32.22], expect: { 1960: 'JOR', 1980: 'ISR', 1995: 'PLS' } },
  { name: 'Ramallah', pt: [35.20, 31.90], expect: { 1960: 'JOR', 1967: 'ISR', 1990: 'ISR', 2000: 'PLS' } },
  { name: 'Hebron', pt: [35.10, 31.53], expect: { 1948: 'JOR', 1960: 'JOR', 2000: 'PLS' } },
  { name: 'Jericho', pt: [35.45, 31.86], expect: { 1960: 'JOR', 2000: 'PLS' } },
  { name: 'Jordan valley, west bank', pt: [35.52, 32.0], expect: { 1960: 'JOR', 1980: 'ISR', 2000: 'PLS' } },
  { name: 'Jordan valley, east bank', pt: [35.62, 32.0], expect: { 2000: 'JOR' } },
  { name: 'Gaza City', pt: [34.46, 31.50], expect: { 1940: 'GBR', 1950: '_Kingdom_of_Egypt', 1960: '_Egypt', 1970: 'ISR', 1990: 'ISR', 2000: 'PLS' } },
  { name: 'Khan Yunis', pt: [34.33, 31.33], expect: { 1955: '_Egypt', 2000: 'PLS' } },
  { name: 'North Sinai near Rafah', pt: [34.2, 31.05], expect: { 1960: '_Egypt', 1970: 'ISR', 1990: '_Egypt' } },
  { name: 'Arish', pt: [33.80, 31.05], expect: { 1960: '_Egypt', 1970: 'ISR', 1990: '_Egypt' } },
  // 1958–61 Syria was part of the United Arab Republic: Damascus is _Egypt.
  { name: 'Katzrin', pt: [35.69, 32.99], expect: { 1955: 'SYR', 1960: '_Egypt', 1965: 'SYR', 1967: 'ISR', 2000: 'ISR' } },
  { name: 'Majdal Shams', pt: [35.77, 33.27], expect: { 1965: 'SYR', 2000: 'ISR' } },
  { name: 'Safed', pt: [35.50, 32.97], expect: { 1948: 'ISR', 2000: 'ISR' } },
  { name: 'Kiryat Shmona', pt: [35.57, 33.21], expect: { 1950: 'ISR', 2000: 'ISR' } },
  { name: 'East of Tyre', pt: [35.35, 33.28], expect: { 2000: 'LEB' } },
  { name: 'Bint Jbeil', pt: [35.43, 33.12], expect: { 1990: 'LEB', 2000: 'LEB' } },
  { name: 'Eilat', pt: [34.95, 29.56], expect: { 1950: 'ISR', 2000: 'ISR' } },
  { name: 'Aqaba', pt: [35.01, 29.53], expect: { 2000: 'JOR' } },
  { name: 'Beit Shemesh', pt: [34.99, 31.75], expect: { 1955: 'ISR', 2000: 'ISR' } },
  { name: 'West Jerusalem', pt: [35.19, 31.78], expect: { 1955: 'ISR', 2000: 'ISR' } },
  { name: 'Tel Aviv', pt: [34.78, 32.08], expect: { 1948: 'ISR', 2000: 'ISR' } },
  { name: 'Haifa', pt: [35.05, 32.78], expect: { 1940: 'GBR', 1948: 'ISR' } },
  { name: 'Beersheba', pt: [34.79, 31.25], expect: { 1950: 'ISR' } },
  { name: 'Amman', pt: [35.93, 31.95], expect: { 2000: 'JOR' } },
  { name: 'Damascus', pt: [36.29, 33.51], expect: { 2000: 'SYR' } },
  { name: 'Taba', pt: [34.86, 29.56], expect: { 1990: '_Egypt' } },
  { name: 'Nuweiba', pt: [34.60, 29.05], expect: { 1990: '_Egypt' } }
];

export const CHECK_YEARS = [...new Set(CHECKS.flatMap((c) => Object.keys(c.expect).map(Number)))].sort((a, b) => a - b);

/** Every province containing the point (more than one is an overlap). */
export function provincesAt(features, pt) {
  return features.filter((f) => f.geometry && booleanPointInPolygon(pt, f)).map((f) => f.properties.name);
}

/** Runs CHECKS; areasByYear holds the corrected area data of CHECK_YEARS. */
export function runChecks(features, areasByYear, log = console.log) {
  let failures = 0;
  for (const c of CHECKS) {
    const names = provincesAt(features, c.pt);
    for (const [year, expect] of Object.entries(c.expect)) {
      const ruler = names.length === 1 ? (areasByYear[year]?.[names[0]] || [])[0] : null;
      const ok = names.length === 1 && ruler === expect;
      if (!ok) failures++;
      log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(26)} ${year}  ${names.join('+') || 'NONE'} [${ruler ?? '-'}] (expected ${expect})`);
    }
  }
  return failures;
}

/**
 * In km²: overlaps between the changed provinces, land they covered before
 * and no longer cover (lost), and gaps between them that the unions closed
 * (gained; harmless).
 */
export function geometryInvariants(beforeFeatures, afterFeatures) {
  const names = [...AFFECTED, NEW_PROVINCE];
  const after = afterFeatures.filter((f) => names.includes(f.properties.name));
  const before = beforeFeatures.filter((f) => AFFECTED.includes(f.properties.name));
  let overlap = 0;
  for (let i = 0; i < after.length; i++) {
    for (let j = i + 1; j < after.length; j++) overlap += km2(inter(after[i], after[j]));
  }
  const all = (fs_) => fs_.reduce((u, f) => plus(u, f), null);
  const [ub, ua] = [all(before), all(after)];
  return { overlapKm2: overlap, lostKm2: km2(minus(ub, ua)), gainedKm2: km2(minus(ua, ub)) };
}

// ---------------------------------------------------------------------------
// Direct writes and revert
// ---------------------------------------------------------------------------

async function models() {
  const { default: AreaDynamo } = await import('../../server/models/dynamo/area.dynamo.js');
  const { default: MetadataDynamo } = await import('../../server/models/dynamo/metadata.dynamo.js');
  return { AreaDynamo, MetadataDynamo };
}

/**
 * One pass over the years: corrects each year and saves it when anything
 * changed, after appending its previous values to backup.jsonl. Resolves to
 * the number of years written.
 */
export async function writeAreaPass({ AreaDynamo, which, backupFile, years, log = console.log }) {
  let written = 0;
  for (const year of years) {
    const doc = await AreaDynamo.findById(year).exec();
    if (!doc || !doc.data) continue;
    const { data, changes } = correctAreaYear(year, doc.data, { parts: which });
    if (Object.keys(changes).length === 0) continue;
    const before = Object.fromEntries(Object.entries(changes).map(([p, c]) => [p, c.before]));
    fs.appendFileSync(backupFile, `${JSON.stringify({ year, before })}\n`);
    doc.data = data;
    if (typeof doc.markModified === 'function') doc.markModified('data');
    await doc.save();
    written++;
    if (written % 250 === 0) log(`  ${which.join('+')}: ${written} years written (at ${year})`);
  }
  return written;
}

async function saveMetadata(MetadataDynamo, id, mutate) {
  const doc = await MetadataDynamo.findById(id).exec();
  if (!doc) throw new Error(`The ${id} document does not exist`);
  mutate(doc);
  if (typeof doc.markModified === 'function') doc.markModified('data');
  await doc.save();
}

export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export async function applyDirect({ features, backupDir, distributionId, invalidate = invalidateAfterDirectWrites, log = console.log, loadModels = models, years = range(FIRST_YEAR, LAST_YEAR) }) {
  const { AreaDynamo, MetadataDynamo } = await loadModels();
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, 'areas.jsonl');

  const provinces = await MetadataDynamo.findById('provinces').exec();
  const provinceWiki = await MetadataDynamo.findById('province').exec();
  if (!provinces || !provinceWiki) throw new Error('provinces or province metadata missing');
  if (provinces.data.features.some((f) => f.properties?.name === NEW_PROVINCE)) {
    throw new Error(`${NEW_PROVINCE} is in the live provinces already: the fix was applied`);
  }
  fs.writeFileSync(path.join(backupDir, 'provinces.json'), JSON.stringify(provinces.data));
  fs.writeFileSync(path.join(backupDir, 'province.json'), JSON.stringify(provinceWiki.data));
  log(`Backups in ${backupDir}`);

  log('1/3 Golan, Acre and Judea in every year ...');
  const base = await writeAreaPass({ AreaDynamo, which: ['base'], backupFile, years, log });
  log(`    ${base} years written.`);

  log('2/3 provinces geometry and wiki links ...');
  await saveMetadata(MetadataDynamo, 'provinces', (doc) => { doc.data = { ...doc.data, features }; });
  await saveMetadata(MetadataDynamo, 'province', (doc) => { doc.data = { ...doc.data, ...WIKI }; });

  log('3/3 Gaza Strip values 1517–2000 ...');
  const gaza = await writeAreaPass({ AreaDynamo, which: ['gaza'], backupFile, years: years.filter((y) => y >= 1517), log });
  log(`    ${gaza} years written.`);

  return invalidate(['areas', 'metadata'], { distributionId });
}

/** Puts back what applyDirect changed, newest backup line first. */
export async function revertDirect({ backupDir, distributionId, invalidate = invalidateAfterDirectWrites, log = console.log, loadModels = models }) {
  const { AreaDynamo, MetadataDynamo } = await loadModels();
  const lines = fs.readFileSync(path.join(backupDir, 'areas.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const provinces = JSON.parse(fs.readFileSync(path.join(backupDir, 'provinces.json'), 'utf8'));
  const provinceWiki = JSON.parse(fs.readFileSync(path.join(backupDir, 'province.json'), 'utf8'));

  log('Restoring provinces geometry and wiki links ...');
  await saveMetadata(MetadataDynamo, 'provinces', (doc) => { doc.data = provinces; });
  await saveMetadata(MetadataDynamo, 'province', (doc) => { doc.data = provinceWiki; });

  log(`Restoring ${lines.length} area year entries ...`);
  for (const { year, before } of lines.reverse()) {
    const doc = await AreaDynamo.findById(year).exec();
    if (!doc) continue;
    const data = { ...doc.data };
    for (const [prov, value] of Object.entries(before)) {
      if (value === null) delete data[prov];
      else data[prov] = value;
    }
    doc.data = data;
    if (typeof doc.markModified === 'function') doc.markModified('data');
    await doc.save();
  }
  return invalidate(['areas', 'metadata'], { distributionId });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const direct = argv.includes('--direct');
  const revertAt = argv.indexOf('--revert');
  const distributionId = direct || revertAt >= 0 ? distributionIdFrom(argv) : null;

  if (revertAt >= 0) {
    const dir = argv[revertAt + 1];
    if (!dir) throw new Error('--revert needs the backup directory');
    if (!(await revertDirect({ backupDir: dir, distributionId }))) process.exitCode = 1;
    return;
  }

  const client = new ChronasClient({ apiUrl: API_URL });
  console.log(`Fetching provinces and ${CHECK_YEARS.length} area years from ${API_URL} ...`);
  const provRes = await client._req('GET', '/v1/metadata/provinces');
  if (!provRes.ok) throw new Error(`GET provinces failed: ${provRes.status}`);
  const { features } = provRes.body.data;
  const beforeFeatures = JSON.parse(JSON.stringify(features));

  const regions = buildRegions(readKml());
  const moves = reshapeProvinces(features, regions);
  console.log('\nMoved (km²):');
  for (const [k, v] of Object.entries(moves)) console.log(`  ${k.padEnd(22)} ${String(v).padStart(6)}`);

  const pick = (fs_, names) => featureCollection(fs_.filter((f) => names.includes(f.properties.name)));
  fs.writeFileSync(path.join(INPUTS_DIR, 'israel-1967-before.geojson'), JSON.stringify(pick(beforeFeatures, AFFECTED)));
  fs.writeFileSync(path.join(INPUTS_DIR, 'israel-1967-after.geojson'), JSON.stringify(pick(features, [...AFFECTED, NEW_PROVINCE])));

  const inv = geometryInvariants(beforeFeatures, features);
  console.log(`\nChanged provinces: overlap ${inv.overlapKm2.toFixed(2)} km², land lost ${inv.lostKm2.toFixed(2)} km², gaps closed ${inv.gainedKm2.toFixed(2)} km²`);

  const areasByYear = {};
  for (const year of CHECK_YEARS) {
    const res = await client._req('GET', `/v1/areas/${year}`);
    if (!res.ok) throw new Error(`GET areas/${year} failed: ${res.status}`);
    areasByYear[year] = correctAreaYear(year, res.body).data;
  }
  console.log('\nCity checks (new geometry, corrected area data):');
  const failures = runChecks(features, areasByYear);

  const failed = failures > 0 || inv.overlapKm2 > 1 || inv.lostKm2 > 1;
  if (failed) {
    console.error(`\n${failures} check(s) failed, or the provinces overlap or lost land: NOT applying.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');

  if (!direct) {
    console.log('\nDRY RUN: nothing written. --direct writes through the models (AWS credentials).');
    return;
  }
  const backupDir = path.join(BACKUP_ROOT, `israel-1967-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (!(await applyDirect({ features, backupDir, distributionId }))) process.exitCode = 1;
  console.log(`\nDone. Revert with: --revert ${backupDir}`);
}

function isMain() {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return [pathToFileURL(fs.realpathSync(script)).href, pathToFileURL(script).href].includes(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
