#!/usr/bin/env node

/**
 * Issue-driven validator (CLI wrapper).
 *
 * Usage:
 *   npm run validate:from-issue -- --input scripts/data-validation/inputs/issue-136-powhatan.json \
 *     --api-url https://api.chronas.org [--use-cached-only] [--no-write]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadCampaign } from './campaign-loader.js';
import { validateMappingsFile } from './mappings-validator.js';
import { buildReport } from './validate-from-issue-core.js';
import { ChronasClient } from './chronas-client.js';
import { entityByQid as wikidataEntityByQid, queryAt as wikidataQueryAt, enwikiSitelink as wikidataEnwikiSitelink } from './wikidata-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../reports');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: null,
    apiUrl: 'http://localhost:3001',
    useCachedOnly: false,
    write: true
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) opts.input = args[++i];
    if (args[i] === '--api-url' && args[i + 1]) opts.apiUrl = args[++i];
    if (args[i] === '--use-cached-only') opts.useCachedOnly = true;
    if (args[i] === '--no-write') opts.write = false;
  }
  return opts;
}

function summaryMarkdown(report) {
  const lines = [];
  lines.push(`# Issue #${report.issue} — ${report.title}`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`**Auto-apply (PROVEN):** ${report.summary.auto}`);
  lines.push(`**Manual review:** ${report.summary.manualReview}`);
  lines.push(`**Total proposals:** ${report.summary.total}`);
  lines.push('');
  lines.push('## Auto-apply');
  for (const p of report.auto) {
    lines.push(`- \`${p.kind}\` ${p.sourceCampaign}: ${JSON.stringify(p.body || p.value || p.key)}`);
  }
  lines.push('');
  lines.push('## Manual review');
  for (const p of report.manualReview) {
    let why = p.reason;
    if (!why && p.wikidataMatch) {
      if (p.wikidataMatch.labelAgrees === false) {
        const wdLabel = p.wikidataMatch.entity?.label || '(none)';
        why = `qid-label-mismatch (Wikidata returned "${wdLabel}" — wrong QID?)`;
      } else if (!p.wikidataMatch.dateAgrees || !p.wikidataMatch.coordAgrees) {
        why = 'wikidata-mismatch';
      } else {
        why = 'wikidata-mismatch';
      }
    }
    if (!why) why = 'insufficient-citations';
    lines.push(`- \`${p.kind}\` ${p.sourceCampaign}: **${why}**`);
  }
  return lines.join('\n');
}

async function run() {
  const opts = parseArgs();
  if (!opts.input) {
    console.error('Usage: validate-from-issue --input <campaign.json> [--api-url <url>] [--use-cached-only] [--no-write]');
    process.exit(1);
  }

  validateMappingsFile();
  const campaign = loadCampaign(opts.input);

  const wikidata = {
    entityByQid: (qid) => wikidataEntityByQid(qid, { useCachedOnly: opts.useCachedOnly }),
    queryAt: (args) => wikidataQueryAt(args, { useCachedOnly: opts.useCachedOnly }),
    enwikiSitelink: (qid) => wikidataEnwikiSitelink(qid, { useCachedOnly: opts.useCachedOnly })
  };
  const chronas = new ChronasClient({ apiUrl: opts.apiUrl });

  console.log('Issue-driven validator');
  console.log(`  Input: ${opts.input}`);
  console.log(`  API: ${opts.apiUrl}`);
  console.log(`  Wikidata: ${opts.useCachedOnly ? 'cached-only' : 'live'}`);
  console.log();

  const report = await buildReport(campaign, { wikidata, chronas });

  if (!opts.write) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(REPORTS_DIR, `issue-${report.issue}-${date}.json`);
  const mdPath = path.join(REPORTS_DIR, `issue-${report.issue}-${date}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, summaryMarkdown(report));
  console.log(`  Auto-apply: ${report.summary.auto}`);
  console.log(`  Manual review: ${report.summary.manualReview}`);
  console.log(`  Report: ${jsonPath}`);
  console.log(`  Summary: ${mdPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
