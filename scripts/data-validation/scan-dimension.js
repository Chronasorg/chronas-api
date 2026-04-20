#!/usr/bin/env node

/**
 * Dimension Scanner — discovers all unique values for a dimension across years
 *
 * Usage:
 *   node scripts/data-validation/scan-dimension.js --dimension religion --api-url http://localhost:3001
 *   node scripts/data-validation/scan-dimension.js --dimension culture --start -500 --end 2000
 *
 * Output: for each unique value, shows count, year range, and sample provinces
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../reports');

const DIM_INDEX = { ruler: 0, culture: 1, religion: 2, capital: 3 };

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dimension: 'religion',
    apiUrl: 'http://localhost:3001',
    startYear: -500,
    endYear: 2000,
    interval: 100,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dimension' && args[i + 1]) opts.dimension = args[++i];
    if (args[i] === '--api-url' && args[i + 1]) opts.apiUrl = args[++i];
    if (args[i] === '--start' && args[i + 1]) opts.startYear = parseInt(args[++i], 10);
    if (args[i] === '--end' && args[i + 1]) opts.endYear = parseInt(args[++i], 10);
    if (args[i] === '--interval' && args[i + 1]) opts.interval = parseInt(args[++i], 10);
  }
  return opts;
}

async function run() {
  const opts = parseArgs();
  const dimIndex = DIM_INDEX[opts.dimension];

  if (dimIndex === undefined) {
    console.error(`Invalid dimension: ${opts.dimension}. Use: ruler, culture, religion, capital`);
    process.exit(1);
  }

  console.log(`Dimension Scanner`);
  console.log(`  Dimension: ${opts.dimension} (index ${dimIndex})`);
  console.log(`  API: ${opts.apiUrl}`);
  console.log(`  Year range: ${opts.startYear} to ${opts.endYear}, interval ${opts.interval}`);
  console.log();

  // Collect stats per value
  const stats = {}; // value → { count, years: Set, sampleProvinces: [] }

  const years = [];
  for (let y = opts.startYear; y <= opts.endYear; y += opts.interval) {
    years.push(y);
  }

  console.log(`  Scanning ${years.length} years...`);

  for (const year of years) {
    const res = await fetch(`${opts.apiUrl}/v1/areas/${year}`);
    if (!res.ok) continue;

    const areaData = await res.json();
    for (const [province, data] of Object.entries(areaData)) {
      if (!Array.isArray(data) || data.length <= dimIndex) continue;

      const value = data[dimIndex] || '(empty)';
      if (!stats[value]) {
        stats[value] = { count: 0, minYear: year, maxYear: year, sampleProvinces: new Set() };
      }

      stats[value].count++;
      if (year < stats[value].minYear) stats[value].minYear = year;
      if (year > stats[value].maxYear) stats[value].maxYear = year;
      if (stats[value].sampleProvinces.size < 5) {
        stats[value].sampleProvinces.add(province);
      }
    }

    process.stdout.write(`\r  Scanned year ${year}...`);
  }

  console.log('\r  Scan complete.                    ');
  console.log();

  // Fetch metadata to check which values are registered
  let metadataValues = new Set();
  try {
    const metaRes = await fetch(`${opts.apiUrl}/v1/metadata/${opts.dimension}`);
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      metadataValues = new Set(Object.keys(metaData.data || metaData));
    }
  } catch (e) {
    console.warn('  Could not fetch metadata for validation');
  }

  // Sort by count descending
  const sorted = Object.entries(stats)
    .map(([value, s]) => ({
      value,
      count: s.count,
      yearRange: `${s.minYear} to ${s.maxYear}`,
      inMetadata: metadataValues.has(value) || value === '(empty)',
      sampleProvinces: [...s.sampleProvinces]
    }))
    .sort((a, b) => b.count - a.count);

  // Print results
  console.log(`=== ${opts.dimension.toUpperCase()} VALUES (${sorted.length} unique) ===`);
  console.log();

  const orphaned = sorted.filter(s => !s.inMetadata);
  const registered = sorted.filter(s => s.inMetadata);

  if (orphaned.length > 0) {
    console.log(`  ORPHANED VALUES (not in metadata — possible errors):`);
    orphaned.forEach(s => {
      console.log(`    "${s.value}": ${s.count} occurrences, years ${s.yearRange}`);
      console.log(`      Provinces: ${s.sampleProvinces.join(', ')}`);
    });
    console.log();
  }

  console.log(`  REGISTERED VALUES (${registered.length}):`);
  registered.forEach(s => {
    console.log(`    "${s.value}": ${s.count} occurrences, years ${s.yearRange}`);
  });

  // Write report
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportFile = path.join(REPORTS_DIR, `scan-${opts.dimension}-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(reportFile, JSON.stringify({ dimension: opts.dimension, options: opts, values: sorted }, null, 2));
  console.log();
  console.log(`  Report saved to: ${reportFile}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
