const fetch = require('node-fetch')
const fs = require('fs')
const resolve = require('path').resolve
// const LineReader = require('linereader')
var LineReader = require('line-reader');
const folderDir = resolve("../../dataToMigrate/extendedtimeline/history/wars") // extendedtimeline // imperium_universalis

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

const warPushed=[]

const utils = require('../utils')

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

handleWarFile = (fileName) => new Promise((resolve, reject) => {
  // console.debug(fileName)
  //   const lineReader = new LineReader(folderDir + '/' + fileName)

    let entityName = ""
    let start = false // first number
    let end = false // lastnumber
    let attacker = []
    let defender = []

  LineReader.eachLine(folderDir + '/' + fileName, function(line) {
    // lineReader.on('line', function (lineno, line) {
      if (!entityName) {
        // look for entity name
        const potentialName = extractValueByKeyandEnd({line, startString: 'name = "', stopString: '"' })
        if (potentialName) entityName = potentialName
      }

      const potentialAttacker = extractValueByKeyandEnd({line, startString: 'add_attacker = ', stopString: ' ' })
      if (potentialAttacker && !attacker.includes(potentialAttacker)) attacker.push(potentialAttacker)
      const potentialDefender = extractValueByKeyandEnd({line, startString: 'add_defender = ', stopString: ' ' })
      if (potentialDefender && !defender.includes(potentialDefender)) defender.push(potentialDefender)


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

    if (attacker.length === 0 || defender.length === 0) {
      // console.debug("XXXXXXXXXXXXXXXXXX no participants, fileName: " + fileName)
    }

    if (!entityName) {
      console.debug("!!!!!!!XXXXXX entityName not found, fileName: " + fileName)
      return resolve()
    }

    utils.getEnWikiBySearch(entityName)
      .then((preWiki) => {
        let enWiki = preWiki ? preWiki : 'war'
        utils.getImageByTitleOrSearch(entityName, enWiki, 1024)
          .then((imageUrl) => {
            if (!imageUrl) {
              console.debug("!!!!!!! imageUrl not found for entityName: " + entityName)
              imageUrl = false
            }
            // console.debug(entityName,enWiki,imageUrl)
            // return resolve()

            let epicId = "e_" + enWiki.replace(/ /g, "_")
            warPushed.push(epicId)
            // if (warPushed.includes(epicId)) {
            //   entityName = fileName.replace(".txt","").replace(/ /g, "_")
            //   epicId = "e_" +  entityName
            // }
            const epicObjectToPost = {
              "_id": epicId,
              "data": {
                "title": entityName,
                "wiki": enWiki.replace(/ /g, "_"),
                "start": +start,
                "end": +end,
                "poster": imageUrl,
                "participants": [
                  attacker,
                  defender
                ],
              },
              "wiki": enWiki.replace(/ /g, "_"),
              "year": +start,
              "subtype": "ew",
              "type": "e"
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

                const promiseList = []
                attacker.concat(defender).reduce(
                  (p, rulerId) => p.then((tata) => {
                    const linkObject = {
                      "linkedItemType1": "metadata",
                      "linkedItemType2": "metadata",
                      "linkedItemKey1": epicId,
                      "linkedItemKey2": "ae|ruler|" + rulerId,
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
                        console.debug(epicId,rulerId,'linked',response.status);
                        resolve(true)
                      })
                      .catch((err) => {
                        resolve(true)
                      })
                    // return handleWarFile(x)
                  }),
                  Promise.resolve()
                )
              }
            })
            .catch((err) => {
              console.debug("2ERRRRRRRRRROR", err, fileName)
              return resolve()
            })
          })
          .catch((err) => {
            console.debug("3ERRRRRRRRRROR", err, fileName)
            return resolve()
          })
      })
      .catch((err) => {
        console.debug("ERRRRRRRRRROR", err, fileName)
        return resolve()
      })
  })
})

// Loop through all the files in the temp directory
fs.readdir(folderDir, function( err, files ) {
  if (err) {
    console.error("Could not list the directory.", err);
    process.exit(1);
  }

  files.reduce(
    (p, x) => p.then(() => {
      console.debug("war ", x)
      return handleWarFile(x)
    }),
    Promise.resolve()
  )
})
