#!/usr/bin/env node

/**
 * chronas-frontend issue #64: the wiki links of the Irish and Isles rulers.
 *
 * The ruler panel opens the English Wikipedia article named in
 * metadata.ruler[<id>][2]. For Meath in the year 1000 (ruler LOI, "The Isles")
 * that was `Isle`, a disambiguation page about the word. A check of the other
 * rulers that hold Irish provinces found more links to the wrong article:
 *
 *   LOI The Isles  Isle           (disambiguation)  -> Kingdom_of_the_Isles
 *   DMS Munster    Munster_Rugby  (rugby team)      -> Kingdom_of_Munster
 *   MCM Desmond    Desmond        (disambiguation)  -> Kingdom_of_Desmond
 *   TYR Tyrone     Tyrone         (disambiguation)  -> Tír_Eoghain
 *   MTH Meath      Meath          (modern county)   -> Kingdom_of_Meath
 *   LEI Leinster   Leinster       (modern province) -> Kingdom_of_Leinster
 *
 * Only index 2 (the wiki link) changes; names, colours and flags stay.
 *
 *   node scripts/data-validation/issue-64-ruler-wikis.js
 *        # dry run: compares the live API with the expected old links
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/issue-64-ruler-wikis.js --direct
 *        # writes through MetadataDynamo, backs up the ruler entries to
 *        # infra/backups/issue-64-<timestamp>/, then invalidates /v1/metadata*
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/issue-64-ruler-wikis.js --revert <backup dir>
 *        # puts the old links back; refuses if an entry changed since
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { distributionIdFrom, invalidateAfterDirectWrites } from './edge-invalidation-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_ROOT = process.env.EDGE_BACKUP_DIR || path.join(__dirname, '../../infra/backups');
const API_URL = process.env.CHRONAS_API_URL || 'https://api.chronas.org';
const WIKI = 2;

/** ruler id -> [link it has now, link it gets] */
export const FIXES = {
  LOI: ['Isle', 'Kingdom_of_the_Isles'],
  DMS: ['Munster_Rugby', 'Kingdom_of_Munster'],
  MCM: ['Desmond', 'Kingdom_of_Desmond'],
  TYR: ['Tyrone', 'Tír_Eoghain'],
  MTH: ['Meath', 'Kingdom_of_Meath'],
  LEI: ['Leinster', 'Kingdom_of_Leinster']
};

/**
 * Plans the fix against a ruler dictionary. An entry already on its new link
 * is skipped; one on neither link is a conflict (someone else edited it), and
 * any conflict stops the whole fix.
 * @returns {{ changes: Object<string, {before: Array, after: Array}>, done: string[], conflicts: string[] }}
 */
export function planFixes(ruler, fixes = FIXES) {
  const changes = {};
  const done = [];
  const conflicts = [];
  for (const [id, [from, to]] of Object.entries(fixes)) {
    const entry = ruler[id];
    if (!Array.isArray(entry)) { conflicts.push(`${id}: missing`); continue; }
    if (entry[WIKI] === to) { done.push(id); continue; }
    if (entry[WIKI] !== from) { conflicts.push(`${id}: wiki is ${JSON.stringify(entry[WIKI])}, expected ${JSON.stringify(from)}`); continue; }
    const after = [...entry];
    after[WIKI] = to;
    changes[id] = { before: entry, after };
  }
  return { changes, done, conflicts };
}

/**
 * Plans the revert of a backup: every written entry must still hold what was
 * written.
 */
export function planRevert(ruler, backup) {
  const changes = {};
  const conflicts = [];
  for (const [id, { before, after }] of Object.entries(backup)) {
    if (JSON.stringify(ruler[id]) !== JSON.stringify(after)) { conflicts.push(`${id}: changed since the fix`); continue; }
    changes[id] = { before: after, after: before };
  }
  return { changes, conflicts };
}

function print(changes, log) {
  for (const [id, { before, after }] of Object.entries(changes)) {
    log(`  ${id} ${before[0]}: ${before[WIKI]} -> ${after[WIKI]}`);
  }
}

async function writeRuler(changes, { log, distributionId }) {
  const { default: MetadataDynamo } = await import('../../server/models/dynamo/metadata.dynamo.js');
  const doc = await MetadataDynamo.findById('ruler').exec();
  if (!doc || !doc.data) throw new Error('The ruler document does not exist');
  for (const [id, { before, after }] of Object.entries(changes)) {
    if (JSON.stringify(doc.data[id]) !== JSON.stringify(before)) {
      throw new Error(`${id} changed between the plan and the write; nothing written`);
    }
    doc.data[id] = after;
  }
  if (typeof doc.markModified === 'function') doc.markModified('data');
  await doc.save();
  log(`  ${Object.keys(changes).length} ruler entries written.`);
  return invalidateAfterDirectWrites(['metadata'], { distributionId });
}

async function liveRuler() {
  const res = await fetch(`${API_URL}/v1/metadata?type=g&f=ruler`);
  if (!res.ok) throw new Error(`GET ruler metadata: ${res.status}`);
  return (await res.json()).ruler;
}

async function main(argv = process.argv.slice(2), log = console.log) {
  const direct = argv.includes('--direct');
  const revertAt = argv.indexOf('--revert');
  const revertDir = revertAt === -1 ? null : argv[revertAt + 1];

  if (revertDir) {
    const backup = JSON.parse(fs.readFileSync(path.join(revertDir, 'ruler.json'), 'utf8'));
    const { default: MetadataDynamo } = await import('../../server/models/dynamo/metadata.dynamo.js');
    const doc = await MetadataDynamo.findById('ruler').exec();
    const { changes, conflicts } = planRevert(doc.data, backup);
    if (conflicts.length) throw new Error(`Refusing to revert:\n  ${conflicts.join('\n  ')}`);
    print(changes, log);
    return writeRuler(changes, { log, distributionId: distributionIdFrom(argv) });
  }

  const ruler = direct
    ? (await (await import('../../server/models/dynamo/metadata.dynamo.js')).default.findById('ruler').exec()).data
    : await liveRuler();
  const { changes, done, conflicts } = planFixes(ruler);
  if (done.length) log(`Already fixed: ${done.join(', ')}`);
  if (conflicts.length) throw new Error(`Refusing to write:\n  ${conflicts.join('\n  ')}`);
  if (!Object.keys(changes).length) { log('Nothing to change.'); return true; }
  print(changes, log);

  if (!direct) {
    log('\nDRY RUN: nothing written. --direct writes through the models (AWS credentials).');
    return true;
  }
  const backupDir = path.join(BACKUP_ROOT, `issue-64-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'ruler.json'), JSON.stringify(changes, null, 1));
  log(`Backup in ${backupDir}`);
  const ok = await writeRuler(changes, { log, distributionId: distributionIdFrom(argv) });
  log(`\nDone. Revert with: --revert ${backupDir}`);
  return ok;
}

const isMain = () => {
  const script = process.argv[1];
  return script && [pathToFileURL(fs.realpathSync(script)).href, pathToFileURL(script).href].includes(import.meta.url);
};

if (isMain()) {
  main().then((ok) => { if (!ok) process.exitCode = 1; }).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
