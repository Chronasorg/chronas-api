/**
 * Wikidata SPARQL Query Client
 *
 * Shared module for querying the Wikidata SPARQL endpoint.
 * Rate-limited to 1 req/sec per Wikidata policy.
 * Uses native fetch (Node 22+).
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'ChronasDataValidator/1.0 (https://chronas.org)';
const MIN_REQUEST_INTERVAL_MS = 1100;

let lastRequestTime = 0;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function querySparql(sparqlQuery, retries = 3) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }

  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparqlQuery)}&format=json`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    lastRequestTime = Date.now();
    try {
      const response = await fetch(url, {
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
      return data.results.bindings;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`  Query failed (attempt ${attempt}/${retries}): ${err.message}`);
      await sleep(attempt * 2000);
    }
  }
}

export function extractValue(binding, field) {
  return binding[field]?.value || null;
}

export function extractYear(binding, field) {
  const val = extractValue(binding, field);
  if (!val) return null;
  const match = val.match(/(-?\d{1,4})/);
  return match ? parseInt(match[1], 10) : null;
}
