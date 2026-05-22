/**
 * Issue-driven validator core (no I/O, no CLI).
 *
 * Takes a campaign + a Wikidata client + a Chronas API client and returns a
 * structured report. Split out from the CLI wrapper so unit tests can drive it
 * with mocked Wikidata/Chronas responses.
 *
 * PROVEN predicate (issue #137 review):
 *   A proposal is PROVEN iff it has a Wikidata QID match where dates and
 *   coordinates agree with the campaign within tolerance, OR if the campaign
 *   provides at least two independent citations.
 */

export const COORD_TOLERANCE_KM = 50;
export const DATE_TOLERANCE_YEARS = 5;

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = (Math.sin(dLat / 2) ** 2) + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(dLon / 2) ** 2));
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function parseWikidataCoord(coordString) {
  if (!coordString) return null;
  const m = coordString.match(/Point\(([-0-9.]+)\s+([-0-9.]+)\)/);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

export function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

const LABEL_STOPWORDS = new Set([
  'the', 'and', 'of', 'in', 'on', 'at', 'a', 'an', 'culture', 'confederacy',
  'kingdom', 'empire', 'state', 'duchy', 'paramount', 'chief'
]);

/**
 * Cheap label sanity check: do the campaign name and the Wikidata label share
 * any non-trivial token? Catches the "wrong QID" class of bug where the
 * campaign claims Q1262048 = Powhatan but Wikidata returns "Jekermish".
 */
export function labelMatches(campaignName, wikidataLabel) {
  const a = new Set(tokenize(campaignName).filter(t => !LABEL_STOPWORDS.has(t)));
  const b = new Set(tokenize(wikidataLabel).filter(t => !LABEL_STOPWORDS.has(t)));
  if (a.size === 0 || b.size === 0) return false;
  for (const t of a) if (b.has(t)) return true;
  return false;
}

export function isProven(proposal) {
  // A QID-label mismatch is disqualifying regardless of citation count — it
  // almost always means the curator pasted the wrong QID.
  if (proposal.wikidataMatch && proposal.wikidataMatch.labelAgrees === false) {
    return false;
  }
  if (proposal.wikidataMatch && proposal.wikidataMatch.dateAgrees && proposal.wikidataMatch.coordAgrees && proposal.wikidataMatch.labelAgrees !== false) {
    return true;
  }
  const cites = proposal.citations || [];
  const sources = new Set(cites.map(c => c.source));
  return sources.size >= 2;
}

async function checkWikidataAlignment(wikidataClient, campaign) {
  if (!campaign.wikidataQid) return null;
  const entity = await wikidataClient.entityByQid(campaign.wikidataQid, { bypassCache: false });
  if (!entity) {
    return { found: false, dateAgrees: false, coordAgrees: false, labelAgrees: false, entity: null };
  }

  const labelAgrees = entity.label
    ? labelMatches(campaign.name || '', entity.label)
    : null;

  const dateAgrees =
    entity.start !== null &&
    entity.end !== null &&
    Math.abs(entity.start - campaign.yearStart) <= DATE_TOLERANCE_YEARS &&
    Math.abs(entity.end - campaign.yearEnd) <= DATE_TOLERANCE_YEARS;

  let coordAgrees = true;
  if (campaign.capital && entity.coordinates) {
    const wdCoord = parseWikidataCoord(entity.coordinates);
    if (!wdCoord) {
      coordAgrees = false;
    } else {
      const dist = haversineKm(
        { lat: campaign.capital.lat, lon: campaign.capital.lon },
        wdCoord
      );
      coordAgrees = dist <= COORD_TOLERANCE_KM;
    }
  }
  return { found: true, labelAgrees, dateAgrees, coordAgrees, entity };
}

function rulerChildValue(campaign, resolvedWikiSlug) {
  // [name, color, wiki, flag] — same shape every other ruler uses.
  // We don't fabricate a colour or flag; an empty string means "the curator
  // will fix this in the UI later", and the renderer falls back to a default.
  return [
    campaign.name,
    campaign.color || 'rgb(150,150,150)',
    campaign.wikiSlug || resolvedWikiSlug || campaign.name.replace(/\s+/g, '_'),
    campaign.flag || ''
  ];
}

function cultureChildValue(campaign, resolvedWikiSlug) {
  return [
    campaign.name,
    campaign.color || 'rgb(150,150,150)',
    campaign.wikiSlug || resolvedWikiSlug || campaign.name.replace(/\s+/g, '_'),
    campaign.flag || ''
  ];
}

async function resolveWikiSlug(campaign, ctx) {
  if (campaign.wikiSlug) return campaign.wikiSlug;
  if (!campaign.wikidataQid) return null;
  if (typeof ctx.wikidata.enwikiSitelink !== 'function') return null;
  try {
    return await ctx.wikidata.enwikiSitelink(campaign.wikidataQid);
  } catch {
    return null;
  }
}

// Wikidata `instance of` QIDs that count as "a polity" for the year/region
// check. We pin a handful here so the check ignores noise like modern
// townships, schools, and natural features when scanning a region.
const POLITY_INSTANCE_OF = 'Q15642541'; // historical country / sovereign state

function geoSamplesFor(campaign, year) {
  // Pilot: one sample per area.update batch using the campaign capital
  // (or the campaign's first explicit province coordinates if provided).
  // For now this is pragmatic — the alternative is per-province centroid
  // lookup which Chronas doesn't expose.
  const sample = (lat, lon) => ({ lat, lon, year, radiusKm: 200, instanceOf: POLITY_INSTANCE_OF });
  if (campaign.capital) return [sample(campaign.capital.lat, campaign.capital.lon)];
  if (campaign.coo) return [sample(campaign.coo[1], campaign.coo[0])];
  return [];
}

async function buildPolityProposals(campaign, ctx) {
  const proposals = [];
  const wdAlign = await checkWikidataAlignment(ctx.wikidata, campaign);
  const resolvedSlug = await resolveWikiSlug(campaign, ctx);

  proposals.push({
    kind: 'metadata.add',
    dimension: 'ruler',
    key: campaign.proposedRulerCode,
    childValue: rulerChildValue(campaign, resolvedSlug),
    value: {
      name: campaign.name,
      start: campaign.yearStart,
      end: campaign.yearEnd,
      wikidataQid: campaign.wikidataQid
    },
    citations: campaign.citations,
    wikidataMatch: wdAlign,
    sourceCampaign: campaign.name
  });

  proposals.push(...await buildAreaBatches({
    campaign,
    dimension: 'ruler',
    valueField: 'ruler',
    value: campaign.proposedRulerCode,
    wdAlign,
    ctx
  }));

  return proposals;
}

/**
 * Walk year-by-year through [campaign.yearStart, campaign.yearEnd] and group
 * consecutive years where every requested province has an empty slot into
 * area.update batches. Years with any occupation get an area.skip record.
 *
 * Why not "decade-aligned batches with skip for the whole decade": the issue
 * #136 case showed that the historical Powhatan rule overlapped the year
 * 1600 (empty) and 1608 (England arrives). A decade-aligned batch would skip
 * 1600–1609 entirely, losing the 1600–1607 fill that the curator wants.
 */
async function buildAreaBatches({ campaign, dimension, valueField, value, wdAlign, ctx }) {
  const out = [];
  // overwrite[<dim>] is an explicit allowlist: "I authorise replacing the
  // existing value if it currently equals one of these". Empty/undefined
  // means no overwrite — the apply will skip occupied slots.
  const allowedReplacements = new Set(campaign.overwrite?.[dimension] || []);

  // Pull each year's slot state once into a map so we don't refetch within a batch.
  const occupancyByYear = new Map();
  for (let year = campaign.yearStart; year <= campaign.yearEnd; year++) {
    const occ = await ctx.chronas.findOccupiedSlots(dimension, campaign.chronasProvinces, year, year);
    occupancyByYear.set(year, occ);
  }

  // For each year, classify as: empty (default fill), allowed-overwrite
  // (existing value is in the campaign's overwrite allowlist), or
  // occupied-not-allowed (must skip).
  function classify(occupied) {
    if (occupied.length === 0) return 'empty';
    if (allowedReplacements.size === 0) return 'occupied';
    const allMatched = occupied.every(o => allowedReplacements.has(o[dimension]));
    return allMatched ? 'overwrite' : 'occupied';
  }

  let runStart = null;
  let runMode = null; // 'empty' | 'overwrite'
  const flushRun = (runEnd) => {
    if (runStart === null) return;
    const midYear = Math.floor((runStart + runEnd) / 2);
    out.push({
      kind: 'area.update',
      body: {
        start: runStart,
        end: runEnd,
        provinces: campaign.chronasProvinces,
        [valueField]: value,
        wikidataQid: campaign.wikidataQid
      },
      yearRegionSamples: geoSamplesFor(campaign, midYear),
      overwrite: runMode === 'overwrite' ? { [dimension]: [...allowedReplacements] } : undefined,
      citations: campaign.citations,
      wikidataMatch: wdAlign,
      sourceCampaign: campaign.name
    });
    runStart = null;
    runMode = null;
  };

  // The chronas-api updateMany controller treats batches with end-start>=11
  // as fire-and-forget (waitForCompletion=false) — the synchronous response
  // races the per-year saves, and large area.update payloads can 500. Cap each
  // emitted batch at MAX_BATCH_YEARS years so the controller stays in the
  // synchronous path.
  const MAX_BATCH_YEARS = 10;

  for (let year = campaign.yearStart; year <= campaign.yearEnd; year++) {
    const occupied = occupancyByYear.get(year);
    const cls = classify(occupied);
    if (cls === 'empty' || cls === 'overwrite') {
      // Start a new run if there isn't one or the mode changed.
      if (runStart === null) {
        runStart = year;
        runMode = cls;
      } else if (runMode !== cls) {
        flushRun(year - 1);
        runStart = year;
        runMode = cls;
      } else if (year - runStart + 1 > MAX_BATCH_YEARS) {
        // Same mode but batch is full — close it and start the next one.
        flushRun(year - 1);
        runStart = year;
        runMode = cls;
      }
    } else {
      flushRun(year - 1);
      out.push({
        kind: 'area.skip',
        reason: 'slot-occupied',
        details: occupied,
        year,
        sourceCampaign: campaign.name
      });
    }
  }
  flushRun(campaign.yearEnd);
  return out;
}

async function buildCultureProposals(campaign, ctx) {
  const wdAlign = await checkWikidataAlignment(ctx.wikidata, campaign);
  const resolvedSlug = await resolveWikiSlug(campaign, ctx);
  const proposals = [{
    kind: 'metadata.add',
    dimension: 'culture',
    key: campaign.chronasKey,
    childValue: cultureChildValue(campaign, resolvedSlug),
    value: {
      name: campaign.name,
      start: campaign.yearStart,
      end: campaign.yearEnd,
      wikidataQid: campaign.wikidataQid
    },
    citations: campaign.citations,
    wikidataMatch: wdAlign,
    sourceCampaign: campaign.name
  }];

  if (campaign.areaScope === 'none') {
    return proposals;
  }

  proposals.push(...await buildAreaBatches({
    campaign,
    dimension: 'culture',
    valueField: 'culture',
    value: campaign.chronasKey,
    wdAlign,
    ctx
  }));
  return proposals;
}

function defaultWikiSlug(name) {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function buildMarkerProposals(campaign, ctx) {
  let wdAlign = null;
  if (campaign.wikidataQid) {
    wdAlign = await checkWikidataAlignment(ctx.wikidata, {
      name: campaign.name,
      wikidataQid: campaign.wikidataQid,
      yearStart: campaign.year,
      yearEnd: campaign.end || campaign.year,
      capital: { lat: campaign.coo[1], lon: campaign.coo[0] }
    });
  }
  // Wiki slug priority:
  //   1. campaign.wikiSlug (explicit curator override)
  //   2. Wikidata's English-Wikipedia sitelink for the QID — this is the
  //      authoritative article title and avoids 404s from name-derived slugs
  //      (e.g. "Wahunsenacawh_Chief_Powhatan" vs the real article
  //      "Powhatan_(Native_American_leader)").
  //   3. Underscored campaign.name as last-resort fallback.
  let wiki = campaign.wikiSlug;
  if (!wiki && campaign.wikidataQid && typeof ctx.wikidata.enwikiSitelink === 'function') {
    try {
      wiki = await ctx.wikidata.enwikiSitelink(campaign.wikidataQid);
    } catch {
      wiki = null;
    }
  }
  if (!wiki) wiki = defaultWikiSlug(campaign.name);
  return [{
    kind: 'marker.add',
    body: {
      _id: wiki,
      name: campaign.name,
      type: campaign.markerType,
      year: campaign.year,
      end: campaign.end,
      coo: campaign.coo,
      html: campaign.html,
      wikidataQid: campaign.wikidataQid
    },
    // Markers (people, events, settlements) are validated via the
    // entityByQid coord/label/date checks. A region scan around a
    // marker's coords returns modern POIs that don't speak to whether
    // the proposed marker is correct — so we skip year-region for them.
    yearRegionSamples: [],
    citations: campaign.citations,
    wikidataMatch: wdAlign,
    sourceCampaign: campaign.name
  }];
}

const BUILDERS = {
  polity: buildPolityProposals,
  culture: buildCultureProposals,
  marker: buildMarkerProposals
};

export async function buildReport(campaignFile, ctx) {
  const proposals = [];

  for (const c of campaignFile.campaigns) {
    const builder = BUILDERS[c.type];
    if (!builder) throw new Error(`Unknown campaign type: ${c.type}`);
    const built = await builder(c, ctx);
    proposals.push(...built);
  }

  for (const m of campaignFile.manualEntities || []) {
    const kind = `${m.scope}.add`;
    let body = m.payload;
    if (kind === 'marker.add' && !body._id && !body.wiki && body.name) {
      let slug = null;
      if (body.wikidataQid && typeof ctx.wikidata.enwikiSitelink === 'function') {
        try { slug = await ctx.wikidata.enwikiSitelink(body.wikidataQid); } catch { /* fallback */ }
      }
      body = { ...body, _id: slug || defaultWikiSlug(body.name) };
    }
    proposals.push({
      kind,
      body,
      // Manual marker entities skip the region scan for the same reason
      // built marker proposals do: it returns modern-POI noise that is not
      // a useful contradiction signal.
      yearRegionSamples: undefined,
      citations: m.citations,
      wikidataMatch: null,
      manual: true,
      reason: m.reason,
      sourceCampaign: 'manual'
    });
  }

  const auto = [];
  const manualReview = [];
  for (const p of proposals) {
    if (p.kind === 'area.skip') {
      manualReview.push(p);
      continue;
    }
    if (isProven(p)) {
      auto.push(p);
    } else {
      manualReview.push(p);
    }
  }

  return {
    issue: campaignFile.issue,
    title: campaignFile.title,
    generatedAt: new Date().toISOString(),
    summary: {
      auto: auto.length,
      manualReview: manualReview.length,
      total: proposals.length
    },
    auto,
    manualReview
  };
}
