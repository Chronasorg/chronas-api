#!/usr/bin/env node

/**
 * Broken culture and religion Wikipedia links (follow-up to
 * ruler-wiki-links.js, chronas-api #232).
 *
 * The province panel opens the English Wikipedia article named in
 * metadata.<dimension>[<id>][2]. A scan of every culture (551), religion (63)
 * and religionGeneral (13) entry on 2026-11-20
 * (action=query&prop=pageprops&ppprop=disambiguation&redirects=1, values
 * decoded first) found:
 *   - culture: 22 disambiguation pages, 4 missing articles, 4 percent-encoded
 *     and 2 #fragment links (30 entries)
 *   - religion: 1 disambiguation page, 2 #fragment links
 *   - religionGeneral: none
 * The new frontend passes the link through encodeURIComponent, so
 * percent-encoded or #fragment values open a 404.
 *
 * FIXES picks the article for each entry from its name, the years and
 * provinces it is on the map (GET /v1/areas/<year>, index 1 culture, index 2
 * religion) and the matching ruler's link. Cultures left alone because two
 * articles fit equally well or none fits: carib nordic pontic sidamo
 * (disambiguation), _Venise dongye test_field (never on the map).
 *
 * Before it writes, the script asks Wikipedia again about every new target:
 * one that is missing or a disambiguation page is left unchanged and listed.
 * Only index 2 (the wiki link) changes; names, colours and images stay.
 *
 *   node scripts/data-validation/dimension-wiki-links.js
 *        # dry run: compares the live API with the expected old links
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/dimension-wiki-links.js --direct
 *        # writes through MetadataDynamo, backs up the entries to
 *        # infra/backups/dimension-wiki-links-<timestamp>/, then invalidates /v1/metadata*
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/dimension-wiki-links.js --revert <backup dir>
 *        # puts the old links back; refuses if an entry changed since
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { distributionIdFrom, invalidateAfterDirectWrites } from './edge-invalidation-cli.js';
import { planFixes, planRevert } from './ruler-wiki-links.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_ROOT = process.env.EDGE_BACKUP_DIR || path.join(__dirname, '../../infra/backups');
const API_URL = process.env.CHRONAS_API_URL || 'https://api.chronas.org';
const WIKI = 2;
const USER_AGENT = 'ChronasWikiLinkFix/1.0 (https://chronas.org; aumannjoachim@gmail.com)';

/** dimension -> id -> [link it has now, link it gets] */
export const FIXES = {
  culture: {
    // Disambiguation pages
    ammonite: ['Ammonite_(disambiguation)', 'Ammon'], // Hawran, Jordan Valley −1200 to −340; ruler AMM
    bengali: ['Bengali', 'Bengalis'],
    boiian: ['Boii', 'Boii_(Bohemia)'], // Bohemia, Saxony −2000–0; ruler bcBOI
    castillian: ['Castilian', 'Castilians'],
    catalan: ['Catalan', 'Catalans'],
    chu: ['Chu', 'Chu_(state)'], // Hubei, Anhui −2000–0; ruler bcCHU
    gascon: ['Gascon', 'Gascony'], // Gascons redirects here
    gothic: ['Gothic', 'Goths'],
    nepali: ['Nepali', 'Nepalis'],
    oriya: ['Oriya', 'Odia_people'],
    papuan: ['Papuan_people', 'Indigenous_people_of_New_Guinea'], // Papuan_peoples redirects here
    polish: ['Polish', 'Polish_people'],
    qasim: ['Qasim', 'Qasim_Khanate'], // Kasimov 1320–1840; Qasim_Tatars redirects here; ruler QAS
    slovene: ['Slovene', 'Slovenes'],
    telegu: ['Telugu', 'Telugu_people'],
    venetian: ['Venetian', 'Venetian_language'], // no article on the people; ligurian links its language too
    wei: ['Wei', 'Wei_(state)'], // Shanxi, Henan −2000–0
    // Missing articles
    al_misr_arabic: ['Moataz_Al-Demerdash', 'Egyptian_Arabic'], // Egypt, Cyrenaica, Gaza 700–2000; link was a person
    _Cultura_de_las_tumbas_de_tiro: ['Tradici%C3%B3n_de_las_tumbas_de_tiro', 'Western_Mexico_shaft_tomb_tradition'], // Spanish title
    // Percent-encoded or #fragment links (the frontend encodes them again: 404)
    _Eblaite: ['Ebla#People,_language,_and_culture', 'Ebla'],
    _Eyland: ['%C3%96land', 'Öland'],
    _Red_Paint_People: ['Red_Paint_People#:~:text=The%20Red%20Paint%20People%20are%20a%20Pre-Columbian%20culture,the%20bodies%20of%20the%20dead%20and%20grave%20goods.', 'Red_Paint_People'],
    '_Selk\'nam': ['Selk%27nam_people', 'Selkʼnam_people'] // the decoded title redirects here
  },
  religion: {
    orthodox: ['Orthodox_Church', 'Eastern_Orthodox_Church'], // Balkans, Anatolia, Caucasus; coptic and nestorian are separate
    '_Proto-Canaanite': ['Ebla#Religion', 'Ebla'],
    nuragic_religion: ['Nuragic_civilization#Religion', 'Nuragic_civilization']
  }
};

export const DIMENSIONS = Object.keys(FIXES);

/**
 * Asks Wikipedia about each title (50 per request, redirects followed).
 * @returns {Promise<Object<string, string>>} title -> problem, for the titles
 *   that are missing, invalid or a disambiguation page
 */
