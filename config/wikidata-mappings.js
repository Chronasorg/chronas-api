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
  'Q188712': 'slavic',          // Slavic Native Faith
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
  'Q49085':  'sumatran',        // Batak people (Sumatra)
};

// Chronas province → Wikidata entity for religion lookups
// Eastern territories that should be orthodox post-1054
export const easternOrthodoxProvinces = {
  // Kievan Rus
  'Kiev':       'Q1899',
  'Volhynia':   'Q164079',
  'Zhytomyr':   'Q25402',
  'Podolia':    'Q203858',
  'Bratslav':   'Q616460',
  'Novgorod':   'Q1889',
  'Pskov':      'Q3926',
  'Tikhvin':    'Q193866',
  'Pereyaslav': 'Q2095648',
  'Poltava':    'Q160748',
  'Minsk':      'Q2280',
  'Polotsk':    'Q156268',
  'Ruthenia':   'Q170895',
  'Chernigov':  'Q5765',
  // Balkans
  'Bulgaria':   'Q219',
  'Larissa':    'Q8683',
  'Kozani':     'Q206971',
  'Vidin':      'Q193756',
  'Plovdiv':    'Q122508',
  'Nis':        'Q189793',
  'Burgas':     'Q193254',
  'Torontal':   'Q194235',
  'Banat':      'Q193741',
  'Transylvania': 'Q193706',
  'Macedonia':  'Q193770',
  'Serbia':     'Q403',
  'Bosnia':     'Q225',
  'Dobruja':    'Q179714',
  // Byzantine
  'Thrace':     'Q81161',
  'Hamid':      'Q4504060',
  // Caucasus
  'Georgia':    'Q230',
  'Kartli':     'Q188717',
  'Imereti':    'Q211099',
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
  'Western Sumbawa':    'javanese',
};
