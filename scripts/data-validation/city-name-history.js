#!/usr/bin/env node

/**
 * City name history (chronas-frontend issue #69): cities on the map should
 * carry the name they had in the selected year, e.g. Tsaritsyn (1589–1925),
 * Stalingrad (1925–1961), Volgograd (since 1961).
 *
 * Each city marker (type `c`) may get an optional `names` list of
 * [fromYear | null, untilYear | null, name]: the name applies from fromYear
 * (inclusive) until untilYear (exclusive); null is open. Outside every entry
 * the frontend shows the marker's own `name`.
 *
 * The source is Wikidata "official name" (P1448) statements with a start
 * (P580) or end (P582) qualifier, on the item of the marker's English
 * Wikipedia article (the marker `_id`). Rules, in buildNameHistory():
 *   - a period is one (start, end) pair; statements without either are ignored
 *   - per period: the English statement; else the city's own language when it
 *     is written in Latin script, or the English article title when that
 *     period's name equals today's name in the city's own language
 *     (Санкт-Петербург 1703–1914 = Saint Petersburg); else the first
 *     Latin-script statement in LATIN_LANGS order; else the period is dropped
 *   - a period overlapping one chosen by a better rule is dropped
 *   - a city keeps a history only when some period's name differs from its
 *     marker name
 *
 *   node scripts/data-validation/city-name-history.js --fetch
 *        # reads the live cities and Wikidata, writes inputs/city-name-history.json
 *   node scripts/data-validation/city-name-history.js
 *        # dry run: compares that file with the live markers
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/city-name-history.js --direct
 *        # writes `names` through MarkerDynamo, backs up to
 *        # infra/backups/city-names-<timestamp>/, invalidates /v1/markers*
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/city-name-history.js --revert <backup dir>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { distributionIdFrom, invalidateAfterDirectWrites } from './edge-invalidation-cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_ROOT = process.env.EDGE_BACKUP_DIR || path.join(__dirname, '../../infra/backups');
const API_URL = process.env.CHRONAS_API_URL || 'https://api.chronas.org';
export const OUTPUT = path.join(__dirname, 'inputs/city-name-history.json');
const UA = { headers: { 'User-Agent': 'chronas-city-names/1.0 (https://chronas.org)' } };

/**
 * Latin-script languages whose names are used when a period has no English
 * name and none in the city's own language, best first. Languages that only
 * transliterate foreign names (az, ro, hu, fr for Russian or Polish cities)
 * are left out: they gave "Leninqrad", "Țelinograd", "Landsberg-sur-la-Warthe".
 * Russian is transliterated only for cities whose own language is written in
 * Cyrillic: for others it gave "Rangun" (Rangoon) and "Stenlivil" (Stanleyville).
 */
export const LATIN_LANGS = ['de', 'pl', 'it', 'nl', 'sv', 'nb', 'da', 'es', 'pt'];

/** Markers of type c that are institutions, not places: no name history. */
const NOT_A_PLACE = /(Universit|College|Museum|Academy|Institut|School|Revue|Seminary)/i;
/** Cities whose Wikidata periods name an administrative form, not the city. */
const SKIP = new Set(['Vienna', 'Rome', 'Hong_Kong']);

const LATIN_TEXT = /^[\p{Script=Latin}\p{M}\s'’.\-()]+$/u;
const isLatin = text => LATIN_TEXT.test(text);

/** English article title as a name: "Abilene,_Texas" -> "Abilene", "Mocha_(city)" -> "Mocha". */
export const titleName = title => decodeURIComponent(title).replace(/_/g, ' ').replace(/\s*\(.*\)$/, '').replace(/,.*$/, '').trim();

const RU = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

/** Russian Cyrillic in the usual English (BGN/PCGN-like) spelling: Свердловск -> Sverdlovsk, Горький -> Gorky. */
export function transliterateRu(text) {
  const words = text.split(/(\s+|-)/);
  return words.map((word) => {
    let out = '';
    const lower = word.toLowerCase().replace(/[ий]й$/u, 'y');
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      const prev = lower[i - 1];
      let t;
      if (ch === 'е') t = (i === 0 || 'аеёиоуыэюяъь'.includes(prev)) ? 'ye' : 'e';
      else if (ch === 'ё') t = (i === 0 || 'аеёиоуыэюяъь'.includes(prev)) ? 'yo' : 'yo';
      else t = RU[ch] ?? ch;
      out += t;
    }
    if (word !== lower && word[0] && word[0] !== word[0].toLowerCase()) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
  }).join('');
}

const yearOf = time => (time ? parseInt(time.slice(0, time.indexOf('-', 1)), 10) : null);

