/**
 * Wikidata ID to Chronas Value Mappings
 *
 * Only mapped values can be auto-corrected. Unmapped values are flagged for manual review.
 * This is the critical safety layer preventing unwanted data changes.
 */

// Wikidata religion entity → Chronas religion key
export const religionFromWikidata = {
  'Q9592':   'orthodox',        // Eastern Orthodox Church
  'Q9585':   'catholic',        // Catholic Church
  'Q23540':  'catholic',        // Catholicism
  'Q748':    'sunni',           // Sunni Islam
  'Q9603':   'chalcedonism',    // Chalcedonian Christianity (valid pre-1054)
  'Q432':    'sunni',           // Islam (default to sunni when unspecified)
  'Q812767': 'shiite',          // Shia Islam
  'Q9089':   'hinduism',        // Hinduism
  'Q748':    'sunni',           // Sunni Islam
  'Q9268':   'buddhism',        // Buddhism
  'Q9159':   'protestant',      // Protestantism
  'Q178169': 'reformed',        // Calvinism
  'Q33203':  'coptic',          // Coptic Orthodox
  'Q192700': 'nestorian',       // Nestorianism
  'Q131144': 'arianism',        // Arianism
  'Q42927':  'ibadi',           // Ibadi Islam
  'Q9232':   'jewish',          // Judaism
  'Q9585':   'catholic',        // Catholic Church
  'Q170':    'secularism',      // Atheism/Secularism
  'Q47280':  'zoroastrianism',  // Zoroastrianism
  'Q131036': 'shinto',          // Shinto
  'Q28907':  'confucianism',    // Confucianism
  'Q170168': 'tengri',          // Tengrism
  'Q483654': 'shamanism',       // Shamanism
  'Q748396': 'animism',         // Animism
  'Q9268':   'buddhism',        // Buddhism
  'Q9579':   'sikhism',         // Sikhism
  'Q131149': 'jainism',         // Jainism
  'Q212117': 'manichaeism',     // Manichaeism
  'Q46857':  'druidism',        // Celtic polytheism
  'Q193849': 'romuva',          // Romuva (Baltic paganism)
  'Q188712': 'slavic'          // Slavic Native Faith
};

// Chronas religion key → Wikidata entity ID (reverse lookup)
export const religionToWikidata = Object.fromEntries(
  Object.entries(religionFromWikidata).map(([k, v]) => [v, k])
);

// Wikidata culture/ethnicity entity → Chronas culture key
export const cultureFromWikidata = {
  'Q190168': 'moluccan',        // Moluccan people
  'Q33946':  'papuan',          // Papuan languages
  'Q34069':  'javanese',        // Javanese people
  'Q826806': 'polynesian',      // Polynesian culture
  'Q33199':  'austronesian',    // Austronesian languages
  'Q485895': 'malay',           // Malay people
  'Q49085':  'sumatran'        // Batak people (Sumatra)
};

// Wikidata-confirmed Orthodox ruler codes (P3075 official religion on historical polities)
// Source: Kievan Rus' Q1108445, Novgorod Republic Q151536, Principality of Smolensk Q1483495,
// Grand Principality of Vladimir Q83546, Principality of Tver Q163268,
// Grand Principality of Moscow Q170770, Tsardom of Russia Q186096,
// Russian Empire Q34266, Byzantine Empire Q12544, Kingdom of Serbia Q241748,
// Kingdom of Romania Q203493, Principality of Wallachia Q389004,
// Principality of Moldavia Q10957559, Cossack Hetmanate Q212439, etc.
export const orthodoxRulerCodes = new Set([
  'BUL', 'BYZ', 'CHR', 'DUK', 'EPI', 'GAL', 'GEO', 'GRE', 'HET', 'IME',
  'KAR', 'KIE', 'KRU', 'MDA', 'MNT', 'MOL', 'MOS', 'MSK', 'MUR', 'NOV',
  'PRY', 'RMN', 'RUS', 'RYA', 'SER', 'SMO', 'SRB', 'TVE', 'VLA', 'VOL',
  'WAL', 'ZAP', '_First_Bulgarian_EmpirE', '_Russian_Empire'
]);

