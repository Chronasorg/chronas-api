# CHRONAS v1 to v2 migration

## NOTES

Resources:

- **areas**: ```node scripts/migrationAreas/index.js```
- **metadata**: http://chronas.org/en/app/datalayer/1 or export from local type=i
- ** empty out ruler metadata and run ```node scripts/eu4Migration/rulerBCMigration.js``` and run ```node scripts/eu4Migration/rulerMigration.js``` in that order
- **markers**: ```node scripts/migrationMarkers/index.js```
- **ruler linked rulers**: TODO: ```node scripts/migrationRulerEntities/index.js``` need to be added as markers and then linked to ruling entity
- **ADD religion and religionGeneral manually** **ADD LINKED (popes etc to subreligions)**
- **CLEANUP ALL UNUSED METADATA**
- **images**: ```node scripts/scrapReddit/scrapRedditImages.js```
- **video/audio/primarysourcetext**: todo: scrap from reddit etc
- **questions and answers**: todo scrap from reddit /r/history and /r/askhistorians (wiki!)
- **epics** war and battles (conflicts): scrap from wikidata ```node scripts/scrapWikidata/warEntitiesToEpics.js```
- **flags icons**: ```node scripts/wikicommonsImageFlagScrap``` for all dims (province/culture/religion/religionGeneral/ruler)
- **cities wikidata scrap**: todo: scrap from wikidata ```node scripts/scrapWikidata/cities.js```

## MISC

### mongimport mongexmport

*backup the whole database*

```mongodump --db chronas-api-staging -o dbBackupSep14```

___
*export/import all users*

```mongoexport -d chronas-api -c users -o users.json```
```mongoimport -d chronas-api-staging -c users --file users.json```

___

*export/import all metadata which are of subtype g (general)*

```mongoexport -d chronas-api -c metadatas -q '{type: "g"}' -o generalMetadata.json```
```mongoimport -d chronas-api-staging -c metadatas --file generalMetadata.json```

###Capital format

*example:*
```
capital: [
 [
   242, //start
   "BYZ"
 ],
 [
   431, //end
   false
 ],
 [
   1044, //start
   "TUR"
 ],
 [
   2050, //end
   false,
 ]
]

const currentCapitalRealm = (capital[capital.findIndex(el => el[0] > selectedYear) - 1] || [])[1] // can be undefined for invalid format or false if not a current capital
```

### Wiki API

#### get Wikidata Id by wiki article

https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=ARTICLE_NAME&format=json

---
see also scripts/WikidataExample.md

### Migration Log

Following provinces have been split up:
````
"Nukhtui": ["Nukhtui", "Istria"],
"Nanticoke": ["Nanticoke, "Balears"],
"Lappland": ["Lappland", "Lappi"],
````


SELECT ?s ?born ?death ?desc ?picture ?rul ?bornPlace ?coo
WHERE
{
  ?s wdt:P31 wd:Q5;
        wdt:P18 ?picture;
        wdt:P27 ?rul;
        wdt:P19 ?bornPlace;
     wdt:P569 ?born .
  optional {?s wdt:P570 ?death.
           ?s wdt:P495 ?coo.}
  FILTER (?born > "1421-01-01T00:00:00Z"^^xsd:dateTime && ?born <= "1521-01-01T00:00:00Z"^^xsd:dateTime) .
    ?s rdfs:label ?desc FILTER(lang(?desc)="en").
  ?s wikibase:sitelinks ?sitelinks.
  service wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}  order by desc(?sitelinks) limit 1500

```
SELECT%20%3Fs%20%3Fborn%20%3Fdeath%20%3Fdesc%20%3Fpicture%20%3Frul%20%3FbornPlace%20%3Fcoo%0AWHERE%0A%7B%0A%20%20%3Fs%20wdt%3AP31%20wd%3AQ5%3B%0A%20%20%20%20%20%20%20%20wdt%3AP18%20%3Fpicture%3B%0A%20%20%20%20%20%20%20%20wdt%3AP27%20%3Frul%3B%0A%20%20%20%20%20%20%20%20wdt%3AP19%20%3FbornPlace%3B%0A%20%20%20%20%20wdt%3AP569%20%3Fborn%20.%0A%20%20optional%20%7B%3Fs%20wdt%3AP570%20%3Fdeath.%0A%20%20%20%20%20%20%20%20%20%20%20%3Fs%20wdt%3AP495%20%3Fcoo.%7D%0A%20%20FILTER%20%28%3Fborn%20%3E%20%221421-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fborn%20%3C%3D%20%221521-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%20.%0A%20%20%20%20%3Fs%20rdfs%3Alabel%20%3Fdesc%20FILTER%28lang%28%3Fdesc%29%3D%22en%22%29.%0A%20%20%3Fs%20wikibase%3Asitelinks%20%3Fsitelinks.%0A%20%20service%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%7D%20%20order%20by%20desc%28%3Fsitelinks%29%20limit%201500
```

