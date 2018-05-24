const fetch = require('node-fetch')

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

// https://query.wikidata.org/sparql?format=json&query=SELECT+DISTINCT+%3Fitem+WHERE+%7B%0A++%3Fitem+wdt:P31+%3Fsub0+.%0A++%3Fsub0+(wdt:P279)*+wd:Q198+.%0A++%3Fitem+wdt:P580+%5B%5D+.%0A%7D

// war and subclass (battles sieges etc)

// get correct resolution:
// https://commons.wikimedia.org/w/api.php?action=query&titles=File:Flag_of_Nigerian_Jews.JPG&prop=imageinfo&&iiprop=url&iiurlwidth=100&format=json


// https://commons.wikimedia.org/w/api.php?action=query&titles=File%3ABanner_of_the_Holy_Roman_Emperor_with_haloes_(1400-1806).svg&prop=info%7Cimageinfo&inprop=protection&iiprop=size&format=json

const rulList = []
let originalMeta

fetch(`${properties.chronasApiHost}/metadata/ruler`)
  .then(response => response.json())
  .then((rulerMetadata) => {
    originalMeta = rulerMetadata
    const rulValues = Object.keys(rulerMetadata.data)

    rulValues.forEach((rul) => {
      console.debug( rulerMetadata.data[rul][0] )
      if (rulerMetadata.data[rul]) {
        rulList.push([rul, rulerMetadata.data[rul][0]])
      }
    })
    rulList.push(['!done','!done'])


    console.debug("!!! rulList.length " + rulList.length)
    rulList.reduce(
        (p, x) => p.then((_) => {

          console.debug("done")
          return postRulPlus(x[0], x[1])
        }),
        Promise.resolve()
      )
  })

postRulPlus = (rulAcc, rulKey) => new Promise((resolve, reject) => {
  if (rulAcc === "!done") {
    fetch(`${properties.chronasApiHost}/metadata/ruler`, {
      method: 'PUT',
      body: JSON.stringify(originalMeta),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
      },
    })
  }
  else {
    const firstWord = rulKey.split(" ")[0]
    return fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=Flag%20of%20" + rulKey + "&namespace=*&profile=fuzzy&limit=500")
      .then(response => response.json())
      .then((ruler) => {
        let rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()

        if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
          // we found something valid, go on
          goOn(rulAcc, ruler[1], resolve, reject)
        }
        else {
          fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=Banner%20of%20" + rulKey + "&namespace=*&profile=fuzzy&limit=500")
            .then(response => response.json())
            .then((ruler) => {
              rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()

              if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                // we found something valid, go on
                goOn(rulAcc, ruler[1], resolve, reject)
              }
              else {
                fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=" + rulKey + "%20Banner&namespace=*&profile=fuzzy&limit=500")
                  .then(response => response.json())
                  .then((ruler) => {
                    rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()

                    if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                      // we found something valid, go on
                      goOn(rulAcc, ruler[1], resolve, reject)
                    }
                    else {
                      fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=" + rulKey + "%20Flag&namespace=*&profile=fuzzy&limit=500")
                        .then(response => response.json())
                        .then((ruler) => {
                          rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()
                          if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                            // we found something valid, go on
                            goOn(rulAcc, ruler[1], resolve, reject)
                          }
                          else {
                            fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=Flag%20of%20" + firstWord + "&namespace=*&profile=fuzzy&limit=500")
                              .then(response => response.json())
                              .then((ruler) => {
                                let rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()

                                if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                                  // we found something valid, go on
                                  goOn(rulAcc, ruler[1], resolve, reject)
                                }
                                else {
                                  fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=Banner%20of%20" + firstWord + "&namespace=*&profile=fuzzy&limit=500")
                                    .then(response => response.json())
                                    .then((ruler) => {
                                      rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()

                                      if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                                        // we found something valid, go on
                                        goOn(rulAcc, ruler[1], resolve, reject)
                                      }
                                      else {
                                        fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=" + firstWord + "%20Banner&namespace=*&profile=fuzzy&limit=500")
                                          .then(response => response.json())
                                          .then((ruler) => {
                                            rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()

                                            if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                                              // we found something valid, go on
                                              goOn(rulAcc, ruler[1], resolve, reject)
                                            }
                                            else {
                                              fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=" + firstWord + "%20Flag&namespace=*&profile=fuzzy&limit=500")
                                                .then(response => response.json())
                                                .then((ruler) => {
                                                  rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()
                                                  if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                                                    // we found something valid, go on
                                                    goOn(rulAcc, ruler[1], resolve, reject)
                                                  }
                                                  else {
                                                    resolve()
                                                  }
                                                })
                                                .catch((err) => {
                                                  resolve()
                                                })
                                            }
                                          })
                                          .catch((err) => {
                                            resolve()
                                          })
                                      }
                                    })
                                    .catch((err) => {
                                      resolve()
                                    })
                                }
                              })
                              .catch((err) => {
                                resolve()
                              })
                          }
                        })
                        .catch((err) => {
                          resolve()
                        })
                    }
                  })
                  .catch((err) => {
                    resolve()
                  })
              }
            })
            .catch((err) => {
              resolve()
            })
        }
      })
      .catch((err) => {
        resolve()
      })
  }
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

          originalMeta.data[rulAcc][3] = thumbUrl)
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
