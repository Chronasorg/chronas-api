const fetch = require('node-fetch')
const utils = require('../utils')

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

function getYear(dateString) {
  if (!dateString) return undefined
  return parseInt(dateString.substring(0, dateString.substr(1).indexOf("-") + 1))
}

const rulList = []
const alreadyProcessed=[]
let rulerObject = {}
let originalMeta

fetch("http://localhost:4040/v1/metadata/ruler")
  .then(response => response.json())
  .then((resRulList) => {
    rulerObject = resRulList.data
    fetch("https://query.wikidata.org/sparql?format=json&query=%23added%20before%202016-10%0ASELECT%20distinct%20%3Fsubj%20%3Fdate%20%3Fdate0%20%3Fdate2%20%3Fdate3%20%3Fdate4%20%3FwikisourceSitelink%20%3Fauthor%20%3Fcoo%23%20%3FsubjLabel%20%20%20%3FarticleAuthorEn%20%3Fenwiki%20%3Fcoo%20%3FarticleCOOEn%20%3Fimage%20%3FarticleEn%0AWHERE%0A%7B%0A%20%20%20%3Fsubj%20wdt%3AP18%20%3Fimage.%0A%20%20%7B%3Fsubj%20wdt%3AP31%2Fwdt%3AP279%2a%20wd%3AQ223393%20%7D%20UNION%20%7B%3Fsubj%20wdt%3AP31%2Fwdt%3AP279%2a%20wd%3AQ571%20%7D%20UNION%20%7B%3Fsubj%20wdt%3AP31%2Fwdt%3AP279%2a%20wd%3AQ7725634%7D%20UNION%20%7B%3Fsubj%20wdt%3AP31%2Fwdt%3AP279%2a%20wd%3AQ133492%7D.%0A%20%20%20%7B%3Fsubj%20wdt%3AP1319%20%3Fdate0%20FILTER%20%28%3Fdate0%20%3E%20%221750-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fdate0%20%3C%20%221950-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%7D%20UNION%20%7B%3Fsubj%20wdt%3AP577%20%3Fdate%20FILTER%20%28%3Fdate%20%3E%20%221750-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fdate%20%3C%20%221950-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%7D%20UNION%20%7B%3Fsubj%20wdt%3AP571%20%3Fdate2%20FILTER%20%28%3Fdate2%20%3E%20%221750-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fdate2%20%3C%20%221950-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%7D%20UNION%20%7B%3Fsubj%20wdt%3AP585%20%3Fdate3%20FILTER%20%28%3Fdate3%20%3E%20%221750-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fdate3%20%3C%20%221950-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%7D%20UNION%20%7B%3Fsubj%20wdt%3AP580%20%3Fdate4%20FILTER%20%28%3Fdate4%20%3E%20%221750-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fdate4%20%3C%20%221950-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%7D.%0A%20%20OPTIONAL%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%3Fsubj%20wdt%3AP50%20%3Fauthor.%0A%20%20%20%20%3Fsubj%20wdt%3AP495%20%3Fcoo.%0A%20%20%23%20%20%3FarticleAuthorEn%20schema%3Aabout%20%3Fauthor.%0A%20%23%20%20%20%3FarticleAuthorEn%20schema%3AisPartOf%20%3Chttps%3A%2F%2Fen.wikipedia.org%2F%3E.%0A%20%23%20%20%3FarticleCOOEn%20schema%3Aabout%20%3Fcoo.%0A%23%20%20%20%20%3FarticleCOOEn%20schema%3AisPartOf%20%3Chttps%3A%2F%2Fen.wikipedia.org%2F%3E.%0A%20%20%23%20%20%3FarticleEn%20schema%3Aabout%20%3Fsubj.%0A%20%20%20%20%23%20%20%3FarticleEn%20schema%3AisPartOf%20%3Chttps%3A%2F%2Fen.wikisource.org%2F%3E.%0A%20%20%20%20%20%20%20%20%20%20%20%20%3FwikisourceSitelink%20schema%3AisPartOf%20%3Chttps%3A%2F%2Fen.wikisource.org%2F%3E%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20schema%3Aabout%20%3Fsubj.%7D%0A%20%20%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%2Cen%22%20%7D%20.%0A%7D%0AORDER%20BY%20%3Fdate")
      .then(response => response.json())
      .then((resQids) => {
        const rulList = resQids.results.bindings.map((qEl) => {
          const url = qEl.subj.value
          const year = (qEl.date || {}).value ||
            (qEl.date0 || {}).value ||
            (qEl.date2 || {}).value ||
            (qEl.date3 || {}).value ||
            (qEl.date4 || {}).value
          const authorQid = (qEl.author || {}).value
          const rulerQid = (qEl.coo || {}).value
          const wikiSource = (qEl.wikisourceSitelink || {}).value
          return [
            url.substr(url.lastIndexOf("/") + 1),
            getYear(year),
            authorQid && authorQid.substr(authorQid.lastIndexOf("/") + 1),
            rulerQid && rulerQid.substr(rulerQid.lastIndexOf("/") + 1),
            wikiSource]
        })

        rulList.reduce(
            (p, x) => p.then((_) => {
              return postRulPlus(x[0],x[1],x[2],x[3],x[4],rulerObject)
            }),
            Promise.resolve()
          )
      })
    })


