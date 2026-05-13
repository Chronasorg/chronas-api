/**
 * Database / API shape contracts.
 *
 * These tests are about ONE thing: the bytes the applier ships to chronas-api
 * must match the real controller contracts AND the shape the new frontend
 * (chronas-frontend `main`) consumes. Mocks accept any shape; this file
 * encodes the contract explicitly so a regression breaks the build.
 *
 * Sources of truth referenced in assertions:
 *   - Metadata POST: server/controllers/metadata.controller.js create()/createNodeOne()
 *   - Marker POST:   server/controllers/marker.controller.js create() — uses
 *                    decodeURIComponent(req.body._id || req.body.wiki).
 *   - Area PUT:      server/controllers/area.controller.js updateMany().
 *   - Frontend metadata reader: chronas-frontend src/stores/mapStore.ts:1718
 *     expects rulerData[key] = [name, color, wikiArticle, flag?].
 *   - Frontend marker reader: chronas-frontend src/api/types.ts Marker._id mandatory.
 */

import { expect } from 'chai';

import { applyProposals } from '../../../../scripts/data-validation/apply-corrections-core.js';
import { buildReport } from '../../../../scripts/data-validation/validate-from-issue-core.js';

function chronasMock() {
  const calls = [];
  return {
    calls,
    fetchYear: async () => ({ ok: true, body: {} }),
    getMetadataParent: async () => ({ ok: true, body: { _id: 'ruler', data: {} } }),
    getMarker: async () => ({ ok: false, status: 404 }),
    createMetadata:       async (p) => { calls.push(['createMetadata', p]);       return { ok: true, status: 201, body: {} }; },
    updateMetadataSingle: async (dim, p) => { calls.push(['updateMetadataSingle', dim, p]); return { ok: true, status: 200, body: {} }; },
    createMarker:         async (p) => { calls.push(['createMarker', p]);         return { ok: true, status: 201, body: { _id: p._id || 'marker-1' } }; },
    updateAreas:          async (p) => { calls.push(['updateAreas', p]);          return { ok: true, status: 200, body: { ok: true } }; }
  };
}

const wikidataNoOp = { entityByQid: async () => null, queryAt: async () => [] };

function findCall(chronas, name) {
  const c = chronas.calls.find(call => call[0] === name);
  return c ? c[1] : null;
}

