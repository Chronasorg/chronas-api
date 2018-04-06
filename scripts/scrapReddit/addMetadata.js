const fetch = require('node-fetch')
const csvFilePath = 'potentialImageCities.csv'

const typeId = 'politician'


const properties = {
  oldChronasApiHost: 'http://chronas.org/en/app/datalayer/',
  chronasApiHost: 'http://localhost:4040/v1',
}

const itemList = []

const csvToJson = require('convert-csv-to-json')
const json = csvToJson.fieldDelimiter(',').getJsonFromCsv(csvFilePath)

for (let i = 0; i < json.length; i++) {
  console.log(json[i])
}

const subtypeMapping = {
  ArtefactPorn: 'artefacts',
  museum: 'artefacts',
  HistoryPorn: 'misc',
  BattlePaintings: 'battles',
  papertowns: 'cities'
}

json.reduce(
  (p, x) => p.then(_ => postItem(x)),
  Promise.resolve()
)

postItem = itemObj => new Promise((resolve, reject) => {
  // noinspection JSAnnotator

  fetch(`${properties.chronasApiHost}/metadata`, {
    method: 'POST',
    body: JSON.stringify({
      _id: itemObj.id,
      type: itemObj.type,
      subtype: subtypeMapping[itemObj.subtype],
      year: itemObj.year,
      data: {
        title: itemObj.title,
        source: itemObj.source,
      },
    }),
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
})
.catch((err) => {
  resolve()
})
