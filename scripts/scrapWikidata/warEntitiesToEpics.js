const fetch = require('node-fetch')

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

function getYear(dateString) {
  if (!dateString) return undefined
  return parseInt(dateString.substring(0, dateString.substr(1).indexOf("-") + 1))
}

const rulList = []
let rulerObject = {}
let originalMeta

fetch("http://localhost:4040/v1/metadata/ruler")
  .then(response => response.json())
  .then((resRulList) => {
    rulerObject = resRulList.data
    fetch("https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+?item+WHERE+{++?item+wdt:P31+?sub0+.++?sub0+(wdt:P279)*+wd:Q198+.++?item+wdt:P580+[]+.}")
      .then(response => response.json())
      .then((resQids) => {
        const rulList = resQids.results.bindings.map((qEl) => {
          const url = qEl.item.value
          return url.substr(url.lastIndexOf("/") + 1)
        })

        rulList.reduce(
            (p, x) => p.then((_) => {
              return postRulPlus(x)
            }),
            Promise.resolve()
          )
      })
    })


postRulPlus = (qElId) => new Promise((resolve, reject) => {
  return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + qElId + "&languages=en&props=sitelinks|claims")
    .then(response => response.json())
    .then((resQel) => {
      const qEl = resQel.entities[qElId]
      const qElClaims = qEl.claims

      const enWiki = ((qEl.sitelinks || {}).enwiki || {}).title
      if (!enWiki) resolve()

      const p625 = ((((qElClaims.P625 || [])[0] || {}).mainsnak || {}).datavalue || {}).value

      const pId_instanceOf = (((((qElClaims.P31 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id
      const pId_location = (((((qElClaims.P276 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id
      const pId_locationCoordinates = p625 ? [p625.latitude, p625.longitude] : undefined
      const pId_start = getYear((((((qElClaims.P580 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).time) || getYear((((((qElClaims.P585 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).time)
      const pId_end = getYear((((((qElClaims.P582 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).time)
      const pId_partOf = (((((qElClaims.P361 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id
      const pId_hasPart_arr = (qElClaims.P527 || []).map((el) => {
        return (((el.mainsnak || {}).datavalue || {}).value || {}).id
      })
      const pId_participant_arr = (qElClaims.P710 || []).map((el) => {
        return (((el.mainsnak || {}).datavalue || {}).value || {}).id
      })



      const epicObjectToPost = {
        "_id": "e_" + enWiki.replace(/ /g, "_"),
        "data": {
          "title": enWiki,
          "wiki": enWiki.replace(/ /g, "_"),
          "start": pId_start,
          "end": pId_end,
          "participants": [
          ],
          "content": [
          ]
        },
        "wiki": enWiki.replace(/ /g, "_"),
        "subtype": "",
        "year": pId_start,
        "score": 0,
        "linked": [
        ],
        "type": "e"
      }

      if (pId_start) epicObjectToPost.year = pId_start


      const areaPromises = []
      if (pId_instanceOf) areaPromises.push(
        new Promise((resolve, reject) => {

          return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + pId_instanceOf + "&format=json")
            .then(response => response.json())
            .then((resValue) => {
              epicObjectToPost.subtype = (((resValue.entities[pId_instanceOf] || {}).labels || {}).en || {}).value
              if (epicObjectToPost.subtype !== "battle" && epicObjectToPost.subtype !== "siege" && epicObjectToPost.subtype !== "war") epicObjectToPost.subtype = "war"
              resolve()
            })
            .catch((err) => {
              resolve()
            })

        })
      )

      if (pId_partOf) areaPromises.push(
        new Promise((resolve, reject) => {
          return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + pId_partOf + "&format=json&props=sitelinks|claims")
            .then(response => response.json())
            .then((resValue) => {
              epicObjectToPost.data.partOf = ((resValue.entities[pId_partOf].sitelinks || {}).enwiki || {}).title
              resolve()
            })
            .catch((err) => {
              resolve()
            })
        })
      )

      if (pId_locationCoordinates) {
        epicObjectToPost.data.location = pId_locationCoordinates
      } else if (pId_location) {
        areaPromises.push(
          new Promise((resolve, reject) => {
            fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + pId_location + "&format=json")
              .then(response => response.json())
              .then((resValue) => {
                epicObjectToPost.data.location = (((resValue.entities[pId_location] || {}).labels || {}).en || {}).value
                resolve()
              })
              .catch((err) => {
                resolve()
              })
        }))
      }

      if (pId_participant_arr) pId_participant_arr.forEach( pQid => areaPromises.push(
        new Promise((resolve, reject) => {
          return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + pQid + "&languages=en&props=sitelinks|claims")
            .then(response => response.json())
            .then((resValue) => {
              const participantWiki = (((resValue.entities[pQid] || {}).sitelinks || {}).enwiki || {}).title
              let participant = participantWiki
              Object.keys(rulerObject).forEach((rulerKey) => {
                if (
                  Object.values(rulerObject[rulerKey])[0] !== '' &&
                  Object.values(rulerObject[rulerKey])[0] !== ' ' &&
                  Object.values(rulerObject[rulerKey])[2] !== ' ' &&
                  Object.values(rulerObject[rulerKey])[2] !== '' && ((participantWiki.indexOf(Object.values(rulerObject[rulerKey])[0]) > -1) || (participantWiki.indexOf(Object.values(rulerObject[rulerKey])[2]) > -1))) {
                  participant = rulerKey
                }
              })
              epicObjectToPost.data.participants.push([participant])
              resolve()
            })
            .catch((err) => {
              resolve()
            })
        })
      ))

      if (pId_hasPart_arr) pId_hasPart_arr.forEach( pQid => areaPromises.push(
        new Promise((resolve, reject) => {
          return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + pQid + "&languages=en&props=sitelinks|claims")
            .then(response => response.json())
            .then((resValue) => {
              const enwiki = (((resValue.entities[pQid] || {}).sitelinks || {}).enwiki || {}).title
              const qqElClaims = (resValue.entities[pQid] || {}).claims
              const ppId_instanceOf = (((((qqElClaims.P31 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id

              fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + ppId_instanceOf + "&format=json")
                .then(response => response.json())
                .then((resValueType) => {
                  let contentSubtype = (((resValueType.entities[ppId_instanceOf] || {}).labels || {}).en || {}).value
                  epicObjectToPost.linked.push(enwiki.replace(/ /g, "_"))
                  epicObjectToPost.data.content.push({
                    "wiki": enwiki.replace(/ /g, "_"),
                    "type": contentSubtype,
                    "date": getYear((((((qqElClaims.P580 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).time) || getYear((((((qqElClaims.P585 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).time)
                  })
                  resolve()
                })
                .catch((err) => {
                  resolve()
                })
            })
            .catch((err) => {
              resolve()
            })
        })
      ))

      // const areaPromises = Object.keys(fieldObject).map(area => new Promise((resolve, reject) => { }))
      Promise.all(areaPromises)
        .then(() => {
          // POST here
          fetch(`${properties.chronasApiHost}/metadata`, {
            method: 'POST',
            body: JSON.stringify(epicObjectToPost),
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
            },
          })
            .then((response) => {
              if (response.status < 200 || response.status >= 300) {
                console.log('metadata failed', response.statusText)
                resolve()
              } else {
                console.log('metadata added')
                resolve()
              }
            })
            .catch((err) => {
              resolve()
            })

          resolve()
        })
        .catch((err) => {
          resolve()
        })
    })
    .catch((err) => {
      resolve()
    })
})


goOn = (rulAcc, imageArray, resolve, reject) => {
  for (let img of imageArray) {
    const imgLower = img.toLowerCase()
    if (imgLower.indexOf(".svg") > -1 || imgLower.indexOf(".jpg") > -1 || imgLower.indexOf(".jpeg") > -1 || imgLower.indexOf(".png") > -1 ) {
      // TODO: get right resolution
      fetch("https://commons.wikimedia.org/w/api.php?action=query&titles=" + img + "&prop=imageinfo&&iiprop=url&iiurlwidth=100&format=json")
        .then(response => response.json())
        .then((rulerMetadata) => {
          let thumbUrl = Object.values(rulerMetadata.query.pages)[0].imageinfo[0].thumburl
          const startUrl = thumbUrl.indexOf("commons/thumb/") + "commons/thumb/".length
          const endUrl = thumbUrl.substr(52).lastIndexOf("/") + startUrl -1
          thumbUrl = thumbUrl.substring(startUrl, endUrl)

          originalMeta.data[rulAcc][3] = thumbUrl
          console.debug(rulAcc + " -> " + originalMeta.data[rulAcc][3])
          resolve()
        })
        .catch((err) => {
          resolve()
        })
      break
    }
  }
}

// example output
/*
{
  "_id": "e_Byzantine–Sasanian_War_of_602–628",
  "data": {
    "title": "Byzantine–Sassanid War of 602–28",
    "wiki": "Byzantine–Sasanian_War_of_602–628",
    "start": "602",
    "end": "628",
    "participants": [
    [
      "SAS",
      "AVR"
    ],
    [
      "BYZ",
      "WGO"
    ]
  ],
    "content": [
    {
      "wiki": "Jewish_revolt_against_Heraclius",
      "type": "conflict"
    },
    {
      "wiki": "Battle_of_Antioch_(613)",
      "type": "battle",
      "date": "613"
    },
    {
      "wiki": "Sasanian conquest of Jerusalem",
      "type": "siege",
      "date": "614"
    },
    {
      "wiki": "Shahin's invasion of Asia Minor (615)",
      "type": "conflict",
      "date": "615"
    },
    {
      "wiki": "Heraclius' campaign of 622",
      "type": "campaign",
      "date": "622"
    },
    {
      "wiki": "Siege of Constantinople (626)",
      "type": "siege",
      "date": "June 626"
    },
    {
      "wiki": "Battle of Nineveh",
      "type": "battle",
      "date": "12 December 627"
    }
  ]
},
  "wiki": "Byzantine–Sasanian_War_of_602–628",
  "subtype": "war",
  "year": 602,
  "score": 0,
  "linked": [
  "Jewish_revolt_against_Heraclius",
  "Battle_of_Antioch_(613)",
  "Sasanian conquest of Jerusalem",
  "Shahin's invasion of Asia Minor (615)",
  "Heraclius' campaign of 622",
  "Siege of Constantinople (626)",
  "Battle of Nineveh"
],
  "type": "e"
}



call
https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+%3Fitem+WHERE+%7B%0A++%3Fitem+wdt:P31+%3Fsub0+.%0A++%3Fsub0+(wdt:P279)*+wd:Q198+.%0A++%3Fitem+wdt:P580+%5B%5D+.%0A%7D
to get list of wars and subclasses,

then iterate over them creating the above object + an optional partOf field (for battles, sieges linking to wars for example)

iteration url = https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q5778798&languages=en&props=sitelinks|claims

part of (P361)
instance of (P31)
has part (P527)

*/
