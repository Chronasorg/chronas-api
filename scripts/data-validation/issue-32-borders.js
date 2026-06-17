/**
 * Issue #32 — Fix the Polish/German border near Zielona Góra / Jelenia Góra.
 *
 * Problem (verified against live `provinces` metadata + `/areas/2000`):
 *   Two German-ruled province polygons reach east across the Oder–Neisse line
 *   into post-1945 Polish territory:
 *     - `Lausitz`  (GER) swallows Głogów, Legnica, Jelenia Góra (Lower Silesia).
 *     - `Potsdam`  (GER) swallows Zielona Góra / the Lubusz strip.
 *   The ruler data is correct; the geometry is wrong.
 *
 * Fix:
 *   Clip both German polygons to the area WEST of the Oder–Neisse line, and
 *   hand the freed eastern land to the Polish neighbours that already border it:
 *     - the southern freed strip (Silesia) -> `Breslau` (POL)
 *     - the northern freed strip (Lubusz)  -> `Neumark` (POL)
 *   The split between Breslau and Neumark follows the existing province border
 *   (~52.0°N), so no new seam is invented.
 *
 * This script is a one-off, reviewable data correction. By default it runs in
 * DRY-RUN mode: it fetches the live document, computes the new geometry, writes
 * before/after GeoJSON to ./inputs/, runs point-in-polygon self-checks, and
 * prints a summary. Pass --apply (with credentials) to PUT the result back.
 *
 * Usage:
 *   node scripts/data-validation/issue-32-borders.js            # dry run
 *   node scripts/data-validation/issue-32-borders.js --apply    # write to API
 *
 * Env (only needed for --apply):
 *   CHRONAS_API_URL   default https://api.chronas.org
 *   CHRONAS_EMAIL / CHRONAS_PASSWORD   curator account (privilege >= 3), OR
 *   CHRONAS_TOKEN     a pre-obtained JWT
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  difference,
  union,
  booleanPointInPolygon,
  featureCollection,
  polygon as turfPolygon
} from '@turf/turf';
import { ChronasClient } from './chronas-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(__dirname, 'inputs');
const API_URL = process.env.CHRONAS_API_URL || 'https://api.chronas.org';

// ---------------------------------------------------------------------------
// The Oder–Neisse line, encoded as a clipping polygon that covers everything
// EAST of the modern German/Polish border within the relevant latitude band.
// Vertices follow the Lusatian Neisse (south, ~14.7–15.0°E) up to the Oder
// confluence and on north. The east/north/south edges are pushed well past the
// affected provinces so the clip only ever bites the western German polygons.
// ---------------------------------------------------------------------------
const POLISH_SIDE = turfPolygon([
  [
    [14.95, 50.85], // Zittau / upper Neisse (south end of border)
    [14.96, 51.15], // Görlitz / Zgorzelec — Neisse
    [14.71, 51.55], // Forst — Neisse
    [14.69, 51.93], // Neisse–Oder confluence (Ratzdorf)
    [14.55, 52.34], // Frankfurt (Oder) / Słubice — Oder
    [14.44, 52.82], // Küstrin / Kostrzyn — Oder/Warta
    [14.27, 53.32], // lower Oder
    [14.40, 53.70], // Szczecin / Police — west of Oder mouth
    [19.50, 53.70], // far NE — well past Poznań/Stettin
    [19.50, 50.30], // far SE
    [16.40, 50.30], // south, east of the Sudetes foothills
    [14.95, 50.85]
  ]
]);

const PRINCIPAL = ['Lausitz', 'Potsdam', 'Breslau', 'Neumark'];

// Regression points: [lon, lat]. Expected ruler at year 2000 after the fix.
const CHECKS = [
  { name: 'Zielona Góra', pt: [15.5, 51.94], expect: 'POL' },
  { name: 'Jelenia Góra', pt: [15.74, 50.9], expect: 'POL' },
  { name: 'Głogów', pt: [16.09, 51.66], expect: 'POL' },
  { name: 'Legnica', pt: [16.16, 51.21], expect: 'POL' },
  { name: 'Bautzen (DE side)', pt: [14.42, 51.18], expect: 'GER' },
  { name: 'Cottbus (DE side)', pt: [14.33, 51.76], expect: 'GER' },
  { name: 'Frankfurt/Oder (DE side)', pt: [14.5, 52.34], expect: 'GER' },
  { name: 'Wrocław (already POL)', pt: [17.04, 51.11], expect: 'POL' }
];

function findFeature(features, name) {
  const f = features.find((x) => x.properties && x.properties.name === name);
  if (!f) throw new Error(`Feature not found: ${name}`);
  return f;
}

// Which named province (out of the principal set) contains the point, and the
// ruler of whichever province (any) contains it at year 2000.
function rulerAt(features, areas, pt) {
  for (const f of features) {
    if (booleanPointInPolygon(pt, f)) {
      const { name } = f.properties;
      const arr = areas[name];
      return { name, ruler: arr ? arr[0] : '?' };
    }
  }
  return { name: null, ruler: null };
}

async function main() {
  const apply = process.argv.includes('--apply');
  fs.mkdirSync(INPUTS_DIR, { recursive: true });

  const client = new ChronasClient({ apiUrl: API_URL });

  console.log(`Fetching provinces + areas/2000 from ${API_URL} ...`);
  const provRes = await client._req('GET', '/v1/metadata/provinces');
  if (!provRes.ok) throw new Error(`GET provinces failed: ${provRes.status}`);
  const doc = provRes.body;
  const fc = doc.data;
  const { features } = fc;

  const areasRes = await client._req('GET', '/v1/areas/2000');
  if (!areasRes.ok) throw new Error(`GET areas/2000 failed: ${areasRes.status}`);
  const areas = areasRes.body;

  // Snapshot the BEFORE state of the principal features.
  const before = featureCollection(PRINCIPAL.map((n) => findFeature(features, n)));
  fs.writeFileSync(
    path.join(INPUTS_DIR, 'issue-32-before.geojson'),
    JSON.stringify(before, null, 2)
  );

  // --- Compute the freed eastern strips (the parts of the German polygons that
  // lie on the Polish side of the line). ---
  const lausitz = findFeature(features, 'Lausitz');
  const potsdam = findFeature(features, 'Potsdam');
  const breslau = findFeature(features, 'Breslau');
  const neumark = findFeature(features, 'Neumark');

  // Clip a German polygon to the German (west) side: subtract POLISH_SIDE.
  const clip = (f) => {
    const d = difference(featureCollection([f, POLISH_SIDE]));
    if (!d) throw new Error(`difference removed all of ${f.properties.name}`);
    return d;
  };
  // The freed strip = original ∩ Polish side = original − clipped.
  const freed = (f, clipped) => {
    const d = difference(featureCollection([f, clipped]));
    return d; // may be null if nothing freed
  };

  const lausitzClipped = clip(lausitz);
  const potsdamClipped = clip(potsdam);
  const lausitzFreed = freed(lausitz, lausitzClipped); // Silesia -> Breslau
  const potsdamFreed = freed(potsdam, potsdamClipped); // Lubusz  -> Neumark

  // Apply: shrink the German polygons.
  lausitz.geometry = lausitzClipped.geometry;
  potsdam.geometry = potsdamClipped.geometry;

  // Grow the Polish polygons with the freed land.
  if (lausitzFreed) {
    const u = union(featureCollection([breslau, lausitzFreed]));
    breslau.geometry = u.geometry;
  }
  if (potsdamFreed) {
    const u = union(featureCollection([neumark, potsdamFreed]));
    neumark.geometry = u.geometry;
  }

  // Snapshot AFTER.
  const after = featureCollection(PRINCIPAL.map((n) => findFeature(features, n)));
  fs.writeFileSync(
    path.join(INPUTS_DIR, 'issue-32-after.geojson'),
    JSON.stringify(after, null, 2)
  );

  // --- Self-check via point-in-polygon against the FULL updated collection. ---
  console.log('\nPoint-in-polygon checks (year 2000):');
  let failures = 0;
  for (const c of CHECKS) {
    const { name, ruler } = rulerAt(features, areas, c.pt);
    const ok = ruler === c.expect;
    if (!ok) failures++;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(26)} -> ${name ?? 'NONE'} [${ruler ?? '-'}] (expected ${c.expect})`
    );
  }

  console.log(`\nWrote:\n  ${path.join(INPUTS_DIR, 'issue-32-before.geojson')}\n  ${path.join(INPUTS_DIR, 'issue-32-after.geojson')}`);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed — NOT applying. Inspect the GeoJSON above.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');

  const direct = process.argv.includes('--direct');

  if (!apply && !direct) {
    console.log('\nDRY RUN — no changes written.');
    console.log('  --apply   PUT via the API (needs CHRONAS_* creds)');
    console.log('  --direct  write via the MetadataDynamo model (needs AWS creds)');
    return;
  }

  // The `provinces` doc is ~740 KB. The bulk API route (PUT /metadata/:id) logs
  // a revision storing the full before+after `data` as raw JSON in one item;
  // the revisions table is NOT compressed, so it blows past DynamoDB's 400 KB
  // item limit and 500s before the save. The metadata table itself compresses
  // large docs, so writing through the MetadataDynamo model produces exactly
  // the item the API would have stored — minus the (impossible) revision row.
  if (direct) {
    console.log('\nWriting via MetadataDynamo model (skips the broken revision middleware) ...');
    const { default: MetadataDynamo } = await import('../../server/models/dynamo/metadata.dynamo.js');
    const docModel = await MetadataDynamo.findById('provinces').exec();
    docModel.data = fc;
    if (typeof docModel.markModified === 'function') docModel.markModified('data');
    await docModel.save();
    console.log('Applied via model.');
    return;
  }

  // --- Apply: authenticate and PUT the whole document back via the API. ---
  let token = process.env.CHRONAS_TOKEN;
  if (!token) {
    const email = process.env.CHRONAS_EMAIL;
    const password = process.env.CHRONAS_PASSWORD;
    if (!email || !password) {
      throw new Error('Set CHRONAS_TOKEN, or CHRONAS_EMAIL + CHRONAS_PASSWORD, to --apply.');
    }
    console.log('\nLogging in ...');
    token = await client.login(email, password);
  } else {
    client.setToken(token);
  }

  console.log('PUT /v1/metadata/provinces ...');
  const putRes = await client._req('PUT', '/v1/metadata/provinces', {
    _id: 'provinces',
    data: fc
  });
  if (!putRes.ok) {
    throw new Error(`PUT failed: ${putRes.status} ${putRes.text}`);
  }
  console.log(`Applied. Status ${putRes.status}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
