import { expect } from 'chai';

import {
  applyProposals,
  sortProposals
} from '../../../../scripts/data-validation/apply-corrections-core.js';

function makeProposal(kind, body, extra = {}) {
  return {
    kind,
    body,
    citations: [{ source: 'A' }, { source: 'B' }],
    wikidataMatch: {
      dateAgrees: true,
      coordAgrees: true,
      entity: { qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)' }
    },
    sourceCampaign: 'test',
    ...extra
  };
}

function makeChronasMock(overrides = {}) {
  const calls = [];
  return {
    calls,
    fetchYear: overrides.fetchYear || (async () => ({ ok: true, body: {} })),
    getMetadataParent: overrides.getMetadataParent || (async () => ({ ok: true, body: { _id: 'ruler', data: {} } })),
    getMarker: overrides.getMarker || (async () => ({ ok: false, status: 404 })),
    createMetadata: overrides.createMetadata || (async (p) => {
      calls.push(['createMetadata', p]);
      return { ok: true, status: 201, body: { _id: p._id } };
    }),
    updateMetadataSingle: overrides.updateMetadataSingle || (async (dim, p) => {
      calls.push(['updateMetadataSingle', dim, p]);
      return { ok: true, status: 200, body: {} };
    }),
    createMarker: overrides.createMarker || (async (p) => {
      calls.push(['createMarker', p]);
      return { ok: true, status: 201, body: { _id: p._id || 'marker-1' } };
    }),
    updateAreas: overrides.updateAreas || (async (p) => {
      calls.push(['updateAreas', p]);
      return { ok: true, status: 200, body: { ok: true } };
    })
  };
}

function makeWikidataMock(entity, queryAtImpl) {
  return {
    entityByQid: async () => entity,
    queryAt: queryAtImpl || (async () => [])
  };
}

