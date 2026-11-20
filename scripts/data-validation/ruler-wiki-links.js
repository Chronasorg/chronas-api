#!/usr/bin/env node

/**
 * Broken ruler Wikipedia links (follow-up to chronas-frontend #64 and
 * chronas-api #230).
 *
 * The ruler panel opens the English Wikipedia article named in
 * metadata.ruler[<id>][2]. A scan of all 1,777 rulers on 2026-11-20
 * (action=query&prop=pageprops&ppprop=disambiguation&redirects=1) found:
 *   - 102 links to disambiguation pages (KNG Kong, GEO Georgia, QIN Qin ...)
 *   - 29 links to missing articles (Commagane, Kokkand, Masillia ...)
 *   - 59 percent-encoded links (C%C3%A1diz, ...#History): the new frontend
 *     passes the link through encodeURIComponent, so these open a 404.
 *
 * FIXES picks the article for each polity from its name, the years it is on
 * the map and its provinces (GET /v1/areas/<year>, index 0). Every new target
 * existed and was not a disambiguation page on 2026-11-20. Rulers left alone
 * because two articles fit equally well or none fits: YAO MTR MAB KLC FEZ YAN
 * AYY BII bcICH YAK GEO KMT NSA OLD SAK (disambiguation) and BYL bcASR KKS HOD
 * IZU DKR HJA KLD MGR LNQ and the two Khmer-titled Cambodia mandalas (missing).
 *
 * Only index 2 (the wiki link) changes; names, colours and flags stay.
 *
 *   node scripts/data-validation/ruler-wiki-links.js
 *        # dry run: compares the live API with the expected old links
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/ruler-wiki-links.js --direct
 *        # writes through MetadataDynamo, backs up the ruler entries to
 *        # infra/backups/ruler-wiki-links-<timestamp>/, then invalidates /v1/metadata*
 *   AWS_PROFILE=chronas-prod node scripts/data-validation/ruler-wiki-links.js --revert <backup dir>
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
  // Disambiguation pages
  ZUL: ['Zulu', 'Zulu_Kingdom'], // Zulu: Zululand 1730–1880
  CAM: ['UPCA', 'Federal_Republic_of_Central_America'], // upca: name upca; UPCA page lists only this
  WAA: ['WA', 'Wa_people'], // Wa: Shan/Yunnan, 5–735
  TYO: ['TYO', 'Tio_Kingdom'], // Tyo: Tyo = Tio (Anziku)
  TRP: ['Tripoli', 'Ottoman_Tripolitania'], // Tripoli: Tripolitania 1505–1835
  TPA: ['Tupinambá', 'Tupinambá_people'], // Tupinamba: tribe, Grão-Pará
  TNT: ['Trent', 'Prince-Bishopric_of_Trent'], // Trent: Trent 1030–1270
  TDO: ['Tondo', 'Tondo_(historical_polity)'], // Tondo: Manila 905–1570
  SUE: ['Shule', 'Shule_Kingdom'], // Shule: Kashgar oasis kingdom
  SIB: ['Sibir', 'Khanate_of_Sibir'], // Sibir: Sibir 1470–1580
  SEN: ['Sena', 'Sena_dynasty'], // Sena: Bengal 1175–1230
  PIM: ['Pima', 'Akimel_Oʼodham'], // Pima: tribe (Pima)
  OSA: ['Osage', 'Osage_Nation'], // Osage: tribe
  OKA: ['Oka', 'Upper_Oka_Principalities'], // Oka: Tula/upper Oka 1100–1490
  NUP: ['Nupe', 'Bida_Emirate'], // Nupe: Nupe Kingdom redirects here
  NIZ: ['Deva', 'Deva_dynasty'], // Deva Bengal: Deva dynasty of Bengal 1235–1340
  MSI: ['Mossi', 'Mossi_Kingdoms'], // Mossi: Burkina Faso
  MAY: ['Maya', 'League_of_Mayapan'], // Maya: Yucatán 990–1440
  LOA: ['Loango', 'Kingdom_of_Loango'], // Loango: Loango 1355–1880
  LIN: ['Lindsey', 'Kingdom_of_Lindsey'], // Lindsey: Lincoln 455–780
  KUB: ['Kuba', 'Kuba_Kingdom'], // Kuba: Kasai
  KNG: ['Kong', 'Kong_Empire'], // Kong: Kong, Côte d'Ivoire
  KIN: ['Kindah', 'Kingdom_of_Kinda'], // Kindah: Najd 430–630
  KGU: ['Kongu', 'Kongu_Chera_dynasty'], // Kongu: Kongu 5–250
  KAN: ['Kano', 'Kingdom_of_Kano'], // Kano: Kano 1000–1805
  JNP: ['Jaunpur', 'Jaunpur_Sultanate'], // Jaunpur: Jaunpur 1395–1485
  HSA: ['Hansa', 'Hanseatic_League'], // Hansa: Lübeck
  HAU: ['Hausa', 'Hausa_Kingdoms'], // Hausa: Gobir, Kebbi, Zamfara
  HAI: ['Hainaut', 'County_of_Hainaut'], // Hainaut: Hainaut
  GHR: ['Garhwal', 'Garhwal_kingdom'], // Garhwal: Garhwal
  BST: ['Bastar', 'Bastar_State'], // Bastar: Bastar
  BRR: ['Berar', 'Berar_Sultanate'], // Berar: Berar 1495–1570
  BAR: ['Bar', 'Duchy_of_Bar'], // Bar: Barrois
  AYX: ['Ay', 'Ay_dynasty'], // Ay: Venad/Kochin 5–250
  bcODA: ['Odra', 'Odra_kingdom'], // Odra: Odisha
  LIS: ['Lissos', 'Lezhë'], // Lissos: Lissus (Illyria) redirects here
  CAI: ['Cai', 'Cai_(state)'], // Cai: Zhou state
  bcBOI: ['Boii', 'Boii_(Bohemia)'], // Boii: Plzeň (Bohemia)
  KAL: ['Kalinga', 'Kalinga_(region)'], // Kalinga: Odisha
  bcKYR: ['Cyrene', 'Cyrene,_Libya'], // Kyrene: Cyrene city-state
  QIN: ['Qin', 'Qin_(state)'], // Qin: to −205
  WEY: ['Wey', 'Wey_(state)'], // Wey: Zhou state
  YUE: ['Yue', 'Yue_(state)'], // Yue: Shaoxing/Ningbo
  ADA: ['Adal', 'Adal_Sultanate'], // Adal: Harar/Zeila 1420–1555
  ANE: ['Antes', 'Antes_people'], // Antes: Ukraine 5–560
  ANL: ['Angles', 'Angles_(tribe)'], // Angles: Jutland 5–735
  BAA: ['Bana', 'Bana_kingdom'], // Bana: 500–720
  BRB: ['Brabant', 'Duchy_of_Brabant'], // Brabant: Brabant 1185–1475
  BRU: ['Brunswick', 'Duchy_of_Brunswick-Lüneburg'], // Brunswick: Hannover/Lüneburg 1240–1690
  BSH: ['Bashkiria', 'Badzhgard'], // Bashkiria: Bashkiria historical area
  BTI: ['Semien', 'Kingdom_of_Simien'], // Semien: Semien (Beta Israel)
  CLA: ['Colla', 'Colla_Kingdom'], // Colla: Puno 1205–1445
  DOC: ['Doclea', 'Duklja'], // Doclea: Zeta 1050–1185
  DON: ['Dongye', 'Eastern_Ye'], // Dongye: Dongye = Eastern Ye
  DUL: ['Dulkadir', 'Beylik_of_Dulkadir'], // Dulkadir: Malatya 1340–1510
  GAL: ['Galicia', 'Kingdom_of_Galicia'], // Galicia: Galicia 1070
  GWE: ['Gwent', 'Kingdom_of_Gwent'], // Gwent: Glamorgan 385–1060
  JNN: ['Jenne', 'Djenné'], // Jenne: Djenné (city)
  KAF: ['Kaffa', 'Kingdom_of_Kaffa'], // Kaffa: Kefa
  KDR: ['Kediri', 'Kediri_kingdom'], // Kediri: Kediri 1050–1220
  KGR: ['Kangra', 'Kangra_State'], // Kangra: Kangra
  LIM: ['Limburg', 'Duchy_of_Limburg'], // Limburg: Limburg 1070–1285
  LND: ['Lunda', 'Lunda_Empire'], // Lunda: Lunda
  MAA: ['Mari', 'Mari_people'], // Mari: Volga Mari
  MEN: ['Menteşe', 'Menteshe'], // Mentese: Menteşe beylik
  MHX: ['Haixi', 'Haixi_Jurchens'], // Haixi: Haixi 1370–1615
  MNX: ['Mon', 'Mon_kingdoms'], // Mon: Mon, 5–150
  MSA: ['Malaya', 'Federation_of_Malaya'], // Malaya: 1960
  NIT: ['Nitta', 'Nitta_clan'], // Nitta: Kōzuke
  NTL: ['Natalia', 'Natalia_Republic'], // Natalia: 1840
  PAL: ['Palatinate', 'Electoral_Palatinate'], // Palatinate: Alzey/Worms/Upper Palatinate
  PRM: ['Perm', 'Great_Perm'], // Perm: Perm 755–1505
  QIA: ['Qiang', 'Qiang_(historical_people)'], // Qiang: Amdo
  RAM: ['Ramazan', 'Ramadanid_Emirate'], // Ramazan: Adana
  SAA: ['Saba', 'Sheba'], // Saba: Yemen
  SMI: ['Sami', 'Sámi_people'], // Sami: Lapland
  SUN: ['Sunda', 'Sunda_Kingdom'], // Sunda: West Java
  TRV: ['Turov', 'Principality_of_Turov'], // Turov: Turov
  UBH: ['Buha', 'Ha_people'], // Buha: Buha (Ujiji)
  VEP: ['VEP', 'Veps_people'], // Veps: Vologda/Olonets
  WKA: ['Wanka', 'Huanca'], // Wanka: Wanka = Huanca
  MAS: ['Madius', 'Madja-as'], // Madyas: Madyas = Madja-as, Panay
  PRY: ['Pereyaslavl', 'Principality_of_Pereyaslavl'], // Pereyaslavl: Pereyaslav
  _County_of_Anjou: ['Anjou', 'County_of_Anjou'], // County of Anjou: name
  _Duchy_of_Anjou: ['Anjou', 'Duchy_of_Anjou'], // Duchy of Anjou: name
  _tabal: ['Tabal', 'Tabal_(state)'], // tabal: Neo-Hittite, Adana
  _Republic_of_Afghanistan: ['Republic_of_Afghanistan', 'Republic_of_Afghanistan_(1973–1978)'], // Republic of Afghanistan: 1975
  // Missing articles
  VL2: ['Veleiati', 'Veleiates'], // Veleiati: Ligurian tribe
  ZAF: ['Zafunu', 'Diafounou'], // Zafunu: article: also spelled Zafunu
  MJE: ['Majeereen', 'Majeerteen_Sultanate'], // Majeereen: Puntland
  KAG: ['Kangabe', 'Kangaba'], // Kangabe: Kangaba (Ghana vassal)
  ILL: ['Illinewek', 'Illinois_Confederation'], // Illinewek: Illinois
  VT2: ['Veturia_(gens)', 'Veturia_gens'], // Veturii: title without ()
  CCH: ['Chandan_Kumar_Bhattacharya', 'Chahamanas_of_Shakambhari'], // Chauchan: Ajmer 955–1190 (link was a person)
  CMG: ['Commagane', 'Commagene'], // Commagane: typo
  ENA: ['Eneara', 'Ennarea'], // Eneara: Illubabor
  KOK: ['Kokkand', 'Khanate_of_Kokand'], // Kokkand: typo
  MSY: ['Mushashaiyyah', 'Musha\'sha\''], // Mushashaiyyah: Khuzestan 1445–1505
  SME: ['Samthske', 'Samtskhe-Saatabago'], // Samthske: Samtskhe 1445–1565
  DAA: ['Daamot', 'Dʿmt'], // Daamot: Dʿmt
  EP1: ['Epantieri', 'Epanterii'], // Epantieri: Ligurian tribe
  ES8: ['Essuvii', 'Esuvii'], // Essuvii: Gallic tribe
  EY8: ['Elysices', 'Elisyces'], // Elysices: Narbonne
  MSZ: ['Masillia', 'Massalia'], // Masillia: typo
  // Percent-encoded links (the frontend encodes them again: 404)
  PRO: ['County%20of%20Provence', 'County_of_Provence'],
  OUC: ['%C5%8Cuchi_clan', 'Ōuchi_clan'],
  LIB: ['History_of_Libya_(1969%E2%80%932011)#Great_Socialist_People\'s_Libyan_Arab_Jamahiriya_(1977%E2%80%932011)', 'History_of_Libya_(1969–2011)'],
  KIC: ['K%27iche%27_people', 'K\'iche\'_people'],
  DAI: ['%C4%90%E1%BA%A1i_Vi%E1%BB%87t', 'Đại_Việt'],
  ANN: ['%C4%90%E1%BA%A1i_Nam', 'Đại_Nam'],
  ALR: ['Taifa_of_Almer%C3%ADa', 'Taifa_of_Almería'],
  GDR: ['C%C3%A1diz', 'Cádiz'],
  CIN: ['J%C5%8Dmon_period', 'Jōmon_period'],
  JIN: ['Jin_dynasty_(265%E2%80%93420)', 'Jin_dynasty_(265–420)'],
  bcSUS: ['Susa#History', 'Susa'],
  CRD: ['Caliphate_of_C%C3%B3rdoba', 'Caliphate_of_Córdoba'],
  DEN: ['Taifa_of_D%C3%A9nia', 'Taifa_of_Dénia'],
  GOK: ['G%C3%B6kt%C3%BCrks', 'Göktürks'],
  TOK: ['T%C3%A2y_S%C6%A1n_dynasty', 'Tây_Sơn_dynasty'],
  _Kingdom_of_Navarre: ['Jim%C3%A9nez_dynasty', 'Jiménez_dynasty'],
  _kingdom_of_navarre: ['Kingdom_of_Navarre#Independent_Navarre_north_of_the_Pyrenees', 'Kingdom_of_Navarre'],
  _County_of_Alencon: ['Counts_and_dukes_of_Alen%C3%A7on', 'Counts_and_dukes_of_Alençon'],
  _Duchy_of_Alencon: ['Counts_and_dukes_of_Alen%C3%A7on', 'Counts_and_dukes_of_Alençon'],
  _County_of_Perigord: ['Count_of_P%C3%A9rigord', 'Count_of_Périgord'],
  _Viscounty_of_Labourd: ['Labourd#History', 'Labourd'],
  _Great_Jin: ['Jin_dynasty_(1115%E2%80%931234)', 'Jin_dynasty_(1115–1234)'],
  _Republic_of_China: ['Republic_of_China_(1912%E2%80%931949)', 'Republic_of_China_(1912–1949)'],
  '_Mongolian_People\'s_Republic': ['Mongolian_People%27s_Republic', 'Mongolian_People\'s_Republic'],
  '_People\'s_Republic_of_Kampuchea': ['People%27s_Republic_of_Kampuchea', 'People\'s_Republic_of_Kampuchea'],
  _Siam: ['Rattanakosin_Kingdom_(1782%E2%80%931932)', 'Rattanakosin_Kingdom_(1782–1932)'],
  _Sultanate_of_Morocco: ['Sultanate_of_Morocco_(1665%E2%80%931912)', 'Sultanate_of_Morocco_(1665–1912)'],
  _Curacao: ['Cura%C3%A7ao', 'Curaçao'],
  _Red_Finland: ['Finnish_Socialist_Workers%27_Republic', 'Finnish_Socialist_Workers\'_Republic'],
  '_Azerbaijan_People\'s_Republic': ['Azerbaijan_People%27s_Government', 'Azerbaijan_People\'s_Government'],
  '_Polish-Lithuanian-Commonwealth': ['Polish%E2%80%93Lithuanian_Commonwealth', 'Polish–Lithuanian_Commonwealth'],
  '_北条': ['H%C5%8Dj%C5%8D_clan', 'Hōjō_clan'],
  _Red_Paint_People: ['Red_Paint_People#:~:text=The%20Red%20Paint%20People%20are%20a%20Pre-Columbian%20culture,the%20bodies%20of%20the%20dead%20and%20grave%20goods.', 'Red_Paint_People'],
  _cobra: ['Ng%C6%B0u_H%E1%BB%91ng', 'Ngưu_Hống'],
  _Suvarnabhumi: ['Suvarnabhumi#Thailand', 'Suvarnabhumi'],
  '_Möng_Mao': ['M%C3%B6ng_Mao', 'Möng_Mao'],
  '_Hà_Tiên': ['Principality_of_H%C3%A0_Ti%C3%AAn', 'Principality_of_Hà_Tiên'],
  '_Trưng_sisters': ['Tr%C6%B0ng_sisters', 'Trưng_sisters'],
  _van_xuan: ['Early_L%C3%BD_dynasty', 'Early_Lý_dynasty'],
  '_hau_ly_nam_de\'s_mandala': ['H%E1%BA%ADu_L%C3%BD_Nam_%C4%90%E1%BA%BF', 'Hậu_Lý_Nam_Đế'],
  _tinh_hai_quan: ['T%C4%A9nh_H%E1%BA%A3i_qu%C3%A2n', 'Tĩnh_Hải_quân'],
  _dai_ngu: ['H%E1%BB%93_dynasty', 'Hồ_dynasty'],
  _Lam_Son: ['Lam_S%C6%A1n_uprising', 'Lam_Sơn_uprising'],
  _Wu_Zhou: ['Zhou_dynasty_(690%E2%80%93705)', 'Zhou_dynasty_(690–705)'],
  '_yan_(An_Lushan_rebellion)': ['Yan_(An%E2%80%93Shi)', 'Yan_(An–Shi)'],
  '_Qi_(Li_Maozhen)': ['Qi_(Li_Maozhen%27s_state)', 'Qi_(Li_Maozhen\'s_state)'],
  '_Mu\'ege': ['Mu%27ege', 'Mu\'ege'],
  '_Zhou-Wu_(Zhang_Shicheng)': ['Zhang_Shicheng#Regional_rule', 'Zhang_Shicheng'],
  '_Song_(Han_Lin\'er)': ['Han_Lin%27er', 'Han_Lin\'er'],
  _Dai_Co_Viet: ['%C4%90%E1%BA%A1i_C%E1%BB%93_Vi%E1%BB%87t', 'Đại_Cồ_Việt'],
  '_Dai_Viet_(Le_Dynasty)': ['L%C3%AA_dynasty', 'Lê_dynasty'],
  '_Dai_Viet_(Mac_Dynasty)': ['M%E1%BA%A1c_dynasty', 'Mạc_dynasty'],
  _Tay_Son_Rebellion: ['T%C3%A2y_S%C6%A1n_rebellion', 'Tây_Sơn_rebellion'],
  _Viet_Nam: ['Nguy%E1%BB%85n_dynasty', 'Nguyễn_dynasty'],
  _Kingdom_of_Siam: ['History_of_Thailand_(1932%E2%80%931973)', 'History_of_Thailand_(1932–1973)'],
  _Eyland: ['%C3%96land', 'Öland'],
  _Zealand: ['Zealand#History', 'Zealand']
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
  const backupDir = path.join(BACKUP_ROOT, `ruler-wiki-links-${new Date().toISOString().replace(/[:.]/g, '-')}`);
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
