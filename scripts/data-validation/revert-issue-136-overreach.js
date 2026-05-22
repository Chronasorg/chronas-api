#!/usr/bin/env node

/**
 * One-shot revert for the issue-136 over-reach.
 *
 * Two earlier apply runs assigned `POW` (Powhatan Confederacy) to provinces
 * that were not historically part of the Confederacy (Roanoke = Carolina
 * Algonquian, Conoy/Doeg/Moratok/Nanticoke/Pamlico = separate Algonquian
 * peoples), and to a year span 1650–1700 on Roanoke that is not supported
 * by Wikidata.
 *
 * Plan:
 *   1. For all 7 provinces, ruler='' for years 1570–1607 (originally empty).
 *   2. Roanoke 1650–1700, ruler='_Kingdom_of_England' (continuous with 1701+).
 *
 * Uses PUT /v1/areas, ≤10y batches (the controller can't handle larger).
 *
 * Usage:
 *   node scripts/data-validation/revert-issue-136-overreach.js \
 *     --api-url https://api.chronas.org \
 *     --email postman@aui.de --password postman123 \
 *     --dry-run    # default — prints calls
 *     --apply      # actually writes
 */

import process from 'process';

const args = process.argv.slice(2);
const opts = {
  apiUrl: 'http://localhost:3001',
  apply: false,
  email: null,
  password: null,
  token: null
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-url') opts.apiUrl = args[++i];
  if (args[i] === '--apply') opts.apply = true;
  if (args[i] === '--dry-run') opts.apply = false;
  if (args[i] === '--email') opts.email = args[++i];
  if (args[i] === '--password') opts.password = args[++i];
  if (args[i] === '--token') opts.token = args[++i];
}

async function login() {
  if (opts.token) return opts.token;
  if (!opts.email || !opts.password) throw new Error('--email + --password required (or --token)');
  const res = await fetch(`${opts.apiUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(opts.email)}&password=${encodeURIComponent(opts.password)}`
  });
  if (!res.ok) throw new Error(`login: ${res.status}`);
  const data = await res.json();
  return data.token;
}

function batchYears(start, end, maxYears = 10) {
  const ranges = [];
  for (let y = start; y <= end; y += maxYears) {
    ranges.push([y, Math.min(y + maxYears - 1, end)]);
  }
  return ranges;
}

function plan() {
  const calls = [];
  // Step 1: clear ruler for 7 provinces × 1570–1607
  const provinces1570_1607 = ['Powhatan', 'Roanoke', 'Conoy', 'Doeg', 'Moratok', 'Nanticoke', 'Pamlico'];
  for (const [s, e] of batchYears(1570, 1607)) {
    calls.push({
      label: `clear ruler 1570-1607 (${s}-${e})`,
      body: { start: s, end: e, provinces: provinces1570_1607, ruler: '' }
    });
  }
  // Step 2: Roanoke 1650–1700 → _Kingdom_of_England
  for (const [s, e] of batchYears(1650, 1700)) {
    calls.push({
      label: `restore Roanoke ENG 1650-1700 (${s}-${e})`,
      body: { start: s, end: e, provinces: ['Roanoke'], ruler: '_Kingdom_of_England' }
    });
  }
  return calls;
}

async function run() {
  const calls = plan();
  console.log(`Revert plan: ${calls.length} batched PUT /v1/areas calls`);
  console.log(`Mode: ${opts.apply ? 'APPLY (will write to ' + opts.apiUrl + ')' : 'DRY-RUN'}`);
  console.log();
  calls.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.label}`);
    console.log(`     PUT /v1/areas ${JSON.stringify(c.body)}`);
  });
  if (!opts.apply) {
    console.log('\n(dry-run — pass --apply to execute)');
    return;
  }
  console.log();
  const token = await login();
  let ok = 0; let failed = 0;
  for (const c of calls) {
    const res = await fetch(`${opts.apiUrl}/v1/areas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(c.body)
    });
    if (res.ok) {
      console.log(`  OK  ${c.label}`);
      ok++;
    } else {
      const text = await res.text();
      console.error(`  FAIL ${c.label}: ${res.status} ${text.slice(0, 200)}`);
      failed++;
    }
  }
  console.log(`\nDone. ${ok} OK, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
