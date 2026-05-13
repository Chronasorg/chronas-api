import { expect } from 'chai';

import {
  buildReport,
  isProven,
  haversineKm,
  parseWikidataCoord,
  labelMatches,
  tokenize,
  COORD_TOLERANCE_KM
} from '../../../../scripts/data-validation/validate-from-issue-core.js';

function mockWikidata(entityByQidImpl, enwikiSitelinkImpl) {
  return {
    entityByQid: entityByQidImpl,
    queryAt: async () => [],
    enwikiSitelink: enwikiSitelinkImpl || (async () => null)
  };
}

function mockChronasEmpty() {
  return {
    findOccupiedSlots: async () => [],
    findOccupiedRulerSlots: async () => [],
    fetchYear: async () => ({ ok: true, body: {} })
  };
}

describe('validate-from-issue-core', () => {
  describe('parseWikidataCoord', () => {
    it('parses Point(lon lat) literal', () => {
      expect(parseWikidataCoord('Point(-76.7 37.5)')).to.deep.equal({ lon: -76.7, lat: 37.5 });
    });
    it('returns null for invalid coord string', () => {
      expect(parseWikidataCoord('garbage')).to.equal(null);
    });
  });

  describe('haversineKm', () => {
    it('computes ~0 for the same point', () => {
      expect(haversineKm({ lat: 37, lon: -76 }, { lat: 37, lon: -76 })).to.be.below(0.001);
    });
    it('computes >100km for points far apart', () => {
      expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).to.be.greaterThan(1000);
    });
  });

  describe('tokenize / labelMatches', () => {
    it('strips diacritics and short tokens', () => {
      expect(tokenize('Bořivoj II, Duke of Bohemia')).to.include.members(['borivoj', 'duke', 'bohemia']);
    });

    it('matches when campaign and label share a name token', () => {
      expect(labelMatches('Powhatan Confederacy', 'Powhatan')).to.equal(true);
    });

    it('does not match when QID returns a different entity', () => {
      // Real prod bug: Q1262048 returned "Jekermish, Atabeg of Mosul"
      expect(labelMatches('Powhatan Confederacy', 'Jekermish')).to.equal(false);
    });

    it('does not match Jamestown vs Kurmanay (the real Q485238 bug)', () => {
      expect(labelMatches('Jamestown', 'Kurmanay')).to.equal(false);
    });

    it('returns false when both sides reduce to stopwords only', () => {
      expect(labelMatches('Confederacy', 'Confederacy')).to.equal(false);
    });
  });

  describe('isProven predicate', () => {
    it('is true for a proposal with Wikidata match (date+coord agree)', () => {
      expect(isProven({
        wikidataMatch: { dateAgrees: true, coordAgrees: true },
        citations: []
      })).to.equal(true);
    });

    it('is false when Wikidata QID label disagrees with campaign name (wrong QID)', () => {
      // Disqualifying regardless of citations — wrong QID = wrong record.
      expect(isProven({
        wikidataMatch: { labelAgrees: false, dateAgrees: true, coordAgrees: true },
        citations: [{ source: 'A' }, { source: 'B' }]
      })).to.equal(false);
    });

    it('is true for a proposal with two independent citations', () => {
      expect(isProven({
        wikidataMatch: { dateAgrees: false, coordAgrees: false },
        citations: [{ source: 'A' }, { source: 'B' }]
      })).to.equal(true);
    });

    it('is false when one citation only', () => {
      expect(isProven({ wikidataMatch: null, citations: [{ source: 'A' }] })).to.equal(false);
    });

    it('is false for two citations from the same source', () => {
      expect(isProven({
        wikidataMatch: null,
        citations: [{ source: 'A' }, { source: 'A' }]
      })).to.equal(false);
    });
  });

  describe('buildReport — polity campaign', () => {
    const campaignFile = {
      issue: 999,
      title: 'Polity test',
      campaigns: [{
        type: 'polity',
        name: 'Powhatan Confederacy',
        wikidataQid: 'Q1262048',
        yearStart: 1570,
        yearEnd: 1646,
        chronasProvinces: ['Powhatan', 'Roanoke'],
        proposedRulerCode: 'POW',
        capital: { name: 'Werowocomoco', lat: 37.5, lon: -76.7 },
        citations: []
      }],
      manualEntities: []
    };

    it('emits one metadata.add and multiple area.update proposals', async () => {
      const wikidata = mockWikidata(async () => ({
        qid: 'Q1262048',
        start: 1570, end: 1646,
        coordinates: 'Point(-76.7 37.5)'
      }));
      const report = await buildReport(campaignFile, { wikidata, chronas: mockChronasEmpty() });

      const meta = [...report.auto, ...report.manualReview].filter(p => p.kind === 'metadata.add');
      const areas = [...report.auto, ...report.manualReview].filter(p => p.kind === 'area.update');
      expect(meta.length).to.equal(1);
      expect(meta[0].dimension).to.equal('ruler');
      expect(meta[0].key).to.equal('POW');
      expect(areas.length).to.be.greaterThan(0);
      areas.forEach(a => {
        expect(a.body.ruler).to.equal('POW');
        expect(a.body.provinces).to.deep.equal(['Powhatan', 'Roanoke']);
      });
    });

    it('routes proposals to auto when Wikidata aligns', async () => {
      const wikidata = mockWikidata(async () => ({
        qid: 'Q1262048',
        start: 1570, end: 1646,
        coordinates: 'Point(-76.7 37.5)'
      }));
      const report = await buildReport(campaignFile, { wikidata, chronas: mockChronasEmpty() });
      expect(report.summary.auto).to.be.greaterThan(0);
    });

    it('routes proposals to manualReview when dates drift outside tolerance', async () => {
      const wikidata = mockWikidata(async () => ({
        qid: 'Q1262048',
        start: 1500, end: 1700,
        coordinates: 'Point(-76.7 37.5)'
      }));
      const report = await buildReport(campaignFile, { wikidata, chronas: mockChronasEmpty() });
      expect(report.summary.auto).to.equal(0);
      expect(report.summary.manualReview).to.be.greaterThan(0);
    });

    it('routes proposals to manualReview when coordinates drift', async () => {
      const wikidata = mockWikidata(async () => ({
        qid: 'Q1262048',
        start: 1570, end: 1646,
        // Way off — Tokyo
        coordinates: 'Point(139.7 35.6)'
      }));
      const report = await buildReport(campaignFile, { wikidata, chronas: mockChronasEmpty() });
      expect(report.summary.auto).to.equal(0);
    });

    it('skips area.update for years where the slot is occupied', async () => {
      const wikidata = mockWikidata(async () => ({
        qid: 'Q1262048',
        start: 1570, end: 1646,
        coordinates: 'Point(-76.7 37.5)'
      }));
      const chronas = {
        findOccupiedSlots: async () => [{ province: 'Powhatan', year: 1570, ruler: 'ENG' }],
        findOccupiedRulerSlots: async () => [{ province: 'Powhatan', year: 1570, ruler: 'ENG' }],
        fetchYear: async () => ({ ok: true, body: {} })
      };
      const report = await buildReport(campaignFile, { wikidata, chronas });
      const skips = [...report.auto, ...report.manualReview].filter(p => p.kind === 'area.skip');
      expect(skips.length).to.be.greaterThan(0);
    });
  });

  describe('buildReport — QID-label sanity check', () => {
    it('routes to manualReview when QID returns an unrelated entity', async () => {
      // Wikidata returns "Jekermish" for the wrong QID we tried.
      const wikidata = mockWikidata(async () => ({
        qid: 'Q1262048',
        label: 'Jekermish',
        start: null, end: null, coordinates: null
      }));
      const report = await buildReport({
        issue: 136,
        title: 'wrong qid test',
        campaigns: [{
          type: 'polity',
          name: 'Powhatan Confederacy',
          wikidataQid: 'Q1262048',
          yearStart: 1570,
          yearEnd: 1646,
          chronasProvinces: ['Powhatan'],
          proposedRulerCode: 'POW',
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });

      expect(report.summary.auto).to.equal(0);
      expect(report.summary.manualReview).to.be.greaterThan(0);
      expect(report.manualReview[0].wikidataMatch.labelAgrees).to.equal(false);
    });

    it('forwards campaign name through marker builder so labels match (regression)', async () => {
      // Bug: marker campaigns lost campaign.name on the way into checkWikidataAlignment,
      // so labelMatches('', label) was always false even when the QID was correct.
      const wikidata = mockWikidata(async () => ({
        qid: 'Q323813',
        label: 'Jamestown',
        start: null, end: null, coordinates: 'Point(-76.78 37.21)'
      }));
      const report = await buildReport({
        issue: 136,
        title: 'marker label test',
        campaigns: [{
          type: 'marker',
          name: 'Jamestown',
          wikidataQid: 'Q323813',
          markerType: 'op',
          year: 1607,
          coo: [-76.7783, 37.2087],
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });

      expect(report.summary.auto).to.equal(1);
      expect(report.auto[0].kind).to.equal('marker.add');
    });

    it('keeps proposals when label matches even with no Wikidata dates', async () => {
      // Real prod case for Q49291 — Wikidata has no dates but label aligns.
      const wikidata = mockWikidata(async () => ({
        qid: 'Q49291',
        label: 'Powhatan',
        start: null, end: null, coordinates: null
      }));
      const report = await buildReport({
        issue: 136,
        title: 'real qid test',
        campaigns: [{
          type: 'polity',
          name: 'Powhatan Confederacy',
          wikidataQid: 'Q49291',
          yearStart: 1570,
          yearEnd: 1646,
          chronasProvinces: ['Powhatan'],
          proposedRulerCode: 'POW',
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });
      expect(report.summary.auto).to.be.greaterThan(0);
    });
  });

  describe('buildReport — wikiSlug resolution from Wikidata enwiki sitelink', () => {
    it('uses the Wikidata enwiki sitelink for marker._id when no wikiSlug is supplied', async () => {
      // Real-world bug this test pins: derive-from-name produced
      // "Wahunsenacawh_Chief_Powhatan" → 404 on Wikipedia. Fix: when the
      // campaign provides a QID, look up the actual enwiki sitelink.
      const wikidata = mockWikidata(
        async () => ({ qid: 'Q578878', label: 'Chief Powhatan', start: null, end: null }),
        async () => 'Powhatan_(Native_American_leader)'
      );
      const report = await buildReport({
        issue: 1, title: 't',
        campaigns: [{
          type: 'marker',
          // "Powhatan" shares a token with the Wikidata label so labelMatches
          // passes; without it we'd land in manualReview for unrelated reasons.
          name: 'Powhatan paramount chief',
          wikidataQid: 'Q578878',
          markerType: 'p',
          year: 1547,
          end: 1618,
          coo: [-76.78, 37.52],
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });

      const proposal = report.auto.find(p => p.kind === 'marker.add');
      expect(proposal, 'should be PROVEN').to.exist;
      expect(proposal.body._id).to.equal('Powhatan_(Native_American_leader)');
    });

    it('respects an explicit campaign.wikiSlug over the Wikidata sitelink', async () => {
      const wikidata = mockWikidata(
        async () => ({ qid: 'Q323813', label: 'Jamestown', start: null, end: null }),
        async () => 'Jamestown_(Virginia)'
      );
      const report = await buildReport({
        issue: 1, title: 't',
        campaigns: [{
          type: 'marker',
          name: 'Jamestown',
          wikidataQid: 'Q323813',
          wikiSlug: 'Jamestown_explicit',
          markerType: 'op',
          year: 1607,
          coo: [-76.78, 37.52],
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });

      expect(report.auto[0].body._id).to.equal('Jamestown_explicit');
    });

    it('falls back to defaultWikiSlug if Wikidata has no enwiki sitelink', async () => {
      const wikidata = mockWikidata(
        async () => ({ qid: 'Q1', label: 'Some Place', start: null, end: null }),
        async () => null
      );
      const report = await buildReport({
        issue: 1, title: 't',
        campaigns: [{
          type: 'marker',
          name: 'Some Place',
          wikidataQid: 'Q1',
          markerType: 'op',
          year: 1500,
          coo: [0, 0],
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });

      expect(report.auto[0].body._id).to.equal('Some_Place');
    });

    it('uses the enwiki sitelink for the metadata.add wiki field too (legend renders correct link)', async () => {
      const wikidata = mockWikidata(
        async () => ({ qid: 'Q49291', label: 'Powhatan', start: null, end: null }),
        async () => 'Powhatan'
      );
      const report = await buildReport({
        issue: 1, title: 't',
        campaigns: [{
          type: 'polity',
          name: 'Powhatan Confederacy',
          wikidataQid: 'Q49291',
          yearStart: 1570, yearEnd: 1646,
          chronasProvinces: ['Powhatan'],
          proposedRulerCode: 'POW',
          citations: [{ source: 'A' }, { source: 'B' }]
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });

      const meta = report.auto.find(p => p.kind === 'metadata.add');
      // childValue = [name, color, wiki, flag]
      expect(meta.childValue[2]).to.equal('Powhatan');
    });
  });

  describe('buildReport — culture areaScope=none', () => {
    it('does not emit any area.update', async () => {
      const wikidata = mockWikidata(async () => ({
        qid: 'Q190888',
        start: -13000, end: -7000
      }));
      const report = await buildReport({
        issue: 136,
        title: 't',
        campaigns: [{
          type: 'culture',
          name: 'Clovis',
          wikidataQid: 'Q190888',
          yearStart: -13000,
          yearEnd: -7000,
          chronasKey: 'clovis',
          areaScope: 'none',
          citations: []
        }],
        manualEntities: []
      }, { wikidata, chronas: mockChronasEmpty() });
      const areas = [...report.auto, ...report.manualReview].filter(p => p.kind === 'area.update');
      expect(areas.length).to.equal(0);
    });
  });

  describe('buildReport — manualEntities', () => {
    it('routes manual entities with two citations to auto', async () => {
      const wikidata = mockWikidata(async () => null);
      const report = await buildReport({
        issue: 1,
        title: 't',
        campaigns: [],
        manualEntities: [{
          scope: 'marker',
          reason: 'Wikidata thin for pre-colonial NA',
          citations: [{ source: 'Encyclopedia Virginia' }, { source: 'JSTOR Smith 1607' }],
          payload: { name: 'Werowocomoco', type: 'op', year: 1570, coo: [-76.78, 37.52] }
        }]
      }, { wikidata, chronas: mockChronasEmpty() });

      expect(report.summary.auto).to.equal(1);
      expect(report.auto[0].kind).to.equal('marker.add');
    });

    it('routes manual entities with one citation to manualReview', async () => {
      const wikidata = mockWikidata(async () => null);
      const report = await buildReport({
        issue: 1,
        title: 't',
        campaigns: [],
        manualEntities: [{
          scope: 'marker',
          reason: 'thin sourcing',
          citations: [{ source: 'OnlySource' }],
          payload: { name: 'X', type: 'op', year: 1, coo: [0, 0] }
        }]
      }, { wikidata, chronas: mockChronasEmpty() });

      expect(report.summary.auto).to.equal(0);
      expect(report.summary.manualReview).to.equal(1);
    });
  });

  it('coordinate tolerance constant equals 50km', () => {
    // Sanity: drift inside 50km is accepted; the campaign is at lat 37.5,
    // so 0.1° lon ≈ 8.85km, which must be inside tolerance.
    const dist = haversineKm({ lat: 37.5, lon: -76.7 }, { lat: 37.5, lon: -76.6 });
    expect(dist).to.be.below(COORD_TOLERANCE_KM);
  });
});
