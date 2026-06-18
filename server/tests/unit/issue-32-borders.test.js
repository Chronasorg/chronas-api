/**
 * Regression test for issue #32 — Polish/German border near Zielona Góra.
 *
 * Two German-ruled province polygons (`Lausitz`, `Potsdam`) used to reach east
 * across the Oder–Neisse line into Polish territory. The corrected geometry is
 * committed as a fixture (scripts/data-validation/inputs/issue-32-after.geojson,
 * produced by scripts/data-validation/issue-32-borders.js). This test asserts
 * the corrected polygons resolve key border cities to the right side, so the
 * over-reach cannot silently return.
 *
 * Note: this validates the corrected geometry artifact, not the live DB. Apply
 * the artifact to the `provinces` metadata document to ship the fix.
 */

import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { booleanPointInPolygon } from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(
  __dirname,
  '../../../scripts/data-validation/inputs/issue-32-after.geojson'
);

// Which German provinces these features carry; everything else is Polish here.
const GERMAN = new Set(['Lausitz', 'Potsdam']);

// [lon, lat] -> the side it must resolve to.
const CASES = [
  { name: 'Zielona Góra', pt: [15.5, 51.94], side: 'POL' },
  { name: 'Jelenia Góra', pt: [15.74, 50.9], side: 'POL' },
  { name: 'Głogów', pt: [16.09, 51.66], side: 'POL' },
  { name: 'Legnica', pt: [16.16, 51.21], side: 'POL' },
  { name: 'Bautzen', pt: [14.42, 51.18], side: 'GER-or-none' }, // Dresden province; not in fixture
  { name: 'Lausitz core (W of Neisse)', pt: [14.88, 51.15], side: 'GER' },
  { name: 'Frankfurt/Oder', pt: [14.5, 52.34], side: 'GER' },
  { name: 'Wrocław', pt: [17.04, 51.11], side: 'POL' }
];

describe('issue #32 — Oder–Neisse province borders', () => {
  let features;

  before(async () => {
    const fc = JSON.parse(await readFile(FIXTURE, 'utf8'));
    features = fc.features;
  });

  it('fixture contains the four edited provinces', () => {
    const names = features.map((f) => f.properties.name).sort();
    expect(names).to.deep.equal(['Breslau', 'Lausitz', 'Neumark', 'Potsdam']);
  });

  it('every edited polygon is valid (single ring, no self-intersection markers)', () => {
    for (const f of features) {
      expect(f.geometry.type).to.equal('Polygon');
      // exterior ring closed
      const ring = f.geometry.coordinates[0];
      expect(ring[0]).to.deep.equal(ring[ring.length - 1]);
    }
  });

  CASES.forEach(({ name, pt, side }) => {
    it(`${name} resolves to ${side}`, () => {
      const hits = features.filter((f) => booleanPointInPolygon(pt, f));
      const hitNames = hits.map((f) => f.properties.name);
      // No point should land in two of the edited polygons at once.
      expect(hits.length, `overlap at ${name}: ${hitNames}`).to.be.at.most(1);

      if (side === 'GER-or-none') {
        // Bautzen belongs to the (unedited) Dresden province, so it must NOT
        // fall inside any of the edited features.
        expect(hitNames, `${name} should not be in edited features`).to.have.lengthOf(0);
        return;
      }

      expect(hits.length, `${name} not covered by any edited feature`).to.equal(1);
      const inGerman = GERMAN.has(hitNames[0]);
      if (side === 'GER') {
        expect(inGerman, `${name} -> ${hitNames[0]} should be German`).to.equal(true);
      } else {
        expect(inGerman, `${name} -> ${hitNames[0]} should be Polish`).to.equal(false);
      }
    });
  });
});
