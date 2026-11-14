/**
 * Israel, the West Bank, East Jerusalem, Gaza and the Golan Heights, 1948–2000.
 *
 * Problem (verified 2026-11-14 against live `provinces` metadata and
 * /v1/areas, compared with a KML of the 2026 borders,
 * inputs/israel-1967-kml.geojson):
 *   - The Gaza Strip and the Golan Heights have no province of their own:
 *     they lie in `Acre` (ISR from 1950) and in `Damascus`/`Sidon`.
 *   - The northern West Bank lies in `Acre`, the west bank of the Jordan
 *     valley in `Hawran` (always JOR); `Judea` reaches into Israel.
 *   - Upper Galilee lies in `Sidon` (LEB), the Arava and Eilat in `Al Karak`
 *     (JOR), and parts of `Negev` and `Acre` lie in Egypt.
 *   - Years: `Acre` is GBR in 1948–49, `Judea` turns ISR only in 1968 and
 *     PLS already in 1989; `Acre`'s capital is "Rio Branco" from 1883.
 *
 * A province has one shape for all years, so moving land from one province
 * to another would change what that land shows in every year before 1948.
 * Instead, every piece of land that changes hands becomes a province of its
 * own (NEW_PROVINCES). Before 1948 it copies, year by year, the values of the
 * province it was cut from, so no ruler, culture, religion or capital
 * changes before 1948 anywhere. From 1948 it follows the modern rules.
 * Pieces under MIN_OWN_KM2 (border seams between the KML's layers) join the
 * neighbour they touch most; reshapeProvinces lists them as historyChanges.
 *
 * Geometry: only the KML's land borders cut (its coastline is coarse, so the
 * Gaza, Egypt and Israel clip regions extend into the sea). East Jerusalem
 * (Jordanian 1948–66) is cut along an approximation of the 1949 armistice
 * line, which the 2026 outline doesn't have. Every changed polygon is
 * repaired with JSTS (precision 1e-7°, buffer 0) and must be valid, free of
 * kinks and in one part.
 *
 * Values from 1948 (correctAreaYear):
 *   - `Acre`: ISR, israeli, jewish in 1948–49; capital Acre, not Rio Branco.
 *   - `Judea` (now the West Bank south of Samaria) and the other West Bank
 *     provinces: JOR 1948–66, ISR 1967 to PA_WEST_BANK_YEAR-1, then PLS.
 *     Simplified: the Gaza–Jericho Agreement (1994) handed over only Jericho
 *     in the West Bank, Areas A and B followed Oslo II (late 1995, elections
 *     January 1996), and Area C (about 60 %) stayed under Israel through 2000.
 *     The provinces stand for the Palestinian-administered West Bank.
 *   - `East Jerusalem`: JOR 1948–66, ISR from 1967. The Mount Scopus enclave
 *     (Israeli 1948–67) is too small to show.
 *   - `Gaza Strip`: Egypt 1948–66, ISR 1967 to PA_GAZA_YEAR-1, PLS from
 *     PA_GAZA_YEAR (Gaza–Jericho Agreement, May 1994). The Israeli occupation
 *     of Nov 1956–Mar 1957 (Suez) and the settlements, which stayed until
 *     2005, are not shown.
 *   - `Golan`, `Hermon`: Damascus's values 1948–66, ISR from 1967.
 *   - Israeli pieces copy `Acre` or `Negev`, Egyptian pieces copy `Sinai`.
 *   Population: before 1948 the share (by area) of the source province's
 *   figure, which the source loses; from 1948 the same from the province it
 *   copies, except Gaza, East Jerusalem and Golan, which use census figures.
 *
 * Usage:
 *   node scripts/data-validation/israel-1967-borders.js [--out <dir>]
 *        # dry run: computes the new geometry from the committed fixtures,
 *        # checks it against the live area data (cities 1940–2000, and every
 *        # 25th year −2000…1925 for unchanged history), writes nothing to the
 *        # API; with --out writes the result GeoJSON and plan there
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/israel-1967-borders.js --direct [--distribution-id ID]
 *        # writes through the models, after a backup to
 *        # infra/backups/israel-1967-<timestamp>/, then invalidates
 *        # /v1/areas/* and /v1/metadata* on CloudFront
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/israel-1967-borders.js --revert <backup dir> [--legacy-backup]
 *        # puts back what a --direct run changed. Refuses if a written
 *        # province shape changed since; skips (and reports) area values
 *        # that changed since. --legacy-backup restores area lines without a
 *        # recorded `after` value unconditionally (backups of the first run).
 *
 * Order of a --direct run: (1) every year gets the new provinces' values and
 * the Acre/Judea fixes, while the old geometry is still live (the new keys
 * are unused there); (2) the provinces geometry and the wiki links.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import jsts from 'jsts';
import {
  area as turfArea,
  booleanPointInPolygon,
  buffer,
  centroid,
  difference,
  featureCollection,
  flatten,
  intersect,
  kinks,
  pointOnFeature,
  polygon as turfPolygon,
  union
} from '@turf/turf';
import { distributionIdFrom, invalidateAfterDirectWrites } from './edge-invalidation-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(__dirname, 'inputs');
export const KML_FILE = path.join(INPUTS_DIR, 'israel-1967-kml.geojson');
/** The affected live provinces as they were on 2026-11-14, before any change. Read-only input. */
export const BEFORE_FILE = path.join(INPUTS_DIR, 'israel-1967-before.geojson');
/** What reshapeProvinces makes of BEFORE_FILE. Regenerate with --out and review the diff. */
export const AFTER_FILE = path.join(INPUTS_DIR, 'israel-1967-after.geojson');
const BACKUP_ROOT = process.env.EDGE_BACKUP_DIR || path.join(__dirname, '../../infra/backups');
const API_URL = process.env.CHRONAS_API_URL || 'https://api.chronas.org';

export const MODERN_YEAR = 1948;
/** Gaza–Jericho Agreement, May 1994. */
export const PA_GAZA_YEAR = 1994;
/** Oslo II took effect in the West Bank cities in late 1995; first PA elections January 1996. */
export const PA_WEST_BANK_YEAR = 1996;
export const FIRST_YEAR = -2000;
export const LAST_YEAR = 2000;
/** Pieces at least this large become their own province; smaller ones join a neighbour. */
export const MIN_OWN_KM2 = 100;