/** P1448 statements of a Wikidata entity as { lang, text, start, end }. */
export function officialNames(entity) {
  return (entity?.claims?.P1448 || [])
    .filter(c => c.rank !== 'deprecated' && c.mainsnak?.datavalue?.value?.text)
    .map((c) => {
      const q = c.qualifiers || {};
      const time = p => q[p]?.[0]?.datavalue?.value?.time;
      return {
        lang: c.mainsnak.datavalue.value.language,
        text: c.mainsnak.datavalue.value.text.trim(),
        start: yearOf(time('P580')),
        end: yearOf(time('P582'))
      };
    });
}

const lo = p => p.start ?? -Infinity;
const hi = p => p.end ?? Infinity;
const overlaps = (a, b) => lo(a) < hi(b) && lo(b) < hi(a);
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * @param marker { _id, name }
 * @param statements officialNames(entity)
 * @returns {Array<[number|null, number|null, string]> | null}
 *   consecutive periods; the first may start open, the last ends open
 */
export function buildNameHistory(marker, statements) {
  if (NOT_A_PLACE.test(marker._id) || SKIP.has(marker._id)) return null;
  const dated = statements.filter(s => (s.start !== null || s.end !== null)
    && !(s.start !== null && s.end !== null && s.end <= s.start));
  if (!dated.length) return null;

  const modern = titleName(marker._id);
  const currentTexts = new Set(statements.filter(s => s.end === null && s.lang !== 'en').map(s => s.text));
  // The city's own language: that of its current name. Unknown when Wikidata
  // dates no current name; then only English and LATIN_LANGS count.
  const nativeNow = statements.find(s => s.end === null && s.lang !== 'en');
  const native = nativeNow?.lang;
  // Wikidata often has only a Russian current name for African or Asian
  // cities too (Kisangani), so the Cyrillic rule also needs the city to lie in
  // Eastern Europe or northern Asia.
  const [lon, lat] = marker.coo || [0, 0];
  const cyrillic = Boolean(nativeNow && /\p{Script=Cyrillic}/u.test(nativeNow.text) && lat >= 35 && lon >= 19);

  const periods = new Map();
  for (const s of dated) {
    const key = `${s.start}|${s.end}`;
    if (!periods.has(key)) periods.set(key, { start: s.start, end: s.end, statements: [] });
    periods.get(key).statements.push(s);
  }

  const candidates = [];
  for (const p of periods.values()) {
    const en = p.statements.find(s => s.lang === 'en');
    const own = p.statements.find(s => s.lang === native);
    const latin = LATIN_LANGS.map(l => p.statements.find(s => s.lang === l && isLatin(s.text))).find(Boolean);
    const ru = cyrillic && p.statements.find(s => s.lang === 'ru' && /^[\p{Script=Cyrillic}\s-]+$/u.test(s.text));
    let name = null;
    let rank;
    if (en) { name = en.text; rank = 0; } else if (p.statements.some(s => currentTexts.has(s.text))) { name = modern; rank = 1; } else if (own && isLatin(own.text)) { name = own.text; rank = 1; } else if (latin) { name = latin.text; rank = 2 + LATIN_LANGS.indexOf(latin.lang); } else if (ru) { name = transliterateRu(ru.text); rank = 2 + LATIN_LANGS.length; }
    // "stanitsa Batalpashinskaya": a descriptive form, not a name.
    if (!name || name[0] !== name[0].toUpperCase()) continue;
    // "City of Calgary", "Kota Besar Bandung": the city's own name in a longer official form.
    if (fold(name) !== fold(modern) && fold(name).includes(fold(modern))) name = modern;
    candidates.push({ ...p, name, rank });
  }

  candidates.sort((a, b) => a.rank - b.rank || lo(a) - lo(b));
  const chosen = [];
  for (const c of candidates) if (!chosen.some(k => overlaps(k, c))) chosen.push(c);
  chosen.sort((a, b) => lo(a) - lo(b));
  if (!chosen.length) return null;

  // Consecutive periods: a gap keeps the name before it; after the last period
  // the city has its English article name.
  const out = [];
  chosen.forEach((c, i) => {
    const next = chosen[i + 1];
    out.push([c.start, next ? next.start : c.end, c.name]);
  });
  const last = out[out.length - 1];
  if (last[1] !== null) out.push([last[1], null, modern]);
  // Merge neighbours with the same name.
  const merged = [];
  for (const e of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev[2] === e[2]) prev[1] = e[1]; else merged.push([...e]);
  }

  const plain = new Set([fold(marker.name), fold(titleName(marker.name)), fold(modern)]);
  if (merged.every(e => plain.has(fold(e[2])))) return null;
  return merged;
}

