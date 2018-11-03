const fetch = require('node-fetch')
const fs = require('fs')
const resolve = require('path').resolve
var LineReader = require('line-reader');
const folderDir = resolve("../../dataToMigrate/extendedtimeline/history/countries")
const countriesFolderDir = resolve("../../dataToMigrate/extendedtimeline/common/countries")
const properties = {
  chronasApiHost: 'http://localhost:4040/v1',
  flagFolder: '/images/icons/ruler/'
}

const utils = require('../utils')
const emptyTemplate = ["","","","",0]

function checkRgb (rgb) {
  var rxValidRgb = /([R][G][B][A]?[(]\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])(\s*,\s*((0\.[0-9]{1})|(1\.0)|(1)))?[)])/i
  if (rxValidRgb.test(rgb)) {
    return true
  }
}

function extractValueByKeyandEnd({ line, startString, stopString }) {
  const nameIndex = line.indexOf(startString)
  const startStringLength = startString.length
  if (line.indexOf(startString) > -1) {
    // look for entity name
    const endIndex = line.substr(nameIndex + startStringLength).indexOf(stopString)
    return line.substr(nameIndex + startStringLength, (endIndex === -1) ? 10000 : endIndex)
  }
  return false
}

function getFirstNumberOfLine({line}) {
  const potentialYear = line.substr(0, line.indexOf('.'))
  if (potentialYear.match(/^-{0,1}\d+$/)) {
    return +potentialYear
  }
  return false
}

getColor = (fileName) => new Promise((resolve, reject) => {
  const moddedFileName = fileName.replace(/ and /g, "").replace(/ of /g, "Of").replace(/ /g, "")
  // console.debug(moddedFileName+'.txt')

  // const lineReader = new LineReader(countriesFolderDir + '/' + moddedFileName + '.txt')
  LineReader.eachLine(countriesFolderDir + '/' + moddedFileName + '.txt', function(line) {
      // look for entity name
      const potentialName = extractValueByKeyandEnd({line, startString: 'color = { ', stopString: ' }'})

      if (potentialName) {
        const potentialColor = "rgb(" + potentialName.split('  ').join(',').split(' ').join(',').replace(",)",")").replace("(,","(").replace(/,,/g, ",").replace(/}\)/g, ")") + ")"
        return checkRgb(potentialColor) ? resolve(potentialColor) : resolve("rgb(32,144,204)")
      }
  }, function finished (err) {
    resolve(false)
  })
})

let peopleArray = []

