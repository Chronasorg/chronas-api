/**
 * Applier core (no I/O, no CLI).
 *
 * Writes proposals from a report in this fixed order: metadata.add → marker.add
 * → area.update. Before EVERY write the applier re-queries Wikidata for the
 * (year, region) the proposal targets. If the live Wikidata answer no longer
 * matches the report, the proposal is skipped and recorded as
 * `wikidata-drift`. This is the user's explicit requirement: "wir müssen
 * immer die daten für das jahr und die gegend update immer wikidata fragen".
 */

import { isProven, COORD_TOLERANCE_KM, DATE_TOLERANCE_YEARS, parseWikidataCoord, haversineKm } from './validate-from-issue-core.js';

const ORDER = { 'metadata.add': 0, 'marker.add': 1, 'area.update': 2 };

export function sortProposals(proposals) {
  return [...proposals].sort((a, b) => (ORDER[a.kind] ?? 99) - (ORDER[b.kind] ?? 99));
}

async function reCheckWikidata(proposal, ctx) {
  const qid =
    proposal.body?.wikidataQid ||
    proposal.value?.wikidataQid ||
    proposal.wikidataMatch?.entity?.qid;
  if (!qid) return { reChecked: false, reason: 'no-qid' };

  // Drift detection only makes sense when the report captured a Wikidata
  // entity to compare against. If wikidataMatch is null (manual entity, or a
  // proposal that was PROVEN purely by citations), there's no baseline — skip
  // the drift check. The QID-label sanity gate at report time and the
  // citation-based PROVEN predicate already covered this proposal.
  if (!proposal.wikidataMatch?.entity) {
    return { reChecked: false, reason: 'no-baseline' };
  }

  const fresh = await ctx.wikidata.entityByQid(qid, { bypassCache: true });
  if (!fresh) return { reChecked: true, agreed: false, reason: 'qid-not-found' };

  // Compare fresh Wikidata answer against the report's stored snapshot.
  // The contract is: a re-check fails only when Wikidata changed in a way that
  // contradicts the report. If a field was null when the report was generated
  // and is still null (or absent) now, that's not drift — the report was
  // already PROVEN via citations rather than Wikidata for that field.
  const expected = proposal.wikidataMatch.entity;

  const dateAgrees = (() => {
    if (expected.start === null && expected.end === null) return true;
    if (fresh.start === null || fresh.end === null) return true;
    if (expected.start === null || expected.end === null) return true;
    return (
      Math.abs(fresh.start - expected.start) <= DATE_TOLERANCE_YEARS &&
      Math.abs(fresh.end - expected.end) <= DATE_TOLERANCE_YEARS
    );
  })();

  let coordAgrees = true;
  if (expected.coordinates && fresh.coordinates) {
    const a = parseWikidataCoord(expected.coordinates);
    const b = parseWikidataCoord(fresh.coordinates);
    if (a && b) {
      coordAgrees = haversineKm(a, b) <= COORD_TOLERANCE_KM;
    }
  }
  return {
    reChecked: true,
    agreed: dateAgrees && coordAgrees,
    fresh,
    dateAgrees,
    coordAgrees
  };
}

function qidFromUri(value) {
  if (!value) return null;
  const m = value.match(/Q\d+$/);
  return m ? m[0] : null;
}

/**
 * Year+region check: at apply time, ask Wikidata "what does the world look
 * like at (lat, lon, year)?" The contract is intentionally asymmetric:
 *
 *   - If Wikidata returns NOTHING for any sample, that's "no info" — pass.
 *     Wikidata is sparse for many pre-modern, non-Western entities (e.g. the
 *     Powhatan Confederacy), and rejecting on absence would skip the very
 *     proposals #136 was filed for.
 *
 *   - If Wikidata returns the proposal's QID at any sample, that's
 *     confirmation — pass.
 *
 *   - If Wikidata returns OTHER QIDs at every sample but never the proposal's
 *     QID, that's a contradiction — skip with `year-region-mismatch`.
 *
 * The samples array is populated by the validator at report time —
 * area.update gets one sample per batch (mid-window year), marker.add gets
 * its own coordinate. metadata.add with no geographic claim has none.
 */
async function yearRegionRecheck(proposal, ctx) {
  const samples = proposal.yearRegionSamples || [];
  const expectedQid =
    proposal.body?.wikidataQid ||
    proposal.value?.wikidataQid ||
    proposal.wikidataMatch?.entity?.qid;
  if (!samples.length || !expectedQid) {
    return { reChecked: false };
  }
  if (typeof ctx.wikidata.queryAt !== 'function') {
    return { reChecked: false, reason: 'queryAt-unavailable' };
  }

  const evidence = [];
  for (const s of samples) {
    let bindings = null;
    let error = null;
    try {
      bindings = await ctx.wikidata.queryAt(
        { lat: s.lat, lon: s.lon, year: s.year, radiusKm: s.radiusKm || 100, instanceOf: s.instanceOf },
        { bypassCache: true }
      );
    } catch (err) {
      error = err.message;
    }
    if (error) {
      evidence.push({ sample: s, error, errored: true });
      continue;
    }
    const qids = (bindings || []).map(b => qidFromUri(b.qid)).filter(Boolean);
    evidence.push({
      sample: s,
      empty: qids.length === 0,
      found: qids.includes(expectedQid),
      qids: qids.slice(0, 10)
    });
  }
  const anyConfirms = evidence.some(e => e.found === true);
  // Treat errors and timeouts the same as "no info" — Wikidata being
  // unreachable is not a contradiction.
  const noInfo = e => e.errored === true || e.empty === true;
  const allNoInfo = evidence.every(noInfo);
  const anyContradicts = evidence.some(e => !e.found && !noInfo(e));
  const agreed = anyConfirms || (allNoInfo && !anyContradicts);
  return {
    reChecked: true,
    agreed,
    evidence,
    expectedQid
  };
}

