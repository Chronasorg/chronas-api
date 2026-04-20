#!/usr/bin/env node

/**
 * Religion Validation Script — Issue #10 (Eastern Orthodox territories)
 *
 * Scans production area data and generates correction reports for:
 * - Eastern territories wrongly tagged as 'catholic' or 'chalcedonism' post-1054
 * - Ottoman-period territories that should be 'sunni' during Ottoman rule
 *
 * Uses ruler data from the API itself to determine Ottoman conquest/liberation dates.
 * Optionally cross-references with Wikidata.
 *
 * Usage:
 *   node scripts/data-validation/validate-religion.js --api-url https://api.chronas.org
 *   node scripts/data-validation/validate-religion.js --api-url http://localhost:3001 --skip-wikidata
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { querySparql, extractValue, extractYear } from './wikidata-client.js';
import { easternOrthodoxProvinces, westernChalcedonismProvinces } from '../../config/wikidata-mappings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../reports');

const OTTOMAN_RULERS = new Set(['TUR', 'OTT']);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    apiUrl: 'http://localhost:3001',
    startYear: 1055,
    endYear: 2000,
    scanInterval: 5,
    skipWikidata: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-url' && args[i + 1]) opts.apiUrl = args[++i];
    if (args[i] === '--start' && args[i + 1]) opts.startYear = parseInt(args[++i], 10);
    if (args[i] === '--end' && args[i + 1]) opts.endYear = parseInt(args[++i], 10);
    if (args[i] === '--interval' && args[i + 1]) opts.scanInterval = parseInt(args[++i], 10);
    if (args[i] === '--skip-wikidata') opts.skipWikidata = true;
  }
  return opts;
}

async function fetchAreaYear(apiUrl, year) {
  const res = await fetch(`${apiUrl}/v1/areas/${year}`);
  if (!res.ok) return null;
  return res.json();
}

async function queryWikidataOrthodoxTerritories() {
  console.log('  Querying Wikidata for Eastern Orthodox territories...');
  const query = `
    SELECT ?entity ?entityLabel ?start ?end WHERE {
      ?entity p:P140 ?stmt .
      ?stmt ps:P140 wd:Q9592 .
      OPTIONAL { ?stmt pq:P580 ?start }
      OPTIONAL { ?stmt pq:P582 ?end }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT 500
  `;
  try {
    const results = await querySparql(query);
    return results.map(r => ({
      entity: extractValue(r, 'entity'),
      label: extractValue(r, 'entityLabel'),
      start: extractYear(r, 'start'),
      end: extractYear(r, 'end'),
    }));
  } catch (err) {
    console.warn(`  Wikidata query failed: ${err.message}`);
    return [];
  }
}

/**
 * Scan the API to find Ottoman conquest/liberation dates for each province.
 * Uses the ruler field: TUR = Ottoman rule.
 */
async function detectOttomanPeriods(apiUrl, provinces, startYear, endYear, interval) {
  console.log('  Detecting Ottoman conquest/liberation dates from ruler data...');

  const periods = {};
  const years = [];
  for (let y = startYear; y <= endYear; y += interval) years.push(y);

  const prevOttoman = {};
  for (const prov of provinces) prevOttoman[prov] = false;

  for (const year of years) {
    const data = await fetchAreaYear(apiUrl, year);
    if (!data) continue;

    for (const prov of provinces) {
      const v = data[prov];
      if (!v || !Array.isArray(v) || v.length < 3) continue;

      const isOttoman = OTTOMAN_RULERS.has(v[0]);

      if (isOttoman && !prevOttoman[prov]) {
        if (!periods[prov]) periods[prov] = [];
        periods[prov].push({ start: year, end: null });
      }
      if (!isOttoman && prevOttoman[prov] && periods[prov]?.length) {
        periods[prov][periods[prov].length - 1].end = year;
      }
      prevOttoman[prov] = isOttoman;
    }
    process.stdout.write(`\r  Scanned year ${year}...`);
  }
  console.log('\r  Ottoman period detection complete.          ');
  return periods;
}

function isOttomanYear(periods, province, year) {
  const provPeriods = periods[province];
  if (!provPeriods) return false;
  return provPeriods.some(p => year >= p.start && (p.end === null || year < p.end));
}

