const fetch = require('node-fetch')

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

// https://commons.wikimedia.org/w/api.php?action=opensearch&search=Flag%20of%20Nigeria&namespace=*&profile=fuzzy&limit=500

// 1: first banner after flag, if empty with only

// flag of ..
// banner of ..
// .. flag
// .. banner

// with all words and subsets

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
          const thumbUrl = Object.values(rulerMetadata.query.pages)[0].imageinfo[0].thumburl
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