async function preflightAreaSlot(proposal, ctx) {
  if (proposal.kind !== 'area.update') return { ok: true };
  const targetDimension = ['ruler', 'culture', 'religion', 'capital'].find(d => proposal.body[d] !== undefined);
  if (!targetDimension) return { ok: false, reason: 'no-dimension' };
  const dimIndex = { ruler: 0, culture: 1, religion: 2, capital: 3 }[targetDimension];
  // Curator-authorised replacements for this dimension. The validator carries
  // these from `campaign.overwrite[<dim>]` into proposal.overwrite[<dim>].
  // An empty allowlist preserves the default "fill empty slots only" rule.
  const allowedReplacements = new Set(proposal.overwrite?.[targetDimension] || []);

  // Match the builder: sample start/mid/end of the batch so we don't miss
  // a slot that was empty at start but occupied later in the window.
  const { start, end } = proposal.body;
  const yearsToSample = [start];
  if (end !== start) {
    const mid = Math.floor((start + end) / 2);
    if (mid !== start) yearsToSample.push(mid);
    yearsToSample.push(end);
  }

  // Province-existence check. The chronas-api updateMany controller silently
  // skips provinces it doesn't recognise (`if (!area.data[province]) return`),
  // so an area.update with an unknown province name returns 200 with zero
  // writes — silent data drop. Refuse the proposal up front instead.
  //
  // We only fire when the area doc clearly has data: real prod responses
  // always carry hundreds of province keys. An empty/missing doc means we
  // can't tell, so we let the request through (the slot-occupied check below
  // and the controller itself remain backstops).
  const refSample = await ctx.chronas.fetchYear(start);
  if (refSample.ok && refSample.body && Object.keys(refSample.body).length > 0) {
    const unknown = proposal.body.provinces.filter(p => !(p in refSample.body));
    if (unknown.length > 0) {
      return { ok: false, reason: 'unknown-province', details: { unknown, sampledYear: start } };
    }
  }

  const seen = new Map();
  for (const year of yearsToSample) {
    const sample = year === start ? refSample : await ctx.chronas.fetchYear(year);
    if (!sample.ok || !sample.body) continue;
    for (const prov of proposal.body.provinces) {
      const arr = sample.body[prov];
      if (Array.isArray(arr) && arr[dimIndex]) {
        const key = `${prov}@${year}`;
        if (!seen.has(key)) seen.set(key, { province: prov, year, currentValue: arr[dimIndex] });
      }
    }
  }
  const occupied = Array.from(seen.values());
  if (occupied.length === 0) return { ok: true };
  // Curator-authorised overwrite: pass only when EVERY occupied slot's
  // current value is on the campaign's allowlist for this dimension.
  if (allowedReplacements.size > 0 && occupied.every(o => allowedReplacements.has(o.currentValue))) {
    return { ok: true, overwriting: occupied };
  }
  return { ok: false, reason: 'slot-occupied', details: occupied };
}

async function preflightMetadata(proposal, ctx) {
  if (proposal.kind !== 'metadata.add') return { ok: true };
  // Chronas stores all values for one dimension as children of a single parent
  // doc keyed by the dimension name (e.g. _id="ruler", data={POW:[...]}). We
  // refuse to overwrite an existing childId; case-insensitive collisions also
  // count, since the renderer matches case-sensitively but humans don't.
  const parent = await ctx.chronas.getMetadataParent(proposal.dimension);
  if (!parent.ok || !parent.body) return { ok: true };
  const existingKeys = Object.keys(parent.body.data || {});
  const exact = existingKeys.includes(proposal.key);
  const ci = existingKeys.find(k => k.toLowerCase() === proposal.key.toLowerCase());
  if (exact) return { ok: false, reason: 'metadata-key-exists', details: { key: proposal.key } };
  if (ci) return { ok: false, reason: 'metadata-key-collision', details: { existing: ci, proposed: proposal.key } };
  return { ok: true };
}

async function preflightMarker(proposal, ctx) {
  if (proposal.kind !== 'marker.add') return { ok: true };
  const wiki = proposal.body?._id || proposal.body?.wiki;
  if (!wiki) return { ok: false, reason: 'marker-missing-wiki' };
  const existing = await ctx.chronas.getMarker(wiki);
  if (existing.ok) return { ok: false, reason: 'marker-already-exists', details: { wiki } };
  return { ok: true };
}