/** Every live province whose polygon this script may change. */
export const AFFECTED = ['Acre', 'Judea', 'Negev', 'Sidon', 'Damascus', 'Hawran', 'Al Karak', "Ma'an", 'Gaza', 'Sinai'];

/**
 * Provinces for the land that changes hands, by the province it is cut
 * from (`source`) and the zone it lies in. `modernFrom` is the province it
 * copies from 1948. `where` picks between pieces of one source and zone by
 * the piece's centroid [lon, lat]; `always` makes it a province even below
 * MIN_OWN_KM2.
 */
export const NEW_PROVINCES = {
  'Gaza Strip': { source: 'Acre', zone: 'gazaStrip', wiki: 'Gaza_Strip', capital: 'Gaza' },
  Golan: { source: 'Damascus', zone: 'golan', modernFrom: 'Damascus', wiki: 'Golan_Heights', capital: (y) => (y >= 1977 ? 'Katzrin' : 'Quneitra') },
  Hermon: { source: 'Sidon', zone: 'golan', modernFrom: 'Damascus', wiki: 'Mount_Hermon', capital: 'Majdal Shams' },
  Samaria: { source: 'Acre', zone: 'westBank', modernFrom: 'Judea', wiki: 'Samaria', capital: 'Nablus' },
  'Jordan Valley': { source: 'Hawran', zone: 'westBank', modernFrom: 'Judea', wiki: 'Jordan_Valley', capital: 'Al-Jiftlik' },
  'East Jerusalem': { source: 'Judea', zone: 'eastJerusalem', modernFrom: 'Judea', wiki: 'East_Jerusalem', capital: 'Jerusalem' },
  'Jerusalem Corridor': {
    source: 'Judea', zone: 'israelProper', modernFrom: 'Acre', wiki: 'Jerusalem_corridor', capital: 'Jerusalem', where: ([, lat]) => lat >= 31.45
  },
  Yatir: { source: 'Judea', zone: 'israelProper', modernFrom: 'Negev', wiki: 'Yatir_Forest', capital: 'Meitar', where: ([, lat]) => lat < 31.45 },
  'Upper Galilee': { source: 'Sidon', zone: 'israelProper', modernFrom: 'Acre', wiki: 'Upper_Galilee', capital: 'Safed' },
  // The strip east of the Sea of Galilee that Israel held 1949–67 (Ein Gev):
  // cut off from Damascus by the Golan, too small for MIN_OWN_KM2.
  'Kinneret East Shore': {
    source: 'Damascus', zone: 'israelProper', modernFrom: 'Acre', wiki: 'Ein_Gev', capital: 'Ein Gev', always: true, where: ([, lat]) => lat > 32.75
  },
  Arava: { source: 'Al Karak', zone: 'israelProper', modernFrom: 'Negev', wiki: 'Arabah', capital: 'Eilat' },
  'Sheikh Zuweid': { source: 'Acre', zone: 'egyptSide', modernFrom: 'Sinai', wiki: 'Sheikh_Zuweid', capital: 'Sheikh Zuweid' },
  Kuntilla: { source: 'Negev', zone: 'egyptSide', modernFrom: 'Sinai', wiki: 'Kuntillet_Ajrud', capital: 'Kuntilla' }
};
export const NEW_NAMES = Object.keys(NEW_PROVINCES);

/**
 * Cut-off parts whose neighbour the touching rule gets wrong. Sidon reaches
 * down the Jordan valley east of the river, south of the Yarmouk: that land
 * is Jordanian (Hawran), not Syrian.
 */
const CUT_OFF_OWNERS = [{ from: 'Sidon', at: [35.569, 32.595], to: 'Hawran' }];

/** Which original provinces keep the land of each zone; the others give it up. */
const ZONE_HOMES = {
  golan: [],
  westBank: ['Judea'],
  eastJerusalem: [],
  gazaStrip: [],
  egyptSide: ['Sinai', 'Gaza'],
  israelProper: ['Acre', 'Negev']
};
const ZONE_ORDER = ['golan', 'westBank', 'eastJerusalem', 'gazaStrip', 'egyptSide', 'israelProper'];

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const fc = (...features) => featureCollection(features.filter(Boolean));
const inter = (a, b) => (a && b ? intersect(fc(a, b)) : null);
const minus = (a, b) => (a && b ? difference(fc(a, b)) : a);
const plus = (a, b) => (a && b ? union(fc(a, b)) : a || b);
export const km2 = (g) => (g ? turfArea(g) / 1e6 : 0);
const latLon = (g) => centroid(g).geometry.coordinates;
/** A point inside the (multi)polygon: its centroid if inside, else turf's pointOnFeature. */
const pointInside = (g) => (booleanPointInPolygon(centroid(g), g) ? centroid(g) : pointOnFeature(g));

/** Parts of a (multi)polygon, without crumbs under 0.01 km². */
export function parts(g) {
  if (!g) return [];
  return flatten(g).features.filter((p) => km2(p) >= 0.01);
}

const toGeometry = (ps) => (ps.length === 1
  ? ps[0].geometry
  : { type: 'MultiPolygon', coordinates: ps.map((p) => p.geometry.coordinates) });

const reader = new jsts.io.GeoJSONReader();
const writer = new jsts.io.GeoJSONWriter();
const precision = new jsts.geom.PrecisionModel(1e7);

/**
 * A valid polygon: coordinates snapped to 1e-7° (about 1 cm), then JSTS
 * buffer(0), which removes the zero-width spikes and pinches that overlay
 * operations leave where nearly parallel edges meet.
 */
export function repair(geometry) {
  const g = jsts.precision.GeometryPrecisionReducer.reduce(reader.read(geometry), precision).buffer(0);
  return writer.write(g);
}

/** Why a changed polygon is not acceptable, or null. */
export function geometryProblem(feature) {
  const g = reader.read(feature.geometry);
  if (!new jsts.operation.valid.IsValidOp(g).isValid()) return 'invalid (JSTS)';
  const k = kinks(feature).features.length;
  if (k > 0) return `${k} self-intersection(s)`;
  const ps = flatten(feature).features;
  if (ps.length !== 1) return `${ps.length} parts: ${ps.map((p) => `${km2(p).toFixed(2)} km² at ${latLon(p).map((x) => x.toFixed(3))}`).join('; ')}`;
  return null;
}

