#!/usr/bin/env node
/**
 * Per-collection data copy: Mongoose read → DynamoDB BatchWriteItem.
 *
 * Invocation:
 *   AWS_PROFILE=chronas-dev node scripts/migration/10-migrate-collection.js \
 *     --collection markers [--dry-run] [--resume-from <_id>]
 *
 * Supported --collection values: markers, areas, metadata, links, users,
 * flags, revisions, collections, games, board.
 *
 * Re-runnable: BatchWriteItem uses PutItem semantics — re-running will
 * overwrite existing target items with the current source contents.
 * --resume-from skips source items with _id < the given value (useful for
 * resuming after a mid-run failure).
 *
 * STUB: this is the skeleton only. The per-collection transform/write
 * logic lands in Phases 1–7 as each model comes online.
 */

import process from 'node:process';

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--collection') out.collection = argv[++i];
    else if (a === '--resume-from') out.resumeFrom = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log('Usage: 10-migrate-collection.js --collection <name> [--dry-run] [--resume-from <_id>]');
  console.log('Collections: markers | areas | metadata | links | users | flags | revisions | collections | games | board');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.collection) {
    usage();
    process.exit(args.help ? 0 : 2);
  }
  if (process.env.AWS_PROFILE !== 'chronas-dev') {
    console.error(`ERROR: AWS_PROFILE must be chronas-dev (got: ${process.env.AWS_PROFILE || 'unset'})`);
    process.exit(2);
  }

  console.log(`[migrate] collection=${args.collection} dryRun=${args.dryRun} resumeFrom=${args.resumeFrom || '<start>'}`);
  console.log('[migrate] STUB — per-collection logic is implemented in Phases 1–7.');
  console.log('[migrate] No data was copied.');
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