handleFile = (fileName) => new Promise((resolve, reject) => {
console.debug(fileName + "   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXx")
    let entityId = fileName.substr(0, fileName.indexOf(" - "))
    let entityName = fileName.substring(fileName.indexOf(" - ")+3, fileName.length-4)


    let start = false // first number
    let end = false // lastnumber
    let attacker = []
    let defender = []

    let insideMonarchObject = false
    let monarchName = false
    let dynastyName = false
    let activeYear = false

  LineReader.eachLine(folderDir + '/' + fileName, {encoding: 'latin1'}, function(line) {
      if (!entityName) {
        // look for entity name
        const potentialName = extractValueByKeyandEnd({line, startString: 'name = "', stopString: '"' })
        if (potentialName) entityName = potentialName
      }

      // const potentialAttacker = extractValueByKeyandEnd({line, startString: 'add_attacker = ', stopString: ' ' })
      // if (potentialAttacker && !attacker.includes(potentialAttacker)) attacker.push(potentialAttacker)
      // const potentialDefender = extractValueByKeyandEnd({line, startString: 'add_defender = ', stopString: ' ' })
      // if (potentialDefender && !defender.includes(potentialDefender)) defender.push(potentialDefender)


    const potentialYearMarker = getFirstNumberOfLine({line})
    if (potentialYearMarker) {
      activeYear = +potentialYearMarker
        // console.debug(potentialYearMarker)
    }

    if (line.indexOf("monarch = {") > -1 || line.indexOf("queen = {") > -1 || line.indexOf("leader = {") > -1) {
      insideMonarchObject = true
    }

    if (insideMonarchObject) {
      const potentialMonarch = extractValueByKeyandEnd({line, startString: 'name = "', stopString: '"' }) || extractValueByKeyandEnd({line, startString: 'monarch_name = "', stopString: '"' }) || extractValueByKeyandEnd({line, startString: 'queen_name = "', stopString: '"' })
      const potentialDynasty = extractValueByKeyandEnd({line, startString: 'dynasty = "', stopString: '"' })

      if (potentialMonarch) monarchName = potentialMonarch
      if (potentialDynasty) dynastyName = potentialDynasty

      if (line.indexOf("}") > -1) {
        if (monarchName) {
          peopleArray.push([activeYear,monarchName,dynastyName,entityId])
          // console.debug(activeYear,monarchName + (dynastyName ? " (" + dynastyName + ")" : ""))
        }
        insideMonarchObject = false
        monarchName = false
        dynastyName = false
      }
    }

      if (!start) {
        // look for start date
        const potentialYear = getFirstNumberOfLine({line})
        if (potentialYear !== false) {
          start = potentialYear
          end = potentialYear
        }
      }

      const potentialYear = getFirstNumberOfLine({line})
      if (potentialYear !== false) {
        end = potentialYear
      }
  }, function finished (err) {
    return resolve()
    // console.debug('"' + entityId + '":"' + entityName + '"')
     /* utils.getEnWikiBySearch(entityName,false)
        .then((enWiki) => {
          if (!enWiki) {
            console.debug("!!!!!!! enwiki not found for entityName: " + entityName)
            return resolve()
          }

          getColor(entityName)
            .then((ccolor) => {
              if (!ccolor) {
                console.debug("!!!!!!! ccolor not found for: " + entityName)
                return resolve()
              }

              var epicObjectToPost = {
                "subEntityId": entityId,
                "nextBody": [
                  entityName,
                  ccolor,
                  enWiki,
                  properties.flagFolder + entityId + ".png"
                ]}

                console.debug({[entityId]: [
                  entityName,
                  ccolor,
                  enWiki,
                  properties.flagFolder + entityId + ".png"
                ]})

              return fetch(`${properties.chronasApiHost}/metadata/ruler/single`, {
                method: 'PUT',
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
                    // return resolve()
                    // ITERATE ADD PEOPLE
                    return resolve()
                    // console.debug("peopleArray", peopleArray.length)
                    // if (peopleArray.length === 0) return resolve()
                    //
                    // return peopleArray.reduce(
                    //   (p, x) => p.then((_) => {
                    //     console.debug('next person')
                    //     return addPerson(x[1],x[2],x[0])
                    //   }),
                    //   Promise.resolve()
                    // )
                  }
                })
                .catch((err) => {
                  // console.debug("ERRRRRRRRRROR", err, fileName)
                  return resolve()
                })

            })
            .catch((err) => {
              console.debug("22 ERRRRRRRRRROR", err, fileName)
              return resolve()
            })
          // console.debug(JSON.stringify(epicObjectToPost))

        })
        .catch((err) => {
          console.debug("ERRRRRRRRRROR", err, fileName)
          return resolve()
        })*/
    });
})