postRulPlus = (qElId,year,authorQID,rulerQID,wikiSourceUrl,rulerObject) => new Promise((resolve, reject) => {
  if (alreadyProcessed.includes(qElId)) return resolve()
  alreadyProcessed.push(qElId)

  console.debug(qElId)
  utils.getEnWikiByQID(authorQID)
    .then((authorWiki) => {
      utils.getEnWikiByQID(rulerQID)
        .then((rulerWiki) => {

          console.debug(qElId, year, authorQID, authorWiki, rulerQID, rulerWiki, wikiSourceUrl)

          const rulKeys = Object.keys(rulerObject)
          const rulerAcc = rulKeys[Object.values(rulerObject).findIndex(el => el[2] === rulerWiki)]
          console.debug(rulerWiki, rulerAcc)
          // return resolve()
          return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + qElId + "&languages=en&props=sitelinks|claims")
            .then(response => response.json())
            .then((resQel) => {
              const qEl = resQel.entities[qElId]
              const qElClaims = qEl.claims

              const enWiki = (((qEl.sitelinks || {}).enwiki || {}).title || "").replace(/ /g, "_")

              if (!enWiki) return resolve()

              const imageNameJPG = ((((qElClaims.P18 || [])[0] || {}).mainsnak || {}).datavalue || {}).value


              utils.getResolution("File:" + imageNameJPG, 1024)
                .then((imageUrl) => {
                  console.debug(imageUrl)
                  // return resolve()

                  // warPushed.push(epicId)
                  // if (warPushed.includes(epicId)) {
                  //   entityName = fileName.replace(".txt","").replace(/ /g, "_")
                  //   epicId = "e_" +  entityName
                  // }
                  const epicObjectToPost = {
                    "_id": enWiki,
                    "data": {
                      "title": enWiki.replace(/_/g, " "),
                      "poster": imageUrl,
                      "source": wikiSourceUrl
                    },
                    "wiki": enWiki,
                    "year": +year,
                    "subtype": "ps",
                    "type": "i"
                  }

                  console.debug(JSON.stringify(epicObjectToPost))

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
                        console.log('metadata failed', response.status, entityName, JSON.stringify(epicObjectToPost))
                        return resolve()
                      } else {
                        console.log('metadata added')

                        // add defendends and attackers to war

                        let toLink = []
                        if (rulerAcc) toLink.push(["ae|ruler|" + rulerAcc,"metadata"])

                        new Promise((resolve, reject) => {
                          fetch(`${properties.chronasApiHost}/markers/${authorWiki}`)
                            .then(res => {
                              resolve(res.status === 200)
                            })
                            .catch(err => {
                              console.debug("err for ", rulName)
                              return resolve(false)
                            })
                        }).then((authorExists) => {
                          if (authorExists) toLink.push([authorWiki,"markers"])

                          toLink.reduce(
                            (p, rulerId) => p.then((tata) => {
                              if (!rulerId[0]) resolve(true)
                              const linkObject = {
                                "linkedItemType1": "metadata",
                                "linkedItemType2": rulerId[1],
                                "linkedItemKey1": enWiki,
                                "linkedItemKey2": rulerId[0],
                                "type1": "e",
                                "type2": "e" // a = map, e = media (?)
                              }
                              console.debug(linkObject)
                              fetch(`${properties.chronasApiHost}/metadata/links/addLink`, {
                                method: 'PUT',
                                body: JSON.stringify(linkObject),
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                                },
                              })
                                .then(response => {
                                  console.debug(rulerId[0], 'linked', response.status);
                                  resolve(true)
                                })
                                .catch((err) => {
                                  resolve(true)
                                })
                              // return handleWarFile(x)
                            }),
                            Promise.resolve()
                          ).then(() => {console.debug('next'); resolve()})
                        })
                      }
                    })
                    .catch((err) => {
                      console.debug("2ERRRRRRRRRROR", err)
                      return resolve()
                    })

                })
            })
        })
    })
})
