const fetch = require('node-fetch')

const areaId = '10'
const typeId = 'politician'


const properties = {
  oldChronasApiHost: 'http://chronas.org/en/app/datalayer/',
  chronasApiHost: 'http://localhost:4040/v1',
}

const yearList = []

for (let i = 1886; i <= 1886; i++) {
  yearList.push(i.toString())
}

yearList.reduce(
  (p, x) => p.then(_ => queryYear(x)),
  Promise.resolve()
)

queryYear = yearId => new Promise((resolve, reject) => {
    // noinspection JSAnnotator
  fetch(properties.oldChronasApiHost + areaId + yearId)
      .then(response => response.text())
      .then((responseTest) => {
        // remove . from keys

        const areaGeojson = JSON.parse(responseTest)
        const cleanedAreaGeojson = {}
        Object.keys(areaGeojson).forEach(province => { cleanedAreaGeojson[province.replace(/\./g, '')] = areaGeojson[province] })

        return fetch(`${properties.chronasApiHost}/areas`, {
          method: 'POST',
          body: JSON.stringify({
            _id: yearId,
            year: +yearId,
            data: cleanedAreaGeojson
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
          },
        })
            .then((response) => {
              if (response.status < 200 || response.status >= 300) {
                console.log('area failed ' + yearId, response.statusText)
                resolve()
              } else {
                console.log('area success ' + yearId)
                resolve()
              }
            })
      })
})
.catch((err) => {
  resolve()
})


// http://chronas.org/en/app/datalayer/901082/