export async function checkTargets(titles, { fetchImpl = fetch } = {}) {
  const problems = {};
  const unique = [...new Set(titles)];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: 'query', prop: 'pageprops', ppprop: 'disambiguation', redirects: '1',
      format: 'json', formatversion: '2', titles: batch.join('|')
    })}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Wikipedia API: ${res.status}`);
    const { query } = await res.json();
    for (const title of batch) {
      let final = title.replace(/_/g, ' ');
      for (const n of query.normalized || []) if (n.from === final || n.from === title) final = n.to;
      for (const r of query.redirects || []) if (r.from === final) final = r.to;
      const page = (query.pages || []).find(p => p.title === final);
      if (!page || page.missing || page.invalid) problems[title] = 'missing';
      else if (page.pageprops && 'disambiguation' in page.pageprops) problems[title] = 'disambiguation page';
    }
  }
  return problems;
}

/** Drops the changes whose new target failed the check. */
export function dropFailed(changes, problems) {
  const kept = {};
  const failed = [];
  for (const [id, change] of Object.entries(changes)) {
    const problem = problems[change.after[WIKI]];
    if (problem) failed.push(`${id}: ${change.after[WIKI]} is ${problem}`);
    else kept[id] = change;
  }
  return { kept, failed };
}

function print(dimension, changes, log) {
  for (const [id, { before, after }] of Object.entries(changes)) {
    log(`  ${dimension} ${id} ${before[0]}: ${before[WIKI]} -> ${after[WIKI]}`);
  }
}

async function metadataModel() {
  return (await import('../../server/models/dynamo/metadata.dynamo.js')).default;
}

async function writeDimension(dimension, changes, log) {
  const MetadataDynamo = await metadataModel();
  const doc = await MetadataDynamo.findById(dimension).exec();
  if (!doc || !doc.data) throw new Error(`The ${dimension} document does not exist`);
  for (const [id, { before, after }] of Object.entries(changes)) {
    if (JSON.stringify(doc.data[id]) !== JSON.stringify(before)) {
      throw new Error(`${dimension} ${id} changed between the plan and the write; nothing written for ${dimension}`);
    }
    doc.data[id] = after;
  }
  if (typeof doc.markModified === 'function') doc.markModified('data');
  await doc.save();
  log(`  ${Object.keys(changes).length} ${dimension} entries written.`);
}

async function readDimension(dimension, direct) {
  if (direct) return (await (await metadataModel()).findById(dimension).exec()).data;
  const res = await fetch(`${API_URL}/v1/metadata?type=g&f=${dimension}`);
  if (!res.ok) throw new Error(`GET ${dimension} metadata: ${res.status}`);
  return (await res.json())[dimension];
}

async function main(argv = process.argv.slice(2), log = console.log) {
  const direct = argv.includes('--direct');
  const revertAt = argv.indexOf('--revert');
  const revertDir = revertAt === -1 ? null : argv[revertAt + 1];

  if (revertDir) {
    const plans = {};
    for (const dimension of DIMENSIONS) {
      const file = path.join(revertDir, `${dimension}.json`);
      if (!fs.existsSync(file)) continue;
      const { changes, conflicts } = planRevert(await readDimension(dimension, true), JSON.parse(fs.readFileSync(file, 'utf8')));
      if (conflicts.length) throw new Error(`Refusing to revert ${dimension}:\n  ${conflicts.join('\n  ')}`);
      plans[dimension] = changes;
    }
    for (const [dimension, changes] of Object.entries(plans)) {
      print(dimension, changes, log);
      await writeDimension(dimension, changes, log);
    }
    return invalidateAfterDirectWrites(['metadata'], { distributionId: distributionIdFrom(argv) });
  }

  const plans = {};
  for (const dimension of DIMENSIONS) {
    const { changes, done, conflicts } = planFixes(await readDimension(dimension, direct), FIXES[dimension]);
    if (done.length) log(`${dimension} already fixed: ${done.join(', ')}`);
    if (conflicts.length) throw new Error(`Refusing to write ${dimension}:\n  ${conflicts.join('\n  ')}`);
    plans[dimension] = changes;
  }

  const targets = Object.values(plans).flatMap(changes => Object.values(changes).map(c => c.after[WIKI]));
  const problems = await checkTargets(targets);
  let total = 0;
  for (const dimension of DIMENSIONS) {
    const { kept, failed } = dropFailed(plans[dimension], problems);
    if (failed.length) log(`${dimension} left unchanged, target failed the Wikipedia check:\n  ${failed.join('\n  ')}`);
    plans[dimension] = kept;
    total += Object.keys(kept).length;
    print(dimension, kept, log);
  }
  if (!total) { log('Nothing to change.'); return true; }

  if (!direct) {
    log(`\nDRY RUN: ${total} links, nothing written. --direct writes through the models (AWS credentials).`);
    return true;
  }
  const backupDir = path.join(BACKUP_ROOT, `dimension-wiki-links-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const [dimension, changes] of Object.entries(plans)) {
    if (Object.keys(changes).length) fs.writeFileSync(path.join(backupDir, `${dimension}.json`), JSON.stringify(changes, null, 1));
  }
  log(`Backup in ${backupDir}`);
  for (const [dimension, changes] of Object.entries(plans)) {
    if (Object.keys(changes).length) await writeDimension(dimension, changes, log);
  }
  const ok = await invalidateAfterDirectWrites(['metadata'], { distributionId: distributionIdFrom(argv) });
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