describe('database/API shape — what we send must be what chronas-api + chronas-frontend expect', () => {

  describe('metadata.add — must PUT /v1/metadata/:dim/single', () => {
    it('calls updateMetadataSingle(dim, {subEntityId, nextBody}) with the 4-tuple as nextBody', async () => {
      const chronas = chronasMock();
      await applyProposals(
        [{
          kind: 'metadata.add',
          dimension: 'ruler',
          key: 'POW',
          childValue: ['Powhatan Confederacy', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata: wikidataNoOp },
        { dryRun: false }
      );

      // Must NOT call the silent-no-op POST path.
      expect(chronas.calls.find(c => c[0] === 'createMetadata'),
        'createMetadata POST should not be used — it silently no-ops on flat dimension docs').to.be.undefined;

      const call = chronas.calls.find(c => c[0] === 'updateMetadataSingle');
      expect(call, 'should call updateMetadataSingle').to.exist;
      const [, dim, body] = call;
      expect(dim).to.equal('ruler');
      expect(body.subEntityId).to.equal('POW');
      expect(body.nextBody).to.deep.equal([
        'Powhatan Confederacy',
        'rgb(150,150,150)',
        'Powhatan_Confederacy',
        ''
      ]);
    });

    it('nextBody[1] is a valid rgb(...) string the controller _isInvalidRgb check accepts', async () => {
      const chronas = chronasMock();
      await applyProposals(
        [{
          kind: 'metadata.add',
          dimension: 'culture',
          key: 'clovis',
          childValue: ['Clovis culture', 'rgb(150,150,150)', 'Clovis_culture', ''],
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata: wikidataNoOp },
        { dryRun: false }
      );
      const call = chronas.calls.find(c => c[0] === 'updateMetadataSingle');
      const color = call[2].nextBody[1];
      // Same regex the controller uses (case-insensitive, optional alpha).
      const rxValidRgb = /([R][G][B][A]?[(]\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])(\s*,\s*((0\.[0-9]{1})|(1\.0)|(1)))?[)])/i;
      expect(rxValidRgb.test(color)).to.equal(true);
    });

    it('frontend reader contract: nextBody is an array of length >= 2 (Array.isArray + value[0]/value[1] used by mapStore.ts)', async () => {
      const chronas = chronasMock();
      await applyProposals(
        [{
          kind: 'metadata.add',
          dimension: 'culture',
          key: 'clovis',
          childValue: ['Clovis culture', 'rgb(150,150,150)', 'Clovis_culture', ''],
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata: wikidataNoOp },
        { dryRun: false }
      );
      const call = chronas.calls.find(c => c[0] === 'updateMetadataSingle');
      expect(Array.isArray(call[2].nextBody)).to.equal(true);
      expect(call[2].nextBody.length).to.be.at.least(2);
    });
  });

  describe('marker.add — _id is mandatory, only allowed fields are passed', () => {
    it('POSTs {_id, name, type, year, coo} and never wikidataQid or rulerCode', async () => {
      const chronas = chronasMock();
      // Wikidata returns the same entity at apply time as at report time, so
      // no drift; we focus this test on what the applier ships in the body.
      const aligned = { qid: 'Q323813', start: null, end: null, coordinates: null };
      const wikidata = { entityByQid: async () => aligned, queryAt: async () => [] };
      await applyProposals(
        [{
          kind: 'marker.add',
          body: {
            _id: 'Jamestown',
            name: 'Jamestown',
            type: 'op',
            year: 1607,
            coo: [-76.7783, 37.2087],
            // These should be stripped from what we ship — the server doesn't
            // read them and the frontend Marker type doesn't have them.
            wikidataQid: 'Q323813',
            rulerCode: 'POW'
          },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: { entity: aligned, dateAgrees: true, coordAgrees: true, labelAgrees: true }
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      const sent = findCall(chronas, 'createMarker');
      expect(sent).to.have.property('_id', 'Jamestown');
      expect(sent).to.have.property('name', 'Jamestown');
      expect(sent).to.have.property('type', 'op');
      expect(sent).to.have.property('year', 1607);
      expect(sent.coo).to.deep.equal([-76.7783, 37.2087]);

      // Server controller never touches these:
      expect(sent).to.not.have.property('wikidataQid');
      expect(sent).to.not.have.property('rulerCode');
    });

    it('preserves optional end / coo2 / html / partOf / capital when provided', async () => {
      const chronas = chronasMock();
      await applyProposals(
        [{
          kind: 'marker.add',
          body: {
            _id: 'Wahunsenacawh',
            name: 'Wahunsenacawh',
            type: 'p',
            year: 1547,
            end: 1618,
            coo: [-76.78, 37.52],
            html: '<p>Paramount chief</p>'
          },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata: wikidataNoOp },
        { dryRun: false }
      );
      const sent = findCall(chronas, 'createMarker');
      expect(sent.end).to.equal(1618);
      expect(sent.html).to.equal('<p>Paramount chief</p>');
    });

    it('refuses marker.add with no _id and no wiki (server would 500)', async () => {
      const chronas = chronasMock();
      const result = await applyProposals(
        [{
          kind: 'marker.add',
          body: { name: 'Anonymous', type: 'op', year: 1, coo: [0, 0] },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata: wikidataNoOp },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(0);
      expect(result.skipped[0].reason).to.equal('marker-missing-wiki');
    });
  });

  describe('area.update — ruler key must exist in the metadata POST that comes first', () => {
    it('emits area.update referencing a key the matching metadata.add will create (referential integrity)', async () => {
      const wikidata = {
        entityByQid: async () => ({ qid: 'Q49291', label: 'Powhatan', start: null, end: null, coordinates: null }),
        queryAt: async () => []
      };
      const chronas = {
        ...chronasMock(),
        findOccupiedSlots: async () => [],
        findOccupiedRulerSlots: async () => []
      };
      const report = await buildReport({
        issue: 999,
        title: 't',
        campaigns: [{
          type: 'polity',
          name: 'Powhatan Confederacy',
          wikidataQid: 'Q49291',
          yearStart: 1570, yearEnd: 1579,
          chronasProvinces: ['Powhatan'],
          proposedRulerCode: 'POW',
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas });

      const meta = report.auto.find(p => p.kind === 'metadata.add');
      const area = report.auto.find(p => p.kind === 'area.update');
      expect(meta).to.exist;
      expect(area).to.exist;
      // The ruler value the area will write must equal the childId the
      // metadata.add will register, otherwise the frontend renders "POW"
      // as a literal string with no name/color/wiki.
      expect(area.body.ruler).to.equal(meta.key);
    });
  });

  describe('manualEntity marker — must derive an _id when curator omits one', () => {
    it('derives wiki slug from name so the body has a usable _id', async () => {
      const wikidata = { entityByQid: async () => null, queryAt: async () => [] };
      const chronas = {
        ...chronasMock(),
        findOccupiedSlots: async () => [],
        findOccupiedRulerSlots: async () => []
      };
      const report = await buildReport({
        issue: 1, title: 't', campaigns: [],
        manualEntities: [{
          scope: 'marker',
          reason: 'curator override',
          citations: [{ source: 'A' }, { source: 'B' }],
          payload: { name: 'Werowocomoco', type: 'op', year: 1570, coo: [-76.78, 37.51] }
        }]
      }, { wikidata, chronas });

      const proposal = report.auto.find(p => p.kind === 'marker.add');
      expect(proposal, 'manual marker should be PROVEN').to.exist;
      expect(proposal.body._id).to.equal('Werowocomoco');
    });

    it('respects an explicit _id if the curator provides one', async () => {
      const wikidata = { entityByQid: async () => null, queryAt: async () => [] };
      const chronas = {
        ...chronasMock(),
        findOccupiedSlots: async () => [],
        findOccupiedRulerSlots: async () => []
      };
      const report = await buildReport({
        issue: 1, title: 't', campaigns: [],
        manualEntities: [{
          scope: 'marker',
          reason: 'curator override',
          citations: [{ source: 'A' }, { source: 'B' }],
          payload: { _id: 'Werowocomoco_archaeological_site', name: 'Werowocomoco', type: 'op', year: 1570, coo: [-76.78, 37.51] }
        }]
      }, { wikidata, chronas });

      const proposal = report.auto.find(p => p.kind === 'marker.add');
      expect(proposal.body._id).to.equal('Werowocomoco_archaeological_site');
    });
  });

  describe('write order — metadata.add must precede area.update with the same key', () => {
    it('the dependency sort guarantees the parent doc is updated before the area refers to it', async () => {
      const chronas = chronasMock();
      const wikidata = wikidataNoOp;
      const proposals = [
        {
          kind: 'area.update',
          body: { start: 1570, end: 1579, provinces: ['Powhatan'], ruler: 'POW' },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        },
        {
          kind: 'metadata.add',
          dimension: 'ruler',
          key: 'POW',
          childValue: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', ''],
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }
      ];
      await applyProposals(proposals, { chronas, wikidata }, { dryRun: false });

      const order = chronas.calls.map(c => c[0]);
      const metaIdx = order.indexOf('updateMetadataSingle');
      const areaIdx = order.indexOf('updateAreas');
      expect(metaIdx).to.be.greaterThan(-1);
      expect(areaIdx).to.be.greaterThan(-1);
      expect(metaIdx).to.be.below(areaIdx);
    });
  });
});