// ---------------------------------------------------------------------------
// Clip regions
// ---------------------------------------------------------------------------

export function readGeoJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readKml(file = KML_FILE) {
  return Object.fromEntries(readGeoJSON(file).features.map((f) => [f.properties.name, f]));
}

/**
 * East of the 1949 armistice line in Jerusalem (approximate, ±200 m): the
 * Old City, Sheikh Jarrah and Mount Scopus east, Mount Zion and Ramat Rachel
 * west. Only the part outside the KML's West Bank is used.
 */
const EAST_JERUSALEM_SIDE = turfPolygon([[
  [35.2050, 31.8150], [35.2150, 31.7960], [35.2240, 31.7900], [35.2265, 31.7795], [35.2262, 31.7760],
  [35.2275, 31.7735], [35.2320, 31.7725], [35.2330, 31.7675], [35.2300, 31.7600], [35.2250, 31.7480],
  [35.2200, 31.7330], [35.2600, 31.7330], [35.2600, 31.8150], [35.2050, 31.8150]
]]);

/**
 * The candidate whose geometry touches the piece the most (within 300 m), or
 * null. With `join`, only a candidate the piece actually joins (their union
 * has no more parts than the candidate alone), so no exclave is made.
 */
function mostTouching(piece, candidates, { join = false } = {}) {
  const near = buffer(piece, 0.3, { units: 'kilometers' });
  let best = null;
  let most = 0;
  for (const [name, g] of candidates) {
    const a = km2(inter(g, near));
    if (a <= most) continue;
    if (join && parts(plus(g, piece)).length > parts(g).length) continue;
    [best, most] = [name, a];
  }
  return best;
}

/**
 * The KML as clip regions. Its coastline is a few straight lines, so the
 * Gaza Strip, the Egyptian side and Israel extend into the sea: only their
 * land borders cut our provinces. Its Israel outline runs a little outside
 * its Golan and West Bank outlines; those seams join the Golan or West Bank
 * they touch, so the regions fit together without gaps or slivers.
 */
export function buildRegions(kml) {
  const ring = (name) => kml[name].geometry.coordinates[0];
  const gaza = ring('Gaza');
  // Gaza ring: Rafah (0) along the Egyptian and Israeli land borders to the
  // northern beach (11), then the KML's straight coastline back to Rafah.
  const gazaStrip = turfPolygon([[...gaza.slice(0, 12), [34.40, 31.66], [34.17, 31.37], gaza[0]]]);

  const israel = ring('Israel 2026');
  const rafah = israel.findIndex(([x, y]) => x === 34.213992 && y === 31.3306473);
  const roshHanikra = israel.findIndex(([x, y]) => x === 35.1063106 && y === 33.0932007);
  if (rafah < 0 || roshHanikra < 0) throw new Error('KML: Rafah or Rosh HaNikra vertex not found');
  const egyptBorder = israel.slice(rafah + 1, israel.length - 1); // … to Taba
  // … then along Israel's Eilat shore into the Gulf of Aqaba (israel[1..4]).
  const egyptSide = turfPolygon([[
    [34.17, 31.37], gaza[0], gaza[1], ...egyptBorder, ...israel.slice(0, 5), [34.93, 29.35], [32.0, 29.35], [32.0, 31.37], [34.17, 31.37]
  ]]);
  const sea = turfPolygon([[
    israel[roshHanikra], [34.0, 33.0932007], [34.0, 31.37], [34.17, 31.37], [34.6, 31.4], [35.0, 32.8], israel[roshHanikra]
  ]]);

  // Golan: down to the Yarmouk at Hamat Gader (35.665, 32.68), which the
  // KML's straight southern edge leaves out.
  const golanRing = [...ring('Golan Heights')];
  const sw = golanRing.findIndex(([x, y]) => x === 35.6464283 && y === 32.6767292);
  if (sw < 0) throw new Error('KML: Golan south-west vertex not found');
  golanRing.splice(sw + 1, 0, [35.665, 32.680]);
  let golan = turfPolygon([golanRing]);
  let westBank = kml['Pal Auth'];

  const land = plus(kml['Israel 2026'], sea);
  const rest = () => [golan, westBank, gazaStrip, egyptSide].reduce((g, r) => minus(g, r), land);
  const seams = parts(rest()).sort((a, b) => km2(b) - km2(a)).slice(1);
  for (const seam of seams) {
    const to = mostTouching(seam, [['golan', golan], ['westBank', westBank]]);
    if (to === 'golan') golan = plus(golan, seam);
    else if (to === 'westBank') westBank = plus(westBank, seam);
  }
  const israelAll = rest();
  const eastJerusalem = inter(israelAll, EAST_JERUSALEM_SIDE);
  const israelProper = minus(israelAll, EAST_JERUSALEM_SIDE);
  return { golan, westBank, eastJerusalem, gazaStrip, egyptSide, israelProper };
}

// ---------------------------------------------------------------------------
// Reshape
// ---------------------------------------------------------------------------

function newProvinceFor(source, zone, piece) {
  const candidates = Object.entries(NEW_PROVINCES).filter(([, d]) => d.source === source && d.zone === zone);
  const c = latLon(piece);
  const hit = candidates.filter(([, d]) => !d.where || d.where(c));
  return hit.length === 1 ? hit[0][0] : null;
}

/**
 * Reshapes the affected provinces in place and appends the new ones.
 * Returns the plan: for each new province its source and area shares, and
 * the historyChanges (pieces that took a neighbour's history before 1948)
 * and the unassigned pieces (left with their province).
 */