/** The name a city has in `year`, as the frontend picks it. */
export function nameInYear(marker, year) {
  const hit = (marker.names || []).find(([from, until]) => (from === null || from <= year) && (until === null || year < until));
  return hit ? hit[2] : marker.name;
}

async function liveCities() {
  const res = await fetch(`${API_URL}/v1/markers?types=c&year=-5000&end=2100&limit=50000`);
  if (!res.ok) throw new Error(`GET cities: ${res.status}`);
  return res.json();
}

async function fetchEntities(titles, log) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&sites=enwiki&props=claims|sitelinks&sitefilter=enwiki&titles=${encodeURIComponent(batch.join('|'))}`;
    let json;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, UA);
      if (res.ok) { json = await res.json(); break; }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
    if (!json) throw new Error(`Wikidata batch ${i} failed`);
    for (const e of Object.values(json.entities || {})) {
      const title = e.sitelinks?.enwiki?.title;
      if (title) out[title.replace(/ /g, '_')] = e;
    }
    if (i % 1000 === 0) log(`  Wikidata ${i}/${titles.length}`);
    await new Promise(r => setTimeout(r, 200));
  }
  return out;
}

async function fetchHistory(log) {
  const cities = await liveCities();
  log(`${cities.length} live cities`);
  const titles = cities.map(c => decodeURIComponent(c._id).replace(/ /g, '_'));
  const entities = await fetchEntities(titles, log);
  const result = {};
  for (const c of cities) {
    const entity = entities[decodeURIComponent(c._id).replace(/ /g, '_')];
    const names = entity && buildNameHistory(c, officialNames(entity));
    if (names) result[c._id] = { name: c.name, qid: entity.id, names };
  }
  return result;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function writeNames(plan, { log, distributionId }) {
  const { default: MarkerDynamo } = await import('../../server/models/dynamo/marker.dynamo.js');
  let n = 0;
  for (const [id, { before, after }] of Object.entries(plan)) {
    const doc = await MarkerDynamo.findById(id).exec();
    if (!doc) throw new Error(`${id} is gone; stopped after ${n} writes`);
    if (!same(doc.names, before)) throw new Error(`${id} changed since the plan; stopped after ${n} writes`);
    if (after === null) delete doc.names; else doc.names = after;
    await doc.save();
    n++;
    if (n % 200 === 0) log(`  ${n} markers written`);
  }
  log(`  ${n} markers written.`);
  return invalidateAfterDirectWrites(['markers'], { distributionId });
}

async function main(argv = process.argv.slice(2), log = console.log) {
  if (argv.includes('--fetch')) {
    const history = await fetchHistory(log);
    fs.writeFileSync(OUTPUT, `${JSON.stringify(history, null, 1)}\n`);
    log(`${Object.keys(history).length} cities with a name history -> ${OUTPUT}`);
    return true;
  }

  const revertAt = argv.indexOf('--revert');
  if (revertAt !== -1) {
    const dir = argv[revertAt + 1];
    const backup = JSON.parse(fs.readFileSync(path.join(dir, 'names.json'), 'utf8'));
    const plan = Object.fromEntries(Object.entries(backup).map(([id, { before, after }]) => [id, { before: after, after: before }]));
    return writeNames(plan, { log, distributionId: distributionIdFrom(argv) });
  }

  const history = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  const live = new Map((await liveCities()).map(c => [c._id, c]));
  const plan = {};
  for (const [id, { names }] of Object.entries(history)) {
    const city = live.get(id);
    if (!city) { log(`  skip ${id}: no longer a live city`); continue; }
    if (!same(city.names, names)) plan[id] = { before: city.names ?? null, after: names };
  }
  log(`${Object.keys(plan).length} of ${Object.keys(history).length} cities change.`);
  for (const id of ['Volgograd', 'Saint_Petersburg', 'Gdańsk', 'Chennai'].filter(i => plan[i])) {
    log(`  ${id}: ${plan[id].after.map(([a, b, n]) => `${a ?? ''}–${b ?? ''} ${n}`).join(', ')}`);
  }
  if (!argv.includes('--direct')) {
    log('\nDRY RUN: nothing written. --direct writes through the models (AWS credentials).');
    return true;
  }
  const backupDir = path.join(BACKUP_ROOT, `city-names-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'names.json'), JSON.stringify(plan));
  log(`Backup in ${backupDir}`);
  const ok = await writeNames(plan, { log, distributionId: distributionIdFrom(argv) });
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
