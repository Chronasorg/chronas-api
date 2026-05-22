#!/usr/bin/env node

/**
 * Correction applier.
 *
 * Two report shapes are accepted:
 *
 * 1. Legacy `report.apiCalls` — produced by validate-religion.js. Plain
 *    PUT /v1/areas calls. Default `--dry-run`, requires `--apply` to write.
 *
 * 2. Issue-driven `{auto, manualReview}` — produced by validate-from-issue.js.
 *    Goes through the generalised applier core: re-queries Wikidata at apply
 *    time for every (year, region) and skips proposals that no longer match
 *    the live Wikidata answer.
 *
 * NOTE: there is no automatic rollback. The Chronas API does not return new
 * revision ids in the response body, so we cannot capture them from the
 * applier. To revert, use the revisions UI.
 *
 * Usage:
 *   npm run validate:apply -- --report reports/issue-136-2026-05-15.json --dry-run
 *   npm run validate:apply -- --report reports/issue-136-2026-05-15.json --apply --reviewed-by you@example.com
 */

import fs from 'fs';
import path from 'path';

import { applyProposals } from './apply-corrections-core.js';
import { ChronasClient } from './chronas-client.js';
import { entityByQid as wikidataEntityByQid, queryAt as wikidataQueryAt } from './wikidata-client.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    reportFile: null,
    apiUrl: 'http://localhost:3001',
    apply: false,
    allowUnproven: false,
    reviewedBy: null,
    token: null,
    email: null,
    password: null,
    scope: null
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report' && args[i + 1]) opts.reportFile = args[++i];
    if (args[i] === '--api-url' && args[i + 1]) opts.apiUrl = args[++i];
    if (args[i] === '--apply') opts.apply = true;
    if (args[i] === '--dry-run') opts.apply = false;
    if (args[i] === '--allow-unproven') opts.allowUnproven = true;
    if (args[i] === '--reviewed-by' && args[i + 1]) opts.reviewedBy = args[++i];
    if (args[i] === '--token' && args[i + 1]) opts.token = args[++i];
    if (args[i] === '--email' && args[i + 1]) opts.email = args[++i];
    if (args[i] === '--password' && args[i + 1]) opts.password = args[++i];
    if (args[i] === '--scope' && args[i + 1]) opts.scope = args[++i].split(',');
  }
  return opts;
}

function isLegacyReport(report) {
  return Array.isArray(report.apiCalls);
}

async function ensureToken(client, opts) {
  if (opts.token) {
    client.setToken(opts.token);
    return;
  }
  if (opts.email && opts.password) {
    await client.login(opts.email, opts.password);
  }
}

async function runLegacy(report, opts, client) {
  console.log('  (legacy report shape — apiCalls)');
  if (!opts.apply) {
    console.log('=== DRY-RUN: API calls that would be made ===');
    report.apiCalls.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.method} ${call.url} — ${call.note}`);
    });
    return;
  }
  await ensureToken(client, opts);
  let success = 0; let failed = 0;
  for (let i = 0; i < report.apiCalls.length; i++) {
    const call = report.apiCalls[i];
    const res = await client._req(call.method, call.url, call.body);
    if (res.ok) {
      console.log(`  [${i + 1}/${report.apiCalls.length}] OK`);
      success++;
    } else {
      console.error(`  [${i + 1}/${report.apiCalls.length}] FAIL ${res.status}: ${res.text}`);
      failed++;
    }
  }
  console.log(`=== ${success} succeeded, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

async function runIssueDriven(report, opts, client) {
  await ensureToken(client, opts);

  const proposals = [...(report.auto || [])];
  if (opts.allowUnproven) {
    proposals.push(...(report.manualReview || []).filter(p => p.kind !== 'area.skip'));
  }

  const wikidata = {
    entityByQid: (qid, q = {}) => wikidataEntityByQid(qid, { ...q, bypassCache: true }),
    queryAt: (args, q = {}) => wikidataQueryAt(args, { ...q, bypassCache: true })
  };

  const result = await applyProposals(proposals, { chronas: client, wikidata }, {
    dryRun: !opts.apply,
    allowUnproven: opts.allowUnproven,
    reviewedBy: opts.reviewedBy,
    scope: opts.scope ? new Set(opts.scope) : null
  });

  console.log(`  Applied: ${result.applied.length}`);
  console.log(`  Skipped: ${result.skipped.length}`);
  for (const s of result.skipped) {
    let extra = '';
    if (s.reason === 'year-region-mismatch' && s.details?.evidence) {
      const ev = s.details.evidence[0];
      if (ev) {
        const got = (ev.qids || []).slice(0, 3).join(',');
        extra = ` (expected ${s.details.expectedQid}, got [${got}])`;
      }
    }
    console.log(`    skip [${s.proposal.kind}] ${s.reason}${extra}`);
  }
  if (!opts.apply) {
    console.log('  (dry-run — nothing was written)');
    return;
  }

  const appliedSidecar = (opts.reportFile || 'report')
    .replace(/\.json$/, '.applied.json');
  fs.writeFileSync(appliedSidecar, JSON.stringify(result, null, 2));
  console.log(`  Sidecar (apply log): ${appliedSidecar}`);
  console.log('  NOTE: no automatic rollback. To revert, use the revisions UI.');
  console.log('  NOTE: CloudFront/edge caches may serve stale responses for up to 24h.');
}

async function run() {
  const opts = parseArgs();
  const client = new ChronasClient({ apiUrl: opts.apiUrl });

  if (!opts.reportFile) {
    console.error('Usage: apply-corrections.js --report <path> [--apply] [--allow-unproven --reviewed-by <user>]');
    process.exit(1);
  }
  const reportPath = path.resolve(process.cwd(), opts.reportFile);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  console.log('Correction Applier');
  console.log(`  Report: ${opts.reportFile}`);
  console.log(`  Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  API: ${opts.apiUrl}`);
  console.log();

  if (isLegacyReport(report)) {
    await runLegacy(report, opts, client);
  } else {
    await runIssueDriven(report, opts, client);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