export function reshapeProvinces(features, regions) {
  const byName = new Map(features.map((f) => [f.properties.name, f]));
  for (const n of AFFECTED) if (!byName.has(n)) throw new Error(`Feature not found: ${n}`);
  for (const n of NEW_NAMES) if (byName.has(n)) throw new Error(`${n} exists already: the fix was applied`);

  const geo = new Map(AFFECTED.map((n) => [n, { type: 'Feature', properties: {}, geometry: byName.get(n).geometry }]));
  const beforeKm2 = Object.fromEntries(AFFECTED.map((n) => [n, km2(geo.get(n))]));
  for (const n of NEW_NAMES) geo.set(n, null);
  const historyChanges = [];
  const take = (from, to, piece, record) => {
    geo.set(from, minus(geo.get(from), piece));
    geo.set(to, plus(geo.get(to), piece));
    if (record) {
      historyChanges.push({ from, to, km2: Number(km2(piece).toFixed(2)), at: latLon(piece).map((x) => Number(x.toFixed(3))) });
    }
  };

  // 1. Land that changes hands: its own province, or (when small) pending.
  const pending = [];
  for (const zone of ZONE_ORDER) {
    const region = regions[zone];
    for (const n of AFFECTED) {
      if (ZONE_HOMES[zone].includes(n)) continue;
      for (const piece of parts(inter(geo.get(n), region))) {
        const own = newProvinceFor(n, zone, piece);
        if (own && (km2(piece) >= MIN_OWN_KM2 || ZONE_HOMES[zone].length === 0 || NEW_PROVINCES[own].always)) take(n, own, piece, false);
        else if (km2(piece) >= MIN_OWN_KM2) throw new Error(`No new province for ${km2(piece).toFixed(0)} km² of ${n} in ${zone} at ${latLon(piece)}`);
        else pending.push({ from: n, zone, piece });
      }
    }
  }
  // 2. Small pieces join the zone's home or new province they touch most.
  // One that joins none (south of the Dead Sea no province covers the land
  // between Negev and Al Karak) stays where it is, so it doesn't become an
  // exclave; it is listed as `unassigned`.
  const unassigned = [];
  for (const { from, zone, piece } of pending) {
    const candidates = [...ZONE_HOMES[zone], ...NEW_NAMES.filter((x) => NEW_PROVINCES[x].zone === zone)]
      .filter((x) => geo.get(x))
      .map((x) => [x, geo.get(x)]);
    const to = mostTouching(piece, candidates, { join: true });
    if (to) take(from, to, piece, true);
    else unassigned.push({ province: from, zone, km2: Number(km2(piece).toFixed(2)), at: latLon(piece).map((x) => Number(x.toFixed(3))) });
  }
  // 3. Parts cut off from a province's main part join the neighbour they
  // touch most (the main part keeps the name), among the provinces of the
  // zone the part lies in, or outside all zones among the provinces that
  // keep no zone's land. Crumbs under 1 km² may join any neighbour. Runs
  // again after the repair, which can split a polygon at a pinch.
  const names = [...AFFECTED, ...NEW_NAMES];
  const zoneOf = (piece) => ZONE_ORDER.find((z) => booleanPointInPolygon(pointInside(piece), regions[z])) || null;
  const zoneProvinces = (zone) => (zone
    ? [...ZONE_HOMES[zone], ...NEW_NAMES.filter((x) => NEW_PROVINCES[x].zone === zone)]
    : AFFECTED.filter((x) => !Object.values(ZONE_HOMES).flat().includes(x)));
  const mergeCutOffParts = () => {
    for (const n of names) {
      const ps = parts(geo.get(n)).sort((a, b) => km2(b) - km2(a));
      for (const piece of ps.slice(1)) {
        if (km2(piece) >= MIN_OWN_KM2) throw new Error(`${n} has a second part of ${km2(piece).toFixed(0)} km² at ${latLon(piece)}`);
        const live = (xs) => xs.filter((x) => x !== n && geo.get(x)).map((x) => [x, geo.get(x)]);
        const fixedOwner = CUT_OFF_OWNERS.find((o) => o.from === n && booleanPointInPolygon(o.at, buffer(piece, 1, { units: 'kilometers' })));
        const to = (fixedOwner && fixedOwner.to)
          || mostTouching(piece, live(zoneProvinces(zoneOf(piece))), { join: true })
          || (km2(piece) < 1 ? mostTouching(piece, live(names), { join: true }) : null);
        if (!to) throw new Error(`${km2(piece).toFixed(2)} km² of ${n} at ${latLon(piece)} touches no province of its zone`);
        take(n, to, piece, true);
      }
    }
  };
  const repairAll = () => {
    for (const n of names) {
      const kept = parts(geo.get(n));
      geo.set(n, kept.length ? { type: 'Feature', properties: {}, geometry: repair(toGeometry(kept)) } : null);
    }
  };
  mergeCutOffParts();
  repairAll();
  mergeCutOffParts();
  repairAll();

  // 4. Write back.
  for (const n of AFFECTED) {
    if (!geo.get(n)) throw new Error(`${n} would have no area left`);
    byName.get(n).geometry = geo.get(n).geometry;
  }
  const newProvinces = {};
  for (const n of NEW_NAMES) {
    if (!geo.get(n)) throw new Error(`New province ${n} got no land`);
    const d = NEW_PROVINCES[n];
    const feature = {
      type: 'Feature',
      properties: { wikiUrl: d.wiki, name: n, color: '#b5a1c9' },
      geometry: geo.get(n).geometry
    };
    features.push(feature);
    newProvinces[n] = { source: d.source, share: Number((km2(feature) / beforeKm2[d.source]).toFixed(6)) };
  }
  // Shares of the province each copies from 1948, by its new size.
  const afterKm2 = (n) => km2(features.find((f) => f.properties.name === n));
  for (const n of NEW_NAMES) {
    const from = NEW_PROVINCES[n].modernFrom;
    if (from) newProvinces[n].modernShare = Number((afterKm2(n) / (afterKm2(from) + afterKm2(n))).toFixed(6));
  }
  return { newProvinces, historyChanges, unassigned };
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
// ~250k after the 1948 refugee influx, 354,700 (1967 census), 1,001,569 (PCBS 1997), ~1.13M (2000).
const gazaPopulation = (year) => interpolate([[1948, 250000], [1967, 355000], [1997, 1000000], [2000, 1130000]], year);
// ~60k (1948), ~70k (1967), ~400k incl. new neighbourhoods (2000).
const eastJerusalemPopulation = (year) => interpolate([[1948, 60000], [1967, 70000], [2000, 400000]], year);
// Israeli-held Golan: ~6,400 (1967) to ~35,000 (2000), split Golan/Hermon (Majdal Shams).
const golanPopulation = (name, year) => {
  const total = interpolate([[1967, 6400], [2000, 35000]], year);
  return name === 'Hermon' ? Math.round(total * 0.3) : Math.round(total * 0.7);
};

const westBankRuler = (year) => {
  if (year < 1967) return 'JOR';
  return year < PA_WEST_BANK_YEAR ? 'ISR' : 'PLS';
};
const capitalOf = (d, year) => (typeof d.capital === 'function' ? d.capital(year) : d.capital);
const isRow = (v) => Array.isArray(v);
const num = (v) => Number(v) || 0;

/**
 * The corrected data of one year. `plan` is what reshapeProvinces returned.
 * A year that has any new province already is returned unchanged.
 */
export function correctAreaYear(year, data, plan) {
  const out = { ...data };
  const changes = {};
  if (NEW_NAMES.some((n) => Object.prototype.hasOwnProperty.call(data, n))) return { data: out, changes };
  const set = (prov, value) => {
    const before = Object.prototype.hasOwnProperty.call(data, prov) ? data[prov] : null;
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    out[prov] = value;
    changes[prov] = { before, after: value };
  };

  // The original provinces' own fixes.
  if (isRow(data.Acre)) {
    const acre = [...data.Acre];
    if (acre[3] === 'Rio Branco') acre[3] = 'Acre';
    if (year === 1948 || year === 1949) [acre[0], acre[1], acre[2]] = ['ISR', 'israeli', 'jewish'];
    set('Acre', acre);
  }
  if (isRow(data.Judea) && year >= MODERN_YEAR) {
    const judea = [...data.Judea];
    judea[0] = westBankRuler(year);
    judea[3] = judea[0] === 'PLS' ? 'Ramallah' : 'Jerusalem';
    set('Judea', judea);
  }
  const fixed = { ...out }; // after the fixes, before population moves

  // The new provinces; population moves from the province they share.
  const popTaken = {};
  for (const n of NEW_NAMES) {
    const d = NEW_PROVINCES[n];
    const p = plan.newProvinces[n];
    const src = fixed[d.source];
    if (!isRow(src)) continue; // no source this year: no value
    let row;
    let from = null;
    if (year < MODERN_YEAR) {
      row = [...src];
      row[4] = Math.round(num(src[4]) * p.share);
      from = d.source;
    } else if (d.zone === 'gazaStrip') {
      let ruler = 'PLS';
      if (year < 1953) ruler = '_Kingdom_of_Egypt';
      else if (year < 1967) ruler = '_Egypt';
      else if (year < PA_GAZA_YEAR) ruler = 'ISR';
      row = [ruler, 'palestinian', 'sunni', d.capital, gazaPopulation(year)];
    } else if (d.zone === 'eastJerusalem') {
      row = [year < 1967 ? 'JOR' : 'ISR', 'palestinian', 'sunni', d.capital, eastJerusalemPopulation(year)];
    } else {
      const base = fixed[d.modernFrom];
      if (!isRow(base)) continue;
      row = [base[0], base[1], base[2], capitalOf(d, year), Math.round(num(base[4]) * p.modernShare)];
      from = d.modernFrom;
      if (d.zone === 'golan' && year >= 1967) {
        row[0] = 'ISR';
        row[4] = golanPopulation(n, year);
        from = null;
      }
    }
    if (from) popTaken[from] = (popTaken[from] || 0) + row[4];
    set(n, row);
  }
  for (const [prov, taken] of Object.entries(popTaken)) {
    if (!taken || !isRow(fixed[prov])) continue;
    const row = [...fixed[prov]];
    row[4] = Math.max(0, num(fixed[prov][4]) - taken);
    set(prov, row);
  }
  return { data: out, changes };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** [lon, lat], year -> expected ruler after the fix. */
export const CHECKS = [
  { name: 'Jenin', pt: [35.30, 32.46], expect: { 1955: 'JOR', 1970: 'ISR', 1995: 'ISR', 2000: 'PLS' } },
  { name: 'Nablus', pt: [35.26, 32.22], expect: { 1960: 'JOR', 1980: 'ISR', 1996: 'PLS' } },
  { name: 'Ramallah', pt: [35.20, 31.90], expect: { 1948: 'JOR', 1960: 'JOR', 1967: 'ISR', 1990: 'ISR', 2000: 'PLS' } },
  { name: 'Hebron', pt: [35.10, 31.53], expect: { 1948: 'JOR', 1960: 'JOR', 2000: 'PLS' } },
  { name: 'Jericho', pt: [35.45, 31.86], expect: { 1960: 'JOR', 2000: 'PLS' } },
  { name: 'Jordan valley, west bank', pt: [35.52, 32.0], expect: { 1960: 'JOR', 1980: 'ISR', 2000: 'PLS' } },
  { name: 'Jordan valley, east bank', pt: [35.62, 32.0], expect: { 2000: 'JOR' } },
  { name: 'Old City of Jerusalem', pt: [35.2345, 31.7767], expect: { 1955: 'JOR', 1970: 'ISR', 2000: 'ISR' } },
  { name: 'Sheikh Jarrah', pt: [35.233, 31.792], expect: { 1955: 'JOR', 2000: 'ISR' } },
  { name: 'West Jerusalem', pt: [35.19, 31.78], expect: { 1948: 'ISR', 1955: 'ISR', 2000: 'ISR' } },
  { name: 'Ramat Rachel', pt: [35.215, 31.742], expect: { 1955: 'ISR' } },
  { name: 'Beit Shemesh', pt: [34.99, 31.75], expect: { 1955: 'ISR', 2000: 'ISR' } },
  { name: 'Gaza City', pt: [34.46, 31.50], expect: { 1940: 'GBR', 1950: '_Kingdom_of_Egypt', 1960: '_Egypt', 1970: 'ISR', 1990: 'ISR', 1994: 'PLS', 2000: 'PLS' } },
  { name: 'Khan Yunis', pt: [34.33, 31.33], expect: { 1955: '_Egypt', 2000: 'PLS' } },
  { name: 'North Sinai near Rafah', pt: [34.2, 31.05], expect: { 1960: '_Egypt', 1970: 'ISR', 1990: '_Egypt' } },
  { name: 'Arish', pt: [33.80, 31.05], expect: { 1960: '_Egypt', 1970: 'ISR', 1990: '_Egypt' } },
  // 1958–61 Syria was part of the United Arab Republic: Damascus is _Egypt.
  { name: 'Katzrin', pt: [35.69, 32.99], expect: { 1955: 'SYR', 1960: '_Egypt', 1965: 'SYR', 1967: 'ISR', 2000: 'ISR' } },
  { name: 'Majdal Shams', pt: [35.77, 33.27], expect: { 1965: 'SYR', 2000: 'ISR' } },
  { name: 'Hamat Gader', pt: [35.665, 32.684], expect: { 1965: 'SYR', 1970: 'ISR' } },
  { name: 'Safed', pt: [35.50, 32.97], expect: { 1948: 'ISR', 2000: 'ISR' } },
  { name: 'Kiryat Shmona', pt: [35.57, 33.21], expect: { 1950: 'ISR', 2000: 'ISR' } },
  { name: 'Sea of Galilee', pt: [35.58, 32.82], expect: { 1950: 'ISR' } },
  { name: 'East of Tyre', pt: [35.35, 33.28], expect: { 2000: 'LEB' } },
  { name: 'Bint Jbeil', pt: [35.43, 33.12], expect: { 1990: 'LEB', 2000: 'LEB' } },
  { name: 'Eilat', pt: [34.95, 29.56], expect: { 1950: 'ISR', 2000: 'ISR' } },
  { name: 'Taba–Eilat border, Egyptian side', pt: [34.872, 29.56], expect: { 1990: '_Egypt' } },
  { name: 'Taba', pt: [34.86, 29.56], expect: { 1990: '_Egypt' } },
  { name: 'Aqaba', pt: [35.01, 29.53], expect: { 2000: 'JOR' } },
  { name: 'Tel Aviv', pt: [34.78, 32.08], expect: { 1948: 'ISR', 2000: 'ISR' } },
  { name: 'Haifa', pt: [35.05, 32.78], expect: { 1940: 'GBR', 1948: 'ISR' } },
  { name: 'Beersheba', pt: [34.79, 31.25], expect: { 1950: 'ISR' } },
  { name: 'Amman', pt: [35.93, 31.95], expect: { 2000: 'JOR' } },
  { name: 'Damascus', pt: [36.29, 33.51], expect: { 2000: 'SYR' } },
  { name: 'Nuweiba', pt: [34.60, 29.05], expect: { 1990: '_Egypt' } }
];

export const CHECK_YEARS = [...new Set(CHECKS.flatMap((c) => Object.keys(c.expect).map(Number)))].sort((a, b) => a - b);

/** Every province containing the point (more than one is an overlap). */
export function provincesAt(features, pt) {
  return features.filter((f) => f.geometry && booleanPointInPolygon(pt, f)).map((f) => f.properties.name);
}

/** Runs CHECKS; areasByYear holds the corrected area data of CHECK_YEARS. Logs failures. */
export function runChecks(features, areasByYear, log = console.log) {
  let failures = 0;
  for (const c of CHECKS) {
    const names = provincesAt(features, c.pt);
    for (const [year, expect] of Object.entries(c.expect)) {
      const ruler = names.length === 1 ? (areasByYear[year]?.[names[0]] || [])[0] : null;
      if (names.length === 1 && ruler === expect) continue;
      failures++;
      log(`  FAIL  ${c.name.padEnd(34)} ${year}  ${names.join('+') || 'NONE'} [${ruler ?? '-'}] (expected ${expect})`);
    }
  }
  return failures;
}

/** Points every `step` degrees (0.02° ≈ 2 km) that lie in one of the features. */
export function gridPoints(features, step = 0.02) {
  const pts = [];
  for (let lon = 33.8; lon <= 36.4; lon += step) {
    for (let lat = 29.3; lat <= 33.6; lat += step) pts.push([Number(lon.toFixed(4)), Number(lat.toFixed(4))]);
  }
  return pts.filter((pt) => provincesAt(features, pt).length > 0);
}

/**
 * The points whose ruler, culture, religion or capital differs before and
 * after the fix in `year`, given that year's original area data. Acre's
 * capital "Rio Branco" counts as "Acre", the one intended change.
 */
export function historyDiff(beforeFeatures, afterFeatures, data, plan, year, points) {
  const corrected = correctAreaYear(year, data, plan).data;
  const diffs = [];
  for (const pt of points) {
    const [b] = provincesAt(beforeFeatures, pt);
    const [a] = provincesAt(afterFeatures, pt);
    const vb = (data[b] || []).slice(0, 4);
    if (vb[3] === 'Rio Branco') vb[3] = 'Acre'; // the one intended change before 1948
    const va = (corrected[a] || []).slice(0, 4);
    if (JSON.stringify(vb) !== JSON.stringify(va)) diffs.push({ pt, before: b, after: a, vb, va });
  }
  return diffs;
}

/** A point within 3 km of a declared history change (the only places history may differ). */
export const inDeclaredChange = (plan, pt) => plan.historyChanges.some((h) => Math.hypot(h.at[0] - pt[0], h.at[1] - pt[1]) < 0.03 + (Math.sqrt(h.km2) / 100));

/** Area of a JSTS geometry in km² (degrees² scaled at its centroid's latitude). */
function jstsKm2(g) {
  if (g.isEmpty()) return 0;
  const lat = g.getCentroid().getY();
  return g.getArea() * 111.32 * 111.32 * Math.cos((lat * Math.PI) / 180);
}

/**
 * In km², measured with JSTS (turf's overlays leave degenerate slivers
 * whose turf area is meaningless): overlaps between the changed provinces,
 * land they covered before and no longer cover, and gaps between them the
 * unions closed (harmless); plus each changed province's geometry problems.
 */
export function geometryInvariants(beforeFeatures, afterFeatures) {
  const names = [...AFFECTED, ...NEW_NAMES];
  const after = afterFeatures.filter((f) => names.includes(f.properties.name));
  const before = beforeFeatures.filter((f) => AFFECTED.includes(f.properties.name));
  const ga = after.map((f) => reader.read(f.geometry));
  let overlap = 0;
  for (let i = 0; i < ga.length; i++) {
    for (let j = i + 1; j < ga.length; j++) {
      if (ga[i].getEnvelopeInternal().intersects(ga[j].getEnvelopeInternal())) overlap += jstsKm2(ga[i].intersection(ga[j]));
    }
  }
  const all = (gs) => gs.reduce((u, g) => u.union(g));
  const ub = all(before.map((f) => reader.read(f.geometry)));
  const ua = all(ga);
  const problems = after.map((f) => [f.properties.name, geometryProblem(f)]).filter(([, p]) => p);
  return { overlapKm2: overlap, lostKm2: jstsKm2(ub.difference(ua)), gainedKm2: jstsKm2(ua.difference(ub)), problems };
}

/** The whole computation, from the committed fixtures. */
export function computeFix() {
  const before = readGeoJSON(BEFORE_FILE).features;
  const features = JSON.parse(JSON.stringify(before));
  const plan = reshapeProvinces(features, buildRegions(readKml()));
  return { before, features, plan };
}

// ---------------------------------------------------------------------------
// Direct writes and revert
// ---------------------------------------------------------------------------

async function models() {
  const { default: AreaDynamo } = await import('../../server/models/dynamo/area.dynamo.js');
  const { default: MetadataDynamo } = await import('../../server/models/dynamo/metadata.dynamo.js');
  return { AreaDynamo, MetadataDynamo };
}

export const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One pass over the years: corrects each year and saves it when anything
 * changed, after appending its previous and new values to backupFile.
 * Resolves to the number of years written.
 */
export async function writeAreaPass({ AreaDynamo, plan, backupFile, years, log = console.log }) {
  let written = 0;
  for (const year of years) {
    const doc = await AreaDynamo.findById(year).exec();
    if (!doc || !doc.data) continue;
    const { data, changes } = correctAreaYear(year, doc.data, plan);
    if (Object.keys(changes).length === 0) continue;
    const before = Object.fromEntries(Object.entries(changes).map(([p, c]) => [p, c.before]));
    const after = Object.fromEntries(Object.entries(changes).map(([p, c]) => [p, c.after]));
    fs.appendFileSync(backupFile, `${JSON.stringify({ year, before, after })}\n`);
    doc.data = data;
    if (typeof doc.markModified === 'function') doc.markModified('data');
    await doc.save();
    written++;
    if (written % 500 === 0) log(`  ${written} years written (at ${year})`);
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

/**
 * Writes the fix. `before` are the affected features the fix was computed
 * from; the live ones must be identical, or a newer edit would be lost.
 * Returns whether CloudFront accepted the invalidation.
 */
export async function applyDirect({
  features, before, plan, backupDir, distributionId, invalidate = invalidateAfterDirectWrites,
  log = console.log, loadModels = models, years = range(FIRST_YEAR, LAST_YEAR)
}) {
  const { AreaDynamo, MetadataDynamo } = await loadModels();
  const provinces = await MetadataDynamo.findById('provinces').exec();
  const provinceWiki = await MetadataDynamo.findById('province').exec();
  if (!provinces || !provinceWiki) throw new Error('provinces or province metadata missing');
  const live = new Map(provinces.data.features.map((f) => [f.properties?.name, f]));
  for (const n of NEW_NAMES) if (live.has(n)) throw new Error(`${n} is in the live provinces already: the fix was applied`);
  for (const f of before) {
    if (!same(live.get(f.properties.name), f)) {
      throw new Error(`Live province ${f.properties.name} differs from the fixture the fix was computed from`);
    }
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const written = features.filter((f) => [...AFFECTED, ...NEW_NAMES].includes(f.properties.name));
  const wikiWritten = Object.fromEntries(NEW_NAMES.map((n) => [n, NEW_PROVINCES[n].wiki]));
  fs.writeFileSync(path.join(backupDir, 'provinces.json'), JSON.stringify(provinces.data));
  fs.writeFileSync(path.join(backupDir, 'province.json'), JSON.stringify(provinceWiki.data));
  fs.writeFileSync(path.join(backupDir, 'written-provinces.json'), JSON.stringify(written));
  fs.writeFileSync(path.join(backupDir, 'written-province.json'), JSON.stringify(wikiWritten));
  log(`Backups in ${backupDir}`);

  log('1/2 new provinces, Acre and Judea in every year ...');
  const n = await writeAreaPass({ AreaDynamo, plan, backupFile: path.join(backupDir, 'areas.jsonl'), years, log });
  log(`    ${n} years written.`);

  log('2/2 provinces geometry and wiki links ...');
  const byName = new Map(written.map((f) => [f.properties.name, f]));
  await saveMetadata(MetadataDynamo, 'provinces', (doc) => {
    const kept = doc.data.features.map((f) => byName.get(f.properties?.name) || f);
    const added = written.filter((f) => !live.has(f.properties.name));
    doc.data = { ...doc.data, features: [...kept, ...added] };
  });
  await saveMetadata(MetadataDynamo, 'province', (doc) => { doc.data = { ...doc.data, ...wikiWritten }; });

  return invalidate(['areas', 'metadata'], { distributionId });
}

/**
 * Puts back what applyDirect changed. Refuses before writing anything when
 * a province shape or wiki link it wrote has changed since; area values that
 * changed since are left alone and reported. Resolves to
 * { invalidated, conflicts }.
 */
export async function revertDirect({
  backupDir, distributionId, invalidate = invalidateAfterDirectWrites, log = console.log,
  loadModels = models, legacy = false
}) {
  const { AreaDynamo, MetadataDynamo } = await loadModels();
  const read = (f) => JSON.parse(fs.readFileSync(path.join(backupDir, f), 'utf8'));
  const lines = fs.readFileSync(path.join(backupDir, 'areas.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => JSON.parse(l));
  if (!legacy && lines.some((l) => !l.after)) throw new Error('areas.jsonl has lines without `after` (a first-run backup): pass --legacy-backup');
  const original = read('provinces.json');
  const originalWiki = read('province.json');
  const written = read('written-provinces.json');
  const wikiWritten = read('written-province.json');

  const provinces = await MetadataDynamo.findById('provinces').exec();
  const provinceWiki = await MetadataDynamo.findById('province').exec();
  const live = new Map(provinces.data.features.map((f) => [f.properties?.name, f]));
  for (const f of written) {
    if (!same(live.get(f.properties.name), f)) throw new Error(`Province ${f.properties.name} changed since the fix: not reverting`);
  }
  for (const [k, v] of Object.entries(wikiWritten)) {
    if (provinceWiki.data[k] !== v) throw new Error(`Wiki link of ${k} changed since the fix: not reverting`);
  }

  const touched = new Set(written.map((f) => f.properties.name));
  const originalByName = new Map(original.features.map((f) => [f.properties?.name, f]));
  log(`Restoring ${touched.size} province shapes and ${Object.keys(wikiWritten).length} wiki links ...`);
  await saveMetadata(MetadataDynamo, 'provinces', (doc) => {
    const features = doc.data.features
      .map((f) => (touched.has(f.properties?.name) ? originalByName.get(f.properties.name) : f))
      .filter(Boolean);
    doc.data = { ...doc.data, features };
  });
  await saveMetadata(MetadataDynamo, 'province', (doc) => {
    const data = { ...doc.data };
    for (const k of Object.keys(wikiWritten)) {
      if (Object.prototype.hasOwnProperty.call(originalWiki, k)) data[k] = originalWiki[k];
      else delete data[k];
    }
    doc.data = data;
  });

  log(`Restoring ${lines.length} area year entries ...`);
  const conflicts = [];
  for (const { year, before, after } of [...lines].reverse()) {
    const doc = await AreaDynamo.findById(year).exec();
    if (!doc) continue;
    const data = { ...doc.data };
    let changed = false;
    for (const [prov, value] of Object.entries(before)) {
      if (after && !same(data[prov] ?? null, after[prov])) {
        conflicts.push({ year, prov });
        continue;
      }
      if (value === null) delete data[prov];
      else data[prov] = value;
      changed = true;
    }
    if (!changed) continue;
    doc.data = data;
    if (typeof doc.markModified === 'function') doc.markModified('data');
    await doc.save();
  }
  if (conflicts.length) log(`Left ${conflicts.length} values that changed since the fix: ${JSON.stringify(conflicts.slice(0, 20))}`);
  return { invalidated: await invalidate(['areas', 'metadata'], { distributionId }), conflicts };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function getJson(p) {
  const res = await fetch(`${API_URL}${p}`);
  if (!res.ok) throw new Error(`GET ${p} failed: ${res.status}`);
  return res.json();
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const direct = argv.includes('--direct');
  const revertDir = argValue(argv, '--revert');
  const outDir = argValue(argv, '--out');
  const distributionId = direct || revertDir ? distributionIdFrom(argv) : null;

  if (revertDir) {
    const { invalidated, conflicts } = await revertDirect({ backupDir: revertDir, distributionId, legacy: argv.includes('--legacy-backup') });
    if (!invalidated || conflicts.length) process.exitCode = 1;
    return;
  }

  const { before, features, plan } = computeFix();
  console.log('New provinces (source, share of its area):');
  for (const [n, p] of Object.entries(plan.newProvinces)) {
    const f = features.find((x) => x.properties.name === n);
    console.log(`  ${n.padEnd(20)} ${km2(f).toFixed(0).padStart(6)} km²  from ${p.source} (${(p.share * 100).toFixed(1)} %)`);
  }
  const total = plan.historyChanges.reduce((s, h) => s + h.km2, 0);
  console.log(`History before 1948 may change only in ${plan.historyChanges.length} pieces, ${total.toFixed(1)} km² in all:`);
  for (const h of plan.historyChanges) console.log(`  ${h.km2.toFixed(2).padStart(7)} km²  ${h.from} -> ${h.to} at ${h.at}`);
  for (const u of plan.unassigned) console.log(`Left in ${u.province}: ${u.km2} km² of ${u.zone} at ${u.at} (touches no province of that zone)`);

  const inv = geometryInvariants(before, features);
  console.log(`\nChanged provinces: overlap ${inv.overlapKm2.toFixed(3)} km², land lost ${inv.lostKm2.toFixed(3)} km², gaps closed ${inv.gainedKm2.toFixed(3)} km²`);
  for (const [n, p] of inv.problems) console.log(`  INVALID ${n}: ${p}`);

  const result = features.filter((f) => [...AFFECTED, ...NEW_NAMES].includes(f.properties.name));
  const committed = fs.existsSync(AFTER_FILE) ? readGeoJSON(AFTER_FILE).features : null;
  const matchesFixture = same(JSON.parse(JSON.stringify(result)), committed);
  console.log(`Result ${matchesFixture ? 'matches' : 'DIFFERS FROM'} ${path.relative(process.cwd(), AFTER_FILE)}`);
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'israel-1967-after.geojson'), JSON.stringify(featureCollection(result)));
    fs.writeFileSync(path.join(outDir, 'israel-1967-plan.json'), JSON.stringify(plan, null, 2));
    console.log(`Wrote the result to ${outDir}`);
  }

  console.log(`\nFetching ${CHECK_YEARS.length} area years from ${API_URL} ...`);
  const areasByYear = {};
  for (const year of CHECK_YEARS) {
    const data = await getJson(`/v1/areas/${year}`);
    if (NEW_NAMES.some((n) => n in data) && !direct) console.log(`  ${year} has the fix already: checking the live values`);
    areasByYear[year] = correctAreaYear(year, data, plan).data;
  }
  console.log('City checks (new geometry, corrected area data):');
  const failures = runChecks(features, areasByYear);
  console.log(`  ${failures === 0 ? 'all pass' : `${failures} failed`}`);

  console.log('\nHistory before 1948 (every 25th year, −2000…1925, points every ~2 km):');
  const points = gridPoints(before);
  let unexplained = 0;
  let years = 0;
  for (let year = FIRST_YEAR; year < MODERN_YEAR; year += 25) {
    const data = await getJson(`/v1/areas/${year}`);
    if (NEW_NAMES.some((n) => n in data)) {
      console.log('  skipped: the live data has the fix already');
      break;
    }
    years++;
    const diffs = historyDiff(before, features, data, plan, year, points);
    const bad = diffs.filter((d) => !inDeclaredChange(plan, d.pt));
    unexplained += bad.length;
    if (bad.length) console.log(`  ${year}: ${bad.length} points differ outside the declared pieces, e.g. ${JSON.stringify(bad[0])}`);
  }
  console.log(`  ${years} years x ${points.length} points: ${unexplained === 0 ? 'no difference outside the declared pieces' : `${unexplained} differences outside them`}`);

  const failed = failures > 0 || inv.overlapKm2 > 1 || inv.lostKm2 > 1 || inv.problems.length > 0 || unexplained > 0 || !matchesFixture;
  if (failed) {
    console.error('\nA check failed (cities, history, overlap, lost land, validity or fixture): NOT applying.');
    process.exit(1);
  }
  console.log('\nAll checks passed.');

  if (!direct) {
    console.log('\nDRY RUN: nothing written to the API. --direct writes through the models (AWS credentials).');
    return;
  }
  const backupDir = path.join(BACKUP_ROOT, `israel-1967-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (!(await applyDirect({ features, before, plan, backupDir, distributionId }))) process.exitCode = 1;
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
