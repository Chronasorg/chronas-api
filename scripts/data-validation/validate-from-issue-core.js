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

  for (let year = campaign.yearStart; year <= campaign.yearEnd; year += 10) {
    const batchEnd = Math.min(year + 9, campaign.yearEnd);
    const midYear = Math.floor((year + batchEnd) / 2);
    const occupiedSlots = await ctx.chronas.findOccupiedSlots(
      'ruler',
      campaign.chronasProvinces,
      year,
      batchEnd
    );
    if (occupiedSlots.length > 0) {
      proposals.push({
        kind: 'area.skip',
        reason: 'slot-occupied',
        details: occupiedSlots,
        sourceCampaign: campaign.name
      });
      continue;
    }
    proposals.push({
      kind: 'area.update',
      body: {
        start: year,
        end: batchEnd,
        provinces: campaign.chronasProvinces,
        ruler: campaign.proposedRulerCode,
        wikidataQid: campaign.wikidataQid
      },
      yearRegionSamples: geoSamplesFor(campaign, midYear),
      citations: campaign.citations,
      wikidataMatch: wdAlign,
      sourceCampaign: campaign.name
    });
  }

  return proposals;
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

  for (let year = campaign.yearStart; year <= campaign.yearEnd; year += 10) {
    const batchEnd = Math.min(year + 9, campaign.yearEnd);
    const midYear = Math.floor((year + batchEnd) / 2);
    const occupiedSlots = await ctx.chronas.findOccupiedSlots(
      'culture',
      campaign.chronasProvinces,
      year,
      batchEnd
    );
    if (occupiedSlots.length > 0) {
      proposals.push({
        kind: 'area.skip',
        reason: 'slot-occupied',
        details: occupiedSlots,
        sourceCampaign: campaign.name
      });
      continue;
    }
    proposals.push({
      kind: 'area.update',
      body: {
        start: year,
        end: batchEnd,
        provinces: campaign.chronasProvinces,
        culture: campaign.chronasKey,
        wikidataQid: campaign.wikidataQid
      },
      yearRegionSamples: geoSamplesFor(campaign, midYear),
      citations: campaign.citations,
      wikidataMatch: wdAlign,
      sourceCampaign: campaign.name
    });
  }
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
