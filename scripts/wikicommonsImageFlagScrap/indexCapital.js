const fetch = require('node-fetch')

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

const rulList = []
let originalMeta

fetch(`${properties.chronasApiHost}/metadata/capital`)
  .then(response => response.json())
  .then((rulerMetadata) => {
    originalMeta = rulerMetadata
    const rulValues = Object.keys(rulerMetadata.data)

    rulValues.forEach((rul) => {
      console.debug( rulerMetadata.data[rul] )
      if (rulerMetadata.data[rul]) {
        rulList.push([rul, rul])
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
    fetch(`${properties.chronasApiHost}/metadata/capital`, {
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
                                                    fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=" + firstWord + " coat&namespace=*&profile=fuzzy&limit=500")
                                                      .then(response => response.json())
                                                      .then((ruler) => {
                                                        rulerImagesString = JSON.stringify(ruler[1]).toLowerCase()
                                                        if (ruler[1].length > 0 && (rulerImagesString.indexOf(".svg") > -1 || rulerImagesString.indexOf(".jpg") > -1 || rulerImagesString.indexOf(".jpeg") > -1 || rulerImagesString.indexOf(".png") > -1)) {
                                                          // we found something valid, go on
                                                          goOn(rulAcc, ruler[1], resolve, reject)
                                                        }
                                                        else {
                                                          fetch("https://commons.wikimedia.org/w/api.php?action=opensearch&search=" + firstWord + "&namespace=*&profile=fuzzy&limit=500")
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
          originalMeta.data[rulAcc] = [originalMeta.data[rulAcc], thumbUrl]
          console.debug(rulAcc + " -> " + originalMeta.data[rulAcc])
          resolve()
        })
        .catch((err) => {
          originalMeta.data[rulAcc] = [originalMeta.data[rulAcc], undefined]
          resolve()
        })
      break
    }
  }
}
