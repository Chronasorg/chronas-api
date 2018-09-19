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