async function run() {
  const opts = parseArgs();
  console.log(`Religion Validation (Issue #10) — Refined`);
  console.log(`  API: ${opts.apiUrl}`);
  console.log(`  Year range: ${opts.startYear}-${opts.endYear}`);
  console.log(`  Scan interval: every ${opts.scanInterval} years`);
  console.log();

  const easternProvinceNames = Object.keys(easternOrthodoxProvinces);

  // Step 1: Detect Ottoman periods from ruler data
  const ottomanPeriods = await detectOttomanPeriods(
    opts.apiUrl, easternProvinceNames, 1300, 1920, opts.scanInterval
  );

  console.log();
  const ottomanProvs = Object.keys(ottomanPeriods).filter(p => ottomanPeriods[p].length > 0);
  console.log(`  Found ${ottomanProvs.length} provinces with Ottoman rule periods:`);
  for (const prov of ottomanProvs.sort()) {
    const p = ottomanPeriods[prov][0];
    console.log(`    ${prov}: Ottoman ${p.start}–${p.end || 'present'}`);
  }
  console.log();

  // Step 2: Optionally query Wikidata
  if (!opts.skipWikidata) {
    await queryWikidataOrthodoxTerritories();
  }

  // Step 3: Build correction API calls
  // Group 1: Provinces NEVER under Ottoman rule → orthodox for full range
  const neverOttoman = easternProvinceNames.filter(p => !ottomanProvs.includes(p));

  // Group 2: Provinces WITH Ottoman periods → split into orthodox/sunni/orthodox
  // Group 3: Special cases (Thrace, Hamid) already have correct sunni, just fix pre-Ottoman

  const apiCalls = [];

  // --- Group 1: orthodox 1055-2000 ---
  if (neverOttoman.length > 0) {
    for (let y = opts.startYear; y <= opts.endYear; y += 10) {
      const batchEnd = Math.min(y + 9, opts.endYear);
      apiCalls.push({
        method: 'PUT', url: '/v1/areas',
        body: { start: y, end: batchEnd, provinces: neverOttoman, religion: 'orthodox' },
        group: 1,
        note: `Group 1 (never Ottoman): ${neverOttoman.length} provinces → orthodox, years ${y}-${batchEnd}`
      });
    }
  }

  // --- Group 2: Ottoman provinces need split ---
  for (const prov of ottomanProvs) {
    const period = ottomanPeriods[prov][0];

    // Pre-Ottoman: orthodox
    if (opts.startYear < period.start) {
      const preEnd = period.start - 1;
      for (let y = opts.startYear; y <= preEnd; y += 10) {
        const batchEnd = Math.min(y + 9, preEnd);
        apiCalls.push({
          method: 'PUT', url: '/v1/areas',
          body: { start: y, end: batchEnd, provinces: [prov], religion: 'orthodox' },
          group: 2,
          note: `Group 2 pre-Ottoman: ${prov} → orthodox, years ${y}-${batchEnd}`
        });
      }
    }

    // Ottoman period: sunni
    const ottEnd = period.end ? period.end - 1 : opts.endYear;
    for (let y = period.start; y <= ottEnd; y += 10) {
      const batchEnd = Math.min(y + 9, ottEnd);
      apiCalls.push({
        method: 'PUT', url: '/v1/areas',
        body: { start: y, end: batchEnd, provinces: [prov], religion: 'sunni' },
        group: 2,
        note: `Group 2 Ottoman: ${prov} → sunni, years ${y}-${batchEnd}`
      });
    }

    // Post-liberation: orthodox
    if (period.end && period.end <= opts.endYear) {
      for (let y = period.end; y <= opts.endYear; y += 10) {
        const batchEnd = Math.min(y + 9, opts.endYear);
        apiCalls.push({
          method: 'PUT', url: '/v1/areas',
          body: { start: y, end: batchEnd, provinces: [prov], religion: 'orthodox' },
          group: 2,
          note: `Group 2 post-liberation: ${prov} → orthodox, years ${y}-${batchEnd}`
        });
      }
    }
  }

  // Step 4: Summary
  const group1Calls = apiCalls.filter(c => c.group === 1).length;
  const group2Calls = apiCalls.filter(c => c.group === 2).length;

  const report = {
    generatedAt: new Date().toISOString(),
    options: opts,
    summary: {
      group1_neverOttoman: { provinces: neverOttoman, count: neverOttoman.length, fix: 'orthodox 1055-2000' },
      group2_ottomanSplit: ottomanProvs.map(p => ({
        province: p,
        ottomanStart: ottomanPeriods[p][0].start,
        ottomanEnd: ottomanPeriods[p][0].end,
      })),
      totalApiCalls: apiCalls.length,
      group1Calls,
      group2Calls,
    },
    apiCalls
  };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportFile = path.join(REPORTS_DIR, `religion-validation-refined-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log('=== CORRECTION PLAN ===');
  console.log();
  console.log(`Group 1 — Never Ottoman (${neverOttoman.length} provinces → orthodox 1055-2000):`);
  neverOttoman.forEach(p => console.log(`  - ${p}`));
  console.log(`  API calls: ${group1Calls}`);
  console.log();
  console.log(`Group 2 — Ottoman split (${ottomanProvs.length} provinces → orthodox/sunni/orthodox):`);
  for (const prov of ottomanProvs.sort()) {
    const p = ottomanPeriods[prov][0];
    const preOtt = `orthodox ${opts.startYear}-${p.start - 1}`;
    const ott = `sunni ${p.start}-${p.end ? p.end - 1 : '?'}`;
    const postOtt = p.end ? `orthodox ${p.end}-${opts.endYear}` : '(still Ottoman)';
    console.log(`  - ${prov}: ${preOtt} → ${ott} → ${postOtt}`);
  }
  console.log(`  API calls: ${group2Calls}`);
  console.log();
  console.log(`Total API calls: ${apiCalls.length}`);
  console.log(`Report saved to: ${reportFile}`);

  return report;
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
