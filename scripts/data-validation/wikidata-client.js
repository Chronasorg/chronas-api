/**
 * Wikidata SPARQL Query Client
 *
 * Rate-limited (1 req/s), with retry on 429/503 and an optional disk cache.
 * The cache is keyed on a SHA-256 of the SPARQL string; cached responses are
 * returned without hitting the network when `useCachedOnly` is true. Otherwise
 * the cache is a transparent speed-up — fresh queries still hit Wikidata.
 *
 * IMPORTANT (issue #137 review): the applier MUST re-query Wikidata at apply
 * time for every (year, region) it is about to write. Use `queryAt` from there
 * with `bypassCache: true` so we never apply state derived from an old report.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'ChronasDataValidator/1.0 (https://chronas.org)';
const MIN_REQUEST_INTERVAL_MS = 1100;

const SPARQL_DIR = path.resolve(__dirname, 'sparql');
const CACHE_DIR = path.resolve(__dirname, '../../cache/wikidata');

let lastRequestTime = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hashQuery(sparqlQuery) {
  return crypto.createHash('sha256').update(sparqlQuery).digest('hex');
}

function cachePath(hash) {
  return path.join(CACHE_DIR, `${hash}.json`);
}

function readCache(hash) {
  const p = cachePath(hash);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(hash, payload) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(hash), JSON.stringify(payload, null, 2));
}

/**
 * Run a raw SPARQL query against Wikidata.
 *
 * @param {string} sparqlQuery
 * @param {object} [opts]
 * @param {number} [opts.retries=3]
 * @param {boolean} [opts.useCache=true] Read cache hits before hitting the network.
 * @param {boolean} [opts.useCachedOnly=false] Fail the call if there is no cache hit (offline mode).
 * @param {boolean} [opts.bypassCache=false] Skip cache lookup AND skip cache write — used by the applier for fresh re-checks.
 * @param {function} [opts.fetchImpl=fetch] Override fetch for tests.
 * @returns {Promise<Array>} Raw SPARQL bindings.
 */
export async function querySparql(sparqlQuery, opts = {}) {
  const {
    retries = 3,
    useCache = true,
    useCachedOnly = false,
    bypassCache = false,
    fetchImpl = fetch
  } = opts;

  const hash = hashQuery(sparqlQuery);

  if (!bypassCache && useCache) {
    const cached = readCache(hash);
    if (cached) return cached.bindings;
  }
  if (useCachedOnly) {
    throw new Error(`No cached result for query (hash ${hash.slice(0, 12)}). Re-run without --use-cached-only.`);
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparqlQuery)}&format=json`;

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    lastRequestTime = Date.now();
    try {
      const response = await fetchImpl(url, {
        headers: {
          'Accept': 'application/sparql-results+json',
          'User-Agent': USER_AGENT
        }
      });

      if (response.status === 429 || response.status === 503) {
        const waitTime = attempt * 5000;
        console.warn(`  Wikidata rate limit (${response.status}), waiting ${waitTime / 1000}s (attempt ${attempt}/${retries})`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const bindings = data.results?.bindings || [];
      if (!bypassCache) {
        writeCache(hash, { query: sparqlQuery, fetchedAt: new Date().toISOString(), bindings });
      }
      return bindings;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      console.warn(`  Query failed (attempt ${attempt}/${retries}): ${err.message}`);
      await sleep(attempt * 2000);
    }
  }
  throw lastErr;
}

const TEMPLATE_CACHE = new Map();

export function loadTemplate(name) {
  if (TEMPLATE_CACHE.has(name)) return TEMPLATE_CACHE.get(name);
  const file = path.join(SPARQL_DIR, `${name}.rq`);
  if (!fs.existsSync(file)) {
    throw new Error(`SPARQL template not found: ${name} (looked in ${file})`);
  }
  const tpl = fs.readFileSync(file, 'utf8');
  TEMPLATE_CACHE.set(name, tpl);
  return tpl;
}

export function renderTemplate(template, params) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Missing SPARQL template parameter: ${key}`);
    }
    const v = params[key];
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return escapeSparqlString(v);
    throw new Error(`Unsupported SPARQL template value for ${key}: ${typeof v}`);
  });
}