// Chronas provinces confirmed as belonging to Orthodox polities via Wikidata P3075.
// Generated from production scan: provinces ruled by orthodoxRulerCodes that have wrong religion.
export const easternOrthodoxProvinces = {
  // Kievan Rus core
  'Kiev': 'Q1899', 'Volhynia': 'Q164079', 'Zhytomyr': 'Q25402',
  'Podolia': 'Q203858', 'Bratslav': 'Q616460', 'Pereyaslav': 'Q2095648',
  'Poltava': 'Q160748', 'Chernigov': 'Q5765', 'Novgorod': 'Q1889',
  'Pskov': 'Q3926', 'Tikhvin': 'Q193866', 'Minsk': 'Q2280',
  'Polotsk': 'Q156268', 'Ruthenia': 'Q170895',
  // Russian principalities (Wikidata: Grand Principality of Vladimir Q83546, etc.)
  'Moskva': 'Q649', 'Vladimir': 'Q909', 'Suzdal': 'Q193879',
  'Tver': 'Q22917', 'Ryazan': 'Q908', 'Smolensk': 'Q2173',
  'Yaroslavl': 'Q910', 'Kostroma': 'Q5765', 'Rzhev': 'Q179810',
  'Kaluga': 'Q5765', 'Tula': 'Q2451', 'Orel': 'Q7832',
  'Bryansk': 'Q2917', 'Kursk': 'Q3930', 'Novgorod-Seversky': 'Q2095648',
  'Torzhok': 'Q194149', 'Galich': 'Q175055', 'Vologda': 'Q894',
  'Ustyug': 'Q193882', 'Kholm': 'Q193882', 'Kholmogory': 'Q193882',
  'Archangelsk': 'Q193882', 'Olonets': 'Q193882', 'Kargopol': 'Q193882',
  'Nijni-Novgorod': 'Q891', 'Pensa': 'Q5765', 'Kasimov': 'Q193882',
  'Alatyr': 'Q193882', 'Viatka': 'Q193882',
  // Novgorod/Pskov territories
  'Neva': 'Q193882', 'Ostrov': 'Q193882', 'Ingermanland': 'Q193882',
  'Kexholm': 'Q193882', 'Karelia': 'Q193882', 'Kola': 'Q193882',
  // Russian expansion (Wikidata: Russian Empire Q34266 P3075 = Eastern Orthodoxy)
  'Kazan': 'Q193882', 'Astrakhan': 'Q193882', 'Sibir': 'Q193882',
  'Tomsk': 'Q193882', 'Yeniseysk': 'Q193882', 'Irkutsk': 'Q193882',
  'Yakutsk': 'Q193882', 'Okhotsk': 'Q193882', 'Kamchatka': 'Q193882',
  'Barnaul': 'Q193882', 'Kuznetsk': 'Q193882', 'Mangazea': 'Q193882',
  'Berezov': 'Q193882', 'Obdorsk': 'Q193882', 'Surgut': 'Q193882',
  'Tyumen': 'Q193882', 'Nerchinsky': 'Q193882', 'Bratsk': 'Q193882',
  'Ilimsk': 'Q193882', 'Barguzinsky': 'Q193882', 'Narym': 'Q193882',
  'Ust-Kut': 'Q193882', 'Verkhoyansk': 'Q193882', 'Nizhe-Kolymsk': 'Q193882',
  'Anadyrsk': 'Q193882', 'Gizhiga': 'Q193882', 'Koryak': 'Q193882',
  'Penchisky': 'Q193882', 'Tauisk': 'Q193882', 'Nukhtui': 'Q193882',
  'Butalsk': 'Q193882', 'Udinsky': 'Q193882', 'Verkne-Angarsky': 'Q193882',
  'Chara': 'Q193882', 'Urkan': 'Q193882', 'Uchurskoye': 'Q193882',
  'Verkohzehkoye': 'Q193882', 'Jugjur': 'Q193882', 'Suntar Khayat': 'Q193882',
  'Podzhiversk': 'Q193882', 'Kamnuskoye': 'Q193882', 'Seganka': 'Q193882',
  'Yarmanka': 'Q193882', 'Ingil': 'Q193882', 'Kharya': 'Q193882',
  'Baykha': 'Q193882', 'Chulym': 'Q193882', 'Chuna': 'Q193882',
  'Etkara': 'Q193882', 'Kan': 'Q193882', 'Sayan': 'Q193882',
  'Kachinsk': 'Q193882', 'Pegaya Orda': 'Q193882', 'Vah': 'Q193882',
  'Yugan': 'Q193882', 'Agan': 'Q193882', 'Koda': 'Q193882',
  'Veda-Suvar': 'Q193882', 'Kanadey': 'Q193882', 'Kulunda': 'Q193882',
  'Uchamin': 'Q193882', 'Mansur': 'Q193882', 'Kagyrgyn': 'Q193882',
  'Middle Urals': 'Q193882', 'North Urals': 'Q193882',
  'Samara': 'Q193882', 'Saratow': 'Q193882', 'Tsaritsyn': 'Q193882',
  'Simbirsk': 'Q193882', 'Tambow': 'Q193882', 'Voronezh': 'Q193882',
  'Lipetsk': 'Q193882', 'Borisoglebsk': 'Q193882', 'Kharkov': 'Q193882',
  'Cherkassk': 'Q193882', 'Sarai': 'Q193882', 'Ukek': 'Q193882',
  'Khazaria': 'Q193882', 'Nogay': 'Q193882', 'Buzuluk': 'Q193882',
  'Yaik': 'Q193882', 'Perm': 'Q193882', 'Solikamsk': 'Q193882',
  'Kudymkar': 'Q193882', 'Ust-Sysolsk': 'Q193882', 'Nenets': 'Q193882',
  'Udmurtia': 'Q193882', 'Bashkortostan': 'Q193882', 'Iglino': 'Q193882',
  'Agyidel': 'Q193882', 'Chelyaba': 'Q193882', 'Kurgan': 'Q193882',
  'Ar-Chally': 'Q193882', 'Ostyaki': 'Q193882',
  // Russian Empire western provinces
  'Vitebsk': 'Q193882', 'Mogilyov': 'Q193882', 'Brest': 'Q193882',
  'Grodno': 'Q193882', 'Polesia': 'Q193882', 'Turov': 'Q193882',
  'Narva': 'Q193882', 'Lida': 'Q193882', 'Troki': 'Q193882',
  'Lithuania': 'Q193882', 'Samogitia': 'Q193882', 'Podlasia': 'Q193882',
  'Cherkasy': 'Q193882', 'Yedisan': 'Q193882', 'Zaporozhia': 'Q193882',
  'Mantrega': 'Q193882', 'Majar': 'Q193882', 'Azaraba': 'Q193882',
  // Russian America (Wikidata: Q910495 P3075 = Eastern Orthodoxy)
  'Sitka': 'Q910495', 'Kodiak': 'Q910495', 'Kenai': 'Q910495',
  'Yakutat': 'Q910495', 'Eyak': 'Q910495',
  // Balkans
  'Bulgaria': 'Q219', 'Larissa': 'Q8683', 'Kozani': 'Q206971',
  'Vidin': 'Q193756', 'Plovdiv': 'Q122508', 'Nis': 'Q189793',
  'Burgas': 'Q193254', 'Torontal': 'Q194235', 'Banat': 'Q193741',
  'Transylvania': 'Q193706', 'Macedonia': 'Q193770',
  'Serbia': 'Q403', 'Bosnia': 'Q225', 'Dobruja': 'Q179714',
  'Raska': 'Q193882', 'Kosovo': 'Q193882', 'Albania': 'Q193882',
  'Zeta': 'Q193882', 'Silistria': 'Q193882',
  // Byzantine Anatolia / Greece
  'Thrace': 'Q81161', 'Hamid': 'Q4504060',
  'Achaea': 'Q193882', 'Athens': 'Q193882', 'Morea': 'Q193882',
  'Salonica': 'Q193882', 'Janina': 'Q193882', 'Komotini': 'Q193882',
  'Lesbos': 'Q193882', 'Crete': 'Q193882', 'Cyprus': 'Q193882',
  'Edirne': 'Q193882', 'Biga': 'Q193882', 'Bolu': 'Q193882',
  'Saruhan': 'Q193882', 'Smyrna': 'Q193882', 'Sinope': 'Q193882',
  'Kastamon': 'Q193882', 'Canik': 'Q193882', 'Tekke': 'Q193882',
  'Antalya': 'Q193882', 'Anatolia': 'Q193882', 'Kaffa': 'Q193882',
  'Theodoro': 'Q193882',
  // Romania (Wikidata: Kingdom of Romania Q203493 P3075 = Eastern Orthodoxy)
  'Wallachia': 'Q389004', 'Oltenia': 'Q193882', 'Suceava': 'Q193882',
  'Hunyad': 'Q193882', 'Budjak': 'Q193882',
  // Caucasus
  'Georgia': 'Q230', 'Kartli': 'Q188717', 'Imereti': 'Q211099',
  'Kakheti': 'Q193882', 'Guria': 'Q193882', 'Abkhazia': 'Q193882',
  // Polish territories under Russian rule
  'Kalisz': 'Q193882', 'Leczyca': 'Q193882', 'Lodz': 'Q193882',
  'Mazovia': 'Q193882', 'Plock': 'Q193882', 'Wizna': 'Q193882'
};

// Western territories — should stay chalcedonism pre-1054, then catholic post-1054
// These are NOT corrected by the orthodox fix
export const westernChalcedonismProvinces = [
  'London', 'Yorkshire', 'Schwyz', 'Gelre', 'Utrecht', 'Zeeland', 'Noord',
  'Luxemburg', 'Liège', 'Brabant', 'Hainault', 'Vlaanderen', 'Picardie',
  'Artois', 'Calais'
];

// Issue #11: Austronesian culture corrections
export const cultureCorrections = {
  'Flores':             'moluccan',
  'Timor':              'moluccan',
  'Sumba':              'moluccan',
  'Aru':                'moluccan',
  'Eastern Sumbawa':    'moluccan',
  'Halmahera':          'papuan',
  'Rabaul':             'polynesian',
  'Lombok':             'javanese',
  'Western Sumbawa':    'javanese'
};