addPerson = (pName,dynasty=false,year,idToLinkTo) => new Promise((resolve, reject) => {
  console.debug("getEnWikiBySearch utils !!", pName, false, utils.isUniqueEnough(pName), dynasty)
  utils.getEnWikiBySearch(pName, false, utils.isUniqueEnough(pName) ? false : dynasty)
    .then((enWiki) => {
      if (!enWiki || enWiki === 'Interregnum') {
        return resolve()
      }

      console.debug('found',enWiki)
      utils.getQID(enWiki)
        .then((qElId) => {
          if (!qElId) {
            return resolve()
          }

          fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + qElId + "&languages=en&props=sitelinks|claims")
            .then(response => response.json())
            .then((resQel) => {
              const qEl = resQel.entities[qElId]
              const qElClaims = qEl.claims

              const place_birth =  (((((qElClaims.P19 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id
              // country of citizenship
              const place_death =  (((((qElClaims.P20 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id
              // country of citizenship
              const place_burial =  (((((qElClaims.P119 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id
              // country of citizenship
              const place_countryOfCitizenship =  (((((qElClaims.P27 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id


              const locationToQuery = place_birth || place_death || place_burial || place_countryOfCitizenship || 'Q90000'

              return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + locationToQuery + "&languages=en&props=sitelinks|claims")
                .then(response => response.json())
                .then((locQel) => {
                  const qEl = locQel.entities[locationToQuery]
                  const qElClaims = qEl.claims
                  const p625 = ((((qElClaims.P625 || [])[0] || {}).mainsnak || {}).datavalue || {}).value
                  const pId_locationCoordinates = p625 ? [Math.round(+p625.longitude *1000) / 1000,Math.round(+p625.latitude *1000) / 1000] : undefined

                  const bodyToPost = {
                    // _id: enWiki,
                    // name: pName,
                    coo: pId_locationCoordinates,
                    // type: 'p',
                    // year,
                    // wiki: enWiki,
                  }

                  if (!pId_locationCoordinates) return resolve()

                  console.debug("POST MARKER", bodyToPost)

                  fetch(`${properties.chronasApiHost}/markers/${enWiki}`, {
                    method: 'PUT',
                    body: JSON.stringify(bodyToPost),
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                    },
                  })
                    .then((response) => { console.debug(enWiki, " => ", pId_locationCoordinates); return resolve() })
                    .catch((err) => { console.log('err catch', err); return resolve() })
                  /*fetch(`${properties.chronasApiHost}/markers`, {
                    method: 'POST',
                    body: JSON.stringify(bodyToPost),
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                    },
                  })
                    .then((response) => {
                      console.debug("enter ronasApiHost}/markers !!")
                      if (response.status < 200 || response.status >= 300) {
                        console.log('marker failed', response.status, response.statusText, JSON.stringify(bodyToPost))
                        return resolve()
                      } else {
                        console.log(pName,'added')


                        const linkObject = {
                          "linkedItemType1": "metadata",
                          "linkedItemType2": "markers",
                          "linkedItemKey1": "ae|ruler|" + idToLinkTo,
                          "linkedItemKey2": enWiki,
                          "type1": "a",
                          "type2": "a" // a = map, e = media (?)
                        }

                        return fetch(`${properties.chronasApiHost}/metadata/links/addLink`, {
                          method: 'PUT',
                          body: JSON.stringify(linkObject),
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                          },
                        })
                          .then(response => {
                            console.debug(enWiki,idToLinkTo,'linked!');
                            return resolve()
                          })
                          .catch((err) => {
                            return resolve()
                          })
                      }
                    })
                    .catch((err) => {
                      console.log('err catch', err)
                      return resolve()
                    })*/

                })
                .catch((err) => {
                  console.log('err catch', err)
                  return resolve()
                })

            })
            .catch((err) => {
              //console.debug("22 ERRRRRRRRRROR", err, fileName)
              return resolve()
            })
        })
        .catch((err) => {
          //console.debug("22 ERRRRRRRRRROR", err, fileName)
          return resolve()
        })
    })
    .catch((err) => {
      //console.debug("ERRRRRRRRRROR", err, fileName)
      return resolve()
    })
})

var peopleCounter = 0
// Loop through all the files in the temp directory
fs.readdir(folderDir, function( err, files ) {
  if (err) {
    console.error("Could not list the directory.", err);
    process.exit(1);
  }

  files.reduce(
    (p, x) => p.then((_) => {
      return handleFile(x)
    }),
    Promise.resolve()
  ).then(() => {
    peopleArray.reduce(
      (p, x) => p.then((_) => {
        console.debug('next person ' + peopleCounter + '/' + peopleArray.length)
        // console.debug(JSON.stringify(peopleArray))
        peopleCounter++
        return addPerson(x[1],x[2],x[0],x[3])
      }),
      Promise.resolve()
    )
  })
})
