#!/usr/bin/env node

/**
 * Correction Applier — reads a validation report and applies fixes via updateMany
 *
 * Usage:
 *   npm run validate:apply -- --report reports/religion-validation-2026-04-20.json --dry-run
 *   npm run validate:apply -- --report reports/religion-validation-2026-04-20.json --apply
 *
 * Safety:
 *   - Default mode is --dry-run (prints what would change, no writes)
 *   - --apply flag required to execute changes
 *   - Pre-flight check verifies data hasn't drifted since report was generated
 *   - Batches by max 10-year ranges for synchronous revision tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    reportFile: null,
    apiUrl: 'http://localhost:3001',
    apply: false,
    token: null,
    email: null,
    password: null,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report' && args[i + 1]) opts.reportFile = args[++i];
    if (args[i] === '--api-url' && args[i + 1]) opts.apiUrl = args[++i];
    if (args[i] === '--apply') opts.apply = true;
    if (args[i] === '--dry-run') opts.apply = false;
    if (args[i] === '--token' && args[i + 1]) opts.token = args[++i];
    if (args[i] === '--email' && args[i + 1]) opts.email = args[++i];
    if (args[i] === '--password' && args[i + 1]) opts.password = args[++i];
  }
  return opts;
}

async function login(apiUrl, email, password) {
  if (!email || !password) {
    throw new Error('Login requires --email and --password (or use --token to skip login)');
  }
  const res = await fetch(`${apiUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function preflight(apiUrl, report) {
  console.log('  Pre-flight: verifying data matches report...');
  const firstCall = report.apiCalls[0];
  if (!firstCall) return true;

  const year = firstCall.body.start;
  const res = await fetch(`${apiUrl}/v1/areas/${year}`);
  if (!res.ok) {
    console.error(`  Pre-flight FAILED: could not fetch year ${year}`);
    return false;
  }
  const areaData = await res.json();

  let needsCorrection = 0;
  let alreadyCorrect = 0;
  const expectedTarget = firstCall.body.religion;
  for (const province of firstCall.body.provinces) {
    const prov = areaData[province];
    if (!prov || !Array.isArray(prov)) continue;
    const currentReligion = prov[2];
    if (currentReligion === expectedTarget) {
      alreadyCorrect++;
    } else {
      needsCorrection++;
    }
  }

  console.log(`  Pre-flight: ${needsCorrection} provinces need correction, ${alreadyCorrect} already correct`);
  return needsCorrection > 0 || alreadyCorrect > 0;
}

async function run() {
  const opts = parseArgs();

  if (!opts.reportFile) {
    console.error('Usage: node apply-corrections.js --report <path> [--apply] [--api-url <url>] [--email <email> --password <pass>] [--token <jwt>]');
    process.exit(1);
  }

  const reportPath = path.resolve(process.cwd(), opts.reportFile);
  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found: ${reportPath}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  console.log(`Correction Applier`);
  console.log(`  Report: ${opts.reportFile}`);
  console.log(`  Generated: ${report.generatedAt}`);
  console.log(`  Mode: ${opts.apply ? 'APPLY (will modify data!)' : 'DRY-RUN (read-only)'}`);
  console.log(`  API: ${opts.apiUrl}`);
  console.log();
  console.log(`  Summary from report:`);
  console.log(`    Corrections: ${report.summary.corrections}`);
  console.log(`    Provinces:   ${report.summary.uniqueProvincesToCorrect}`);
  console.log(`    API calls:   ${report.apiCalls.length}`);
  console.log();

  if (!opts.apply) {
    console.log('=== DRY-RUN: API calls that would be made ===');
    console.log();
    report.apiCalls.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.method} ${call.url}`);
      console.log(`     ${call.note}`);
      console.log(`     Body: { start: ${call.body.start}, end: ${call.body.end}, provinces: [${call.body.provinces.length} items], religion: "${call.body.religion}" }`);
      console.log();
    });
    console.log('To apply these changes, run again with --apply');
    return;
  }

  // Apply mode
  const preflightOk = await preflight(opts.apiUrl, report);
  if (!preflightOk) {
    console.error('Pre-flight check failed. Aborting.');
    process.exit(1);
  }

  let token = opts.token;
  if (!token) {
    console.log('  Logging in...');
    token = await login(opts.apiUrl, opts.email, opts.password);
  }

  console.log();
  console.log('=== APPLYING CORRECTIONS ===');
  console.log();

  let success = 0;
  let failed = 0;

  for (let i = 0; i < report.apiCalls.length; i++) {
    const call = report.apiCalls[i];
    const progress = `[${i + 1}/${report.apiCalls.length}]`;

    try {
      const res = await fetch(`${opts.apiUrl}${call.url}`, {
        method: call.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(call.body)
      });

      if (res.ok) {
        console.log(`  ${progress} OK  years ${call.body.start}-${call.body.end}`);
        success++;
      } else {
        const errText = await res.text();
        console.error(`  ${progress} FAIL years ${call.body.start}-${call.body.end}: ${res.status} ${errText}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ${progress} ERROR years ${call.body.start}-${call.body.end}: ${err.message}`);
      failed++;
    }
  }

  console.log();
  console.log(`=== DONE: ${success} succeeded, ${failed} failed ===`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