async function writeOne(proposal, ctx) {
  if (proposal.kind === 'metadata.add') {
    // The dimension docs (ruler, culture, religion, religionGeneral, capital,
    // province) store children as a flat data map, not as a nested
    // data[parentId][childId] tree. The path that actually writes to that
    // flat map is PUT /v1/metadata/:dimension/single, handled by
    // metadataCtrl.updateSingle — which also runs an RGB validator on
    // nextBody[1].
    //
    // POST /v1/metadata + parentId/childId/childValue silently no-ops here:
    // its gate (`metadata.data[parentId] !== undefined`) is false for flat
    // dimension docs, so the controller saves the doc unchanged and returns 200.
    return ctx.chronas.updateMetadataSingle(proposal.dimension, {
      subEntityId: proposal.key,
      nextBody: proposal.childValue
    });
  }
  if (proposal.kind === 'marker.add') {
    // marker.controller.js create() reads req.body._id || req.body.wiki to
    // form the marker id. The body shape used here matches the existing
    // Pocahontas record: _id, name, coo, year, type, optional end/coo2/html.
    const m = proposal.body;
    const payload = {
      _id: m._id || m.wiki,
      name: m.name,
      coo: m.coo,
      type: m.type,
      year: m.year
    };
    if (m.end !== undefined) payload.end = m.end;
    if (m.html !== undefined) payload.html = m.html;
    if (m.coo2 !== undefined) payload.coo2 = m.coo2;
    if (m.partOf !== undefined) payload.partOf = m.partOf;
    if (m.capital !== undefined) payload.capital = m.capital;
    return ctx.chronas.createMarker(payload);
  }
  if (proposal.kind === 'area.update') {
    return ctx.chronas.updateAreas(proposal.body);
  }
  throw new Error(`Unknown proposal kind: ${proposal.kind}`);
}

function extractRecordId(response) {
  const b = response.body;
  if (!b) return null;
  return b._id || b.id || b.markerId || null;
}

/**
 * Apply a list of proposals.
 *
 * @param {Array} proposals
 * @param {object} ctx
 * @param {object} ctx.chronas ChronasClient instance
 * @param {object} ctx.wikidata { entityByQid }
 * @param {object} opts
 * @param {boolean} opts.dryRun
 * @param {boolean} opts.allowUnproven
 * @param {string} opts.reviewedBy
 * @param {Set<string>} [opts.scope]  optional kinds filter
 */
export async function applyProposals(proposals, ctx, opts = {}) {
  const { dryRun = true, allowUnproven = false, reviewedBy = null, scope = null } = opts;
  const ordered = sortProposals(proposals);
  const applied = [];
  const skipped = [];

  for (const proposal of ordered) {
    if (scope && !scope.has(proposal.kind)) {
      skipped.push({ proposal, reason: 'out-of-scope' });
      continue;
    }
    if (!allowUnproven && !isProven(proposal)) {
      skipped.push({ proposal, reason: 'unproven' });
      continue;
    }
    if (allowUnproven && !isProven(proposal) && !reviewedBy) {
      skipped.push({ proposal, reason: 'reviewer-required' });
      continue;
    }

    const reCheck = await reCheckWikidata(proposal, ctx);
    if (reCheck.reChecked && !reCheck.agreed) {
      skipped.push({ proposal, reason: 'wikidata-drift', details: reCheck });
      continue;
    }

    // Year+region awareness: for area.update proposals, ask Wikidata
    // "what does the world look like at (lat, lon, year) right now?".
    // This is the "always re-query Wikidata for the year+region" guarantee
    // the user explicitly asked for.
    const yearRegion = await yearRegionRecheck(proposal, ctx);
    if (yearRegion.reChecked && !yearRegion.agreed) {
      skipped.push({ proposal, reason: 'year-region-mismatch', details: yearRegion });
      continue;
    }

    const metaPre = await preflightMetadata(proposal, ctx);
    if (!metaPre.ok) {
      skipped.push({ proposal, reason: metaPre.reason, details: metaPre.details });
      continue;
    }
    const markerPre = await preflightMarker(proposal, ctx);
    if (!markerPre.ok) {
      skipped.push({ proposal, reason: markerPre.reason, details: markerPre.details });
      continue;
    }
    const areaPre = await preflightAreaSlot(proposal, ctx);
    if (!areaPre.ok) {
      skipped.push({ proposal, reason: areaPre.reason, details: areaPre.details });
      continue;
    }

    if (dryRun) {
      applied.push({ proposal, dryRun: true, reCheck });
      continue;
    }

    const response = await writeOne(proposal, ctx);
    if (!response.ok) {
      skipped.push({ proposal, reason: 'http-error', status: response.status, body: response.body });
      continue;
    }
    applied.push({
      proposal,
      reCheck,
      recordId: extractRecordId(response),
      httpStatus: response.status,
      appliedAt: new Date().toISOString(),
      appliedBy: reviewedBy
    });
  }

  return { applied, skipped };
}

export const _internals = { reCheckWikidata, preflightAreaSlot, preflightMetadata };
