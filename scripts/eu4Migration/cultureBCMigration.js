const fetch = require('node-fetch')
const fs = require('fs')
const resolve = require('path').resolve
// const LineReader = require('linereader')
var LineReader = require('line-reader');
const folderDir = resolve("../../dataToMigrate/imperium_universalis/history/countries")
const colorFolderDir = resolve("../../dataToMigrate/imperium_universalis/common/countries")
const properties = {
  chronasApiHost: 'http://localhost:4040/v1',
  flagFolder: '/images/icons/ruler/'
}

const utils = require('../utils')

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

  // const lineReader = new LineReader(colorFolderDir + '/' + moddedFileName + '.txt')
  LineReader.eachLine(colorFolderDir + '/' + moddedFileName + '.txt', function(line) {
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

handleFile = (fileName) => new Promise((resolve, reject) => {
    // const lineReader = new LineReader(folderDir + '/' + fileName)

    let entityId = fileName.substr(0, fileName.indexOf(" - "))
    let entityName = fileName.substring(fileName.indexOf(" - ")+3, fileName.length-4)


    let start = false // first number
    let end = false // lastnumber
    let attacker = []
    let defender = []

  LineReader.eachLine(folderDir + '/' + fileName, function(line) {
      if (!entityName) {
        // look for entity name
        const potentialName = extractValueByKeyandEnd({line, startString: 'name = "', stopString: '"' })
        if (potentialName) entityName = potentialName
      }

      // const potentialAttacker = extractValueByKeyandEnd({line, startString: 'add_attacker = ', stopString: ' ' })
      // if (potentialAttacker && !attacker.includes(potentialAttacker)) attacker.push(potentialAttacker)
      // const potentialDefender = extractValueByKeyandEnd({line, startString: 'add_defender = ', stopString: ' ' })
      // if (potentialDefender && !defender.includes(potentialDefender)) defender.push(potentialDefender)


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
    console.debug('"' + entityId + '":"' + entityName + '"')
    return resolve()
      utils.getEnWikiBySearch(entityName,false,'ancient')
        .then((enWiki) => {
          if (!enWiki) {
            // console.debug("!!!!!!! enwiki not found for entityName: " + entityName)
            return resolve()
          }

          getColor(entityName)
            .then((ccolor) => {
              if (!ccolor) {
                // console.debug("!!!!!!! ccolor not found for: " + entityName)
                return resolve()
              }

              console.debug('"' + entityId + '":"' + entityName + '"')
return resolve()

              var epicObjectToPost = {
                "subEntityId": entityId,
                "nextBody": [
                  entityName,
                  ccolor,
                  enWiki,
                  properties.flagFolder + "bc" + entityId + ".png"
                ]}

                // console.debug({[entityId]: [
                //   entityName,
                //   ccolor,
                //   enWiki,
                //   properties.flagFolder + "bc" + entityId + ".png"
                // ]})

              // fetch(`${properties.chronasApiHost}/metadata/ruler/single`, {
              //   method: 'PUT',
              //   body: JSON.stringify(epicObjectToPost),
              //   headers: {
              //     'Content-Type': 'application/json',
              //     Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
              //   },
              // })
              //   .then((response) => {
              //     if (response.status < 200 || response.status >= 300) {
              //       console.log('metadata failed', response.status, entityName, JSON.stringify(epicObjectToPost))
              //       return resolve()
              //     } else {
              //       console.log('metadata added')
              //       return resolve()
              //     }
              //   })
              //   .catch((err) => {
              //     // console.debug("ERRRRRRRRRROR", err, fileName)
              //     return resolve()
              //   })

              // return resolve()
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
        })
    });
})

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
  )
})
