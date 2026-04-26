#!/usr/bin/env node
/**
 * Post-migration sanity check: compare source (DocumentDB) vs target
 * (DynamoDB) for a given collection. Reports:
 *   - item counts (source vs target, with tolerance)
 *   - random sample of N items: field-by-field diff, flags mismatches
 *   - size-warning for items approaching 400 KB
 *
 * Invocation:
 *   AWS_PROFILE=chronas-dev node scripts/migration/11-verify-migration.js \
 *     --collection markers [--sample 10]
 *
 * STUB: skeleton only; implementations land alongside each phase's
 * migration script so that every phase has a verify step.
 */

import process from 'node:process';

function parseArgs(argv) {
  const out = { sample: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--collection') out.collection = argv[++i];
    else if (a === '--sample') out.sample = Number(argv[++i]);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.collection) {
    console.log('Usage: 11-verify-migration.js --collection <name> [--sample N]');
    process.exit(args.help ? 0 : 2);
  }
  if (process.env.AWS_PROFILE !== 'chronas-dev') {
    console.error(`ERROR: AWS_PROFILE must be chronas-dev (got: ${process.env.AWS_PROFILE || 'unset'})`);
    process.exit(2);
  }
  console.log(`[verify] collection=${args.collection} sample=${args.sample}`);
  console.log('[verify] STUB — implement per-collection comparison alongside each phase.');
}

main().catch((err) => {
  console.error('[verify] fatal:', err);
  process.exit(1);
});