describe('apply-corrections-core', () => {
  describe('sortProposals', () => {
    it('orders metadata.add → marker.add → area.update', () => {
      const sorted = sortProposals([
        { kind: 'area.update' },
        { kind: 'marker.add' },
        { kind: 'metadata.add' }
      ]);
      expect(sorted.map(p => p.kind)).to.deep.equal(['metadata.add', 'marker.add', 'area.update']);
    });
  });

  describe('applyProposals', () => {
    it('writes nothing in dry-run mode but records what would be applied', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' })],
        { chronas, wikidata },
        { dryRun: true }
      );
      expect(result.applied.length).to.equal(1);
      expect(result.applied[0].dryRun).to.equal(true);
      expect(chronas.calls.filter(c => c[0] === 'updateAreas').length).to.equal(0);
    });

    it('writes in apply mode and records the proposal that was applied', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(1);
      expect(chronas.calls.filter(c => c[0] === 'updateAreas').length).to.equal(1);
    });

    it('skips a proposal that is unproven without --allow-unproven', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock(null);
      const unproven = {
        kind: 'area.update',
        body: { start: 1, end: 9, provinces: ['P'], ruler: 'POW' },
        citations: [{ source: 'OnlySource' }],
        wikidataMatch: null
      };
      const result = await applyProposals([unproven], { chronas, wikidata }, { dryRun: false });
      expect(result.applied.length).to.equal(0);
      expect(result.skipped[0].reason).to.equal('unproven');
    });

    it('skips when Wikidata drift is detected at apply time (re-check disagrees)', async () => {
      const chronas = makeChronasMock();
      // Stored entity says start=1570 but live Wikidata now says start=1500 (>5y drift).
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1500, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW', wikidataQid: 'Q1' })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(0);
      expect(result.skipped[0].reason).to.equal('wikidata-drift');
    });

    it('does NOT flag drift when Wikidata still has no dates (null in report, null now)', async () => {
      // Real-world case: Powhatan Confederacy has no inception/end claims on Wikidata,
      // but the report is PROVEN via citations. Re-check must not reject this.
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({
        qid: 'Q49291', start: null, end: null, coordinates: null
      });
      const proposal = {
        kind: 'area.update',
        body: { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW', wikidataQid: 'Q49291' },
        citations: [{ source: 'Encyclopedia Virginia' }, { source: 'NPS' }],
        wikidataMatch: {
          dateAgrees: false, coordAgrees: true,
          entity: { qid: 'Q49291', start: null, end: null, coordinates: null }
        },
        sourceCampaign: 'Powhatan'
      };
      const result = await applyProposals([proposal], { chronas, wikidata }, { dryRun: false });
      expect(result.applied.length).to.equal(1);
      expect(result.skipped.length).to.equal(0);
    });

    it('proceeds when Wikidata re-check confirms the report', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW', wikidataQid: 'Q1' })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(1);
      expect(result.skipped.length).to.equal(0);
    });

    it('refuses to overwrite an already-occupied area slot', async () => {
      const chronas = makeChronasMock({
        fetchYear: async () => ({ ok: true, body: { P: ['ENG', 'english', 'protestant'] } })
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.skipped[0].reason).to.equal('slot-occupied');
    });

    it('refuses area.update for province keys that do not exist in the area doc (silent-drop guard)', async () => {
      // Real prod regression: the issue-136 campaign listed Chesapeake and
      // Tidewater, neither of which is a chronas province. The updateMany
      // controller silently skipped them and returned 200, hiding the loss.
      // The applier must refuse the proposal up front instead.
      const chronas = makeChronasMock({
        fetchYear: async () => ({ ok: true, body: { Powhatan: ['', '', ''], Roanoke: ['', '', ''] } })
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', {
          start: 1570, end: 1579,
          provinces: ['Powhatan', 'Roanoke', 'Chesapeake', 'Tidewater'],
          ruler: 'POW'
        })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(0);
      expect(result.skipped[0].reason).to.equal('unknown-province');
      expect(result.skipped[0].details.unknown).to.deep.equal(['Chesapeake', 'Tidewater']);
      // Confirm we did not call updateAreas.
      expect(chronas.calls.find(c => c[0] === 'updateAreas')).to.be.undefined;
    });

    it('honours proposal.overwrite — writes when occupied slot value is on the allowlist', async () => {
      // Curator authorises replacing _Kingdom_of_England specifically.
      // Existing slot has ENG → write proceeds.
      const chronas = makeChronasMock({
        fetchYear: async () => ({ ok: true, body: { Roanoke: ['_Kingdom_of_England', 'english', 'protestant'] } })
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: null, end: null, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [{
          ...makeProposal('area.update', { start: 1650, end: 1651, provinces: ['Roanoke'], ruler: 'POW' }),
          overwrite: { ruler: ['_Kingdom_of_England'] }
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length, JSON.stringify(result.skipped)).to.equal(1);
      expect(chronas.calls.find(c => c[0] === 'updateAreas')).to.exist;
    });

    it('refuses overwrite when occupied slot value is NOT on the allowlist', async () => {
      // ENG authorised, but the actual occupant is FRA → still skip.
      const chronas = makeChronasMock({
        fetchYear: async () => ({ ok: true, body: { Roanoke: ['FRA', 'french', 'catholic'] } })
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: null, end: null, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [{
          ...makeProposal('area.update', { start: 1650, end: 1651, provinces: ['Roanoke'], ruler: 'POW' }),
          overwrite: { ruler: ['_Kingdom_of_England'] }
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied).to.have.lengthOf(0);
      expect(result.skipped[0].reason).to.equal('slot-occupied');
    });

    it('passes pre-flight when every requested province exists', async () => {
      const chronas = makeChronasMock({
        fetchYear: async () => ({ ok: true, body: { Powhatan: ['', '', ''], Roanoke: ['', '', ''] } })
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', {
          start: 1570, end: 1579,
          provinces: ['Powhatan', 'Roanoke'],
          ruler: 'POW'
        })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(1);
      expect(result.skipped.length).to.equal(0);
    });

    it('apply-time slot pre-flight catches mid-window occupation (not just start year)', async () => {
      // Reproduces the asymmetry: builder samples start/mid/end via
      // findOccupiedSlots; the applier must too. With a 10-year batch, an
      // occupation at the mid-year must trigger slot-occupied even when the
      // start year is empty.
      let callCount = 0;
      const chronas = makeChronasMock({
        fetchYear: async (year) => {
          callCount++;
          // 1570 (start): empty. 1574 (mid): occupied. 1579 (end): empty.
          if (year === 1574) return { ok: true, body: { P: ['ENG', 'english', 'protestant'] } };
          return { ok: true, body: { P: ['', '', ''] } };
        }
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.skipped[0].reason).to.equal('slot-occupied');
      expect(result.skipped[0].details[0].year).to.equal(1574);
      // Confirm we sampled more than just the start year.
      expect(callCount).to.be.greaterThan(1);
    });

    it('refuses to add metadata when childId already exists in parent doc', async () => {
      const chronas = makeChronasMock({
        getMetadataParent: async () => ({ ok: true, body: { _id: 'ruler', data: { POW: ['Existing', 'rgb(0,0,0)', 'X', ''] } } })
      });
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const result = await applyProposals(
        [{
          kind: 'metadata.add',
          dimension: 'ruler',
          key: 'POW',
          childValue: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', ''],
          value: { name: 'X', wikidataQid: 'Q1' },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: { dateAgrees: true, coordAgrees: true, entity: { qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)' } }
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.skipped[0].reason).to.equal('metadata-key-exists');
    });

    it('refuses to add metadata on case-insensitive collision', async () => {
      const chronas = makeChronasMock({
        getMetadataParent: async () => ({ ok: true, body: { _id: 'ruler', data: { pow: ['Existing', '', '', ''] } } })
      });
      const wikidata = makeWikidataMock({ qid: 'Q1', start: null, end: null });
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
      expect(result.skipped[0].details).to.deep.include({ existing: 'pow', proposed: 'POW' });
    });

    it('writes metadata.add via PUT /v1/metadata/:dim/single (real API shape)', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({ qid: 'Q1', start: null, end: null });
      await applyProposals(
        [{
          kind: 'metadata.add',
          dimension: 'ruler',
          key: 'POW',
          childValue: ['Powhatan', 'rgb(150,150,150)', 'Powhatan_Confederacy', ''],
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      const call = chronas.calls.find(c => c[0] === 'updateMetadataSingle');
      expect(call, 'must use updateMetadataSingle').to.exist;
      expect(call[1]).to.equal('ruler');
      expect(call[2]).to.deep.equal({
        subEntityId: 'POW',
        nextBody: ['Powhatan', 'rgb(150,150,150)', 'Powhatan_Confederacy', '']
      });
      // Must not also call the silent-no-op POST.
      expect(chronas.calls.find(c => c[0] === 'createMetadata')).to.be.undefined;
    });

    it('writes marker.add with _id (wiki slug) and drops wikidataQid from the body', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({ qid: 'Q1', start: null, end: null });
      await applyProposals(
        [{
          kind: 'marker.add',
          body: {
            _id: 'Jamestown',
            name: 'Jamestown',
            type: 'op',
            year: 1607,
            coo: [-76.7783, 37.2087],
            wikidataQid: 'Q323813'
          },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      const sent = chronas.calls.find(c => c[0] === 'createMarker')[1];
      expect(sent).to.have.property('_id', 'Jamestown');
      expect(sent).to.have.property('name', 'Jamestown');
      expect(sent).to.have.property('coo').deep.equal([-76.7783, 37.2087]);
      expect(sent).to.not.have.property('wikidataQid');
      expect(sent).to.not.have.property('rulerCode');
    });

    it('refuses marker.add when a marker with that wiki already exists', async () => {
      const chronas = makeChronasMock({
        getMarker: async () => ({ ok: true, status: 200, body: { _id: 'Jamestown' } })
      });
      const wikidata = makeWikidataMock({ qid: 'Q1', start: null, end: null });
      const result = await applyProposals(
        [{
          kind: 'marker.add',
          body: { _id: 'Jamestown', name: 'Jamestown', type: 'op', year: 1607, coo: [0, 0] },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: null
        }],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.skipped[0].reason).to.equal('marker-already-exists');
    });

    it('skips area.update when Wikidata returns OTHER QIDs at (lat,lon,year) and never the proposal\'s', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock(
        { qid: 'Q49291', start: null, end: null },
        async () => [{ qid: 'http://www.wikidata.org/entity/Q1234' }]   // some other polity
      );
      const proposal = {
        kind: 'area.update',
        body: { start: 1570, end: 1579, provinces: ['Powhatan'], ruler: 'POW', wikidataQid: 'Q49291' },
        yearRegionSamples: [{ lat: 37.5, lon: -76.7, year: 1574, radiusKm: 200 }],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      };
      const result = await applyProposals([proposal], { chronas, wikidata }, { dryRun: false });
      expect(result.applied.length).to.equal(0);
      expect(result.skipped[0].reason).to.equal('year-region-mismatch');
    });

    it('proceeds when Wikidata confirms the QID is at (lat,lon,year)', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock(
        { qid: 'Q49291', start: null, end: null },
        async () => [{ qid: 'http://www.wikidata.org/entity/Q49291' }]
      );
      const proposal = {
        kind: 'area.update',
        body: { start: 1570, end: 1579, provinces: ['Powhatan'], ruler: 'POW', wikidataQid: 'Q49291' },
        yearRegionSamples: [{ lat: 37.5, lon: -76.7, year: 1574, radiusKm: 200 }],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      };
      const result = await applyProposals([proposal], { chronas, wikidata }, { dryRun: false });
      expect(result.applied.length).to.equal(1);
    });

    it('proceeds when Wikidata returns NOTHING at (lat,lon,year) (sparse-Wikidata case)', async () => {
      // Wikidata is thin for pre-modern non-Western entities. Empty answer is
      // "no info", not "contradicted". Without this, every Powhatan-class
      // proposal is rejected by the year/region gate.
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock(
        { qid: 'Q49291', label: 'Powhatan', start: null, end: null },
        async () => []   // Wikidata says nothing
      );
      const proposal = {
        kind: 'area.update',
        body: { start: 1570, end: 1579, provinces: ['Powhatan'], ruler: 'POW', wikidataQid: 'Q49291' },
        yearRegionSamples: [{ lat: 37.5, lon: -76.7, year: 1574, radiusKm: 200 }],
        citations: [{ source: 'A' }, { source: 'B' }],
        wikidataMatch: null
      };
      const result = await applyProposals([proposal], { chronas, wikidata }, { dryRun: false });
      expect(result.applied.length).to.equal(1);
    });

    it('does not invoke year/region check when proposal has no samples', async () => {
      const chronas = makeChronasMock();
      let queryAtCalled = false;
      const wikidata = makeWikidataMock(
        { qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)' },
        async () => { queryAtCalled = true; return []; }
      );
      const result = await applyProposals(
        [makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' })],
        { chronas, wikidata },
        { dryRun: false }
      );
      expect(result.applied.length).to.equal(1);
      expect(queryAtCalled).to.equal(false);
    });

    it('writes proposals in metadata→marker→area order', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const proposals = [
        makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' }),
        makeProposal('marker.add', { _id: 'Werowocomoco', name: 'Werowocomoco', type: 'op', year: 1570, coo: [-76.7, 37.5], wikidataQid: 'Q1' }),
        {
          kind: 'metadata.add',
          dimension: 'ruler',
          key: 'POW',
          childValue: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', ''],
          value: { name: 'Powhatan', wikidataQid: 'Q1' },
          citations: [{ source: 'A' }, { source: 'B' }],
          wikidataMatch: { dateAgrees: true, coordAgrees: true, entity: { qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)' } }
        }
      ];
      await applyProposals(proposals, { chronas, wikidata }, { dryRun: false });
      const order = chronas.calls.map(c => c[0]).filter(c => c !== 'fetchYear');
      expect(order).to.deep.equal(['updateMetadataSingle', 'createMarker', 'updateAreas']);
    });

    it('honours --scope filter', async () => {
      const chronas = makeChronasMock();
      const wikidata = makeWikidataMock({
        qid: 'Q1', start: 1570, end: 1646, coordinates: 'Point(-76.7 37.5)'
      });
      const proposals = [
        makeProposal('area.update', { start: 1570, end: 1579, provinces: ['P'], ruler: 'POW' }),
        makeProposal('marker.add', { _id: 'X', name: 'X', type: 'op', year: 1570, coo: [0, 0], wikidataQid: 'Q1' })
      ];
      const result = await applyProposals(proposals, { chronas, wikidata }, {
        dryRun: false, scope: new Set(['marker.add'])
      });
      expect(result.applied.length).to.equal(1);
      expect(result.applied[0].proposal.kind).to.equal('marker.add');
    });
  });
});