function escapeSparqlString(s) {
  // Allow plain QID identifiers and ISO-like dates through; otherwise escape quotes.
  if (/^Q\d+$/.test(s)) return s;
  if (/^-?\d{1,4}(-\d{2}(-\d{2})?)?$/.test(s)) return s;
  return s.replace(/["\\]/g, c => `\\${c}`);
}

/**
 * Fetch the entity record at (lat, lon, year) constrained by `instanceOf`.
 *
 * Always re-queries Wikidata when `bypassCache: true` is passed — the applier
 * uses this to confirm the report is still valid right before writing.
 *
 * @param {object} args
 * @param {number} args.lat
 * @param {number} args.lon
 * @param {number} args.year
 * @param {number} [args.radiusKm=50]
 * @param {string} [args.instanceOf] Wikidata QID for `instance of` constraint, e.g. "Q15642541" (historical country).
 * @param {object} [opts] Forwarded to querySparql.
 */
export async function queryAt(args, opts = {}) {
  const { lat, lon, year, radiusKm = 50, instanceOf } = args;
  if (typeof lat !== 'number' || typeof lon !== 'number' || typeof year !== 'number') {
    throw new Error('queryAt requires numeric lat, lon, year');
  }
  const tpl = loadTemplate(instanceOf ? 'polity-at-location' : 'entity-at-location');
  const rendered = renderTemplate(tpl, {
    lat,
    lon,
    year,
    radiusKm,
    instanceOf: instanceOf || ''
  });
  const bindings = await querySparql(rendered, opts);
  return bindings.map(b => ({
    qid: extractValue(b, 'item'),
    label: extractValue(b, 'itemLabel'),
    start: extractYear(b, 'start'),
    end: extractYear(b, 'end'),
    coordinates: extractValue(b, 'coord'),
    raw: b
  }));
}

/**
 * Look up a Wikidata entity by its QID and return canonical attributes
 * (label, dates, coordinates, image). Used as the single source of truth at
 * apply time — the applier passes `bypassCache: true` so it always pulls fresh.
 */
export async function entityByQid(qid, opts = {}) {
  if (!/^Q\d+$/.test(qid)) throw new Error(`Invalid QID: ${qid}`);
  const tpl = loadTemplate('entity-by-qid');
  const rendered = renderTemplate(tpl, { qid });
  const bindings = await querySparql(rendered, opts);
  if (bindings.length === 0) return null;
  const b = bindings[0];
  return {
    qid,
    label: extractValue(b, 'itemLabel'),
    description: extractValue(b, 'itemDescription'),
    start: extractYear(b, 'start'),
    end: extractYear(b, 'end'),
    coordinates: extractValue(b, 'coord'),
    image: extractValue(b, 'image'),
    raw: b
  };
}

/**
 * Resolve the English-Wikipedia article slug for a Wikidata QID.
 *
 * Pulls from the Wikidata REST `wbgetentities` endpoint (cheaper + lower
 * timeout risk than SPARQL for this exact lookup). Returns the underscored
 * page title (e.g. "Powhatan_(Native_American_leader)") that the Chronas
 * frontend uses to build https://en.wikipedia.org/wiki/<slug> links.
 *
 * Returns null if the entity has no enwiki sitelink.
 */
export async function enwikiSitelink(qid, opts = {}) {
  if (!/^Q\d+$/.test(qid)) throw new Error(`Invalid QID: ${qid}`);
  const { fetchImpl = fetch, useCache = true, bypassCache = false } = opts;

  const cacheHash = hashQuery(`__enwiki:${qid}`);
  if (!bypassCache && useCache) {
    const cached = readCache(cacheHash);
    if (cached) return cached.title;
  }

  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const link = data.entities?.[qid]?.sitelinks?.enwiki?.title || null;
  const slug = link ? link.replace(/ /g, '_') : null;
  if (!bypassCache) writeCache(cacheHash, { qid, title: slug, fetchedAt: new Date().toISOString() });
  return slug;
}

export function extractValue(binding, field) {
  return binding[field]?.value || null;
}

export function extractYear(binding, field) {
  const val = extractValue(binding, field);
  if (!val) return null;
  // Wikidata ISO dates can be `+0123-04-05T00:00:00Z` or `-0500-01-01T00:00:00Z`.
  const match = val.match(/^([+-]?)(\d{1,5})/);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * parseInt(match[2], 10);
}

export const _internals = {
  hashQuery,
  cachePath,
  readCache,
  writeCache,
  CACHE_DIR,
  SPARQL_DIR,
  resetRateLimiter() { lastRequestTime = 0; },
  resetTemplateCache() { TEMPLATE_CACHE.clear(); }
};
