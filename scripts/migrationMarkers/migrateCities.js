const fetch = require('node-fetch')
// TODO: scrap from wikidata directly!
const markerId = '30'
const typeId = 'cities'


const properties = {
  oldChronasApiHost: 'http://chronas.org/en/app/datalayer/',
  chronasApiHost: 'http://localhost:4040/v1',
}

const yearList = []

for (let i = 1001; i <= 1200; i++) {
  yearList.push(i.toString())
}

yearList.reduce(
  (p, x) => p.then(_ => queryYear(x)),
  Promise.resolve()
)

queryYear = yearId => new Promise((resolve, reject) => {
    // noinspection JSAnnotator
  fetch(properties.oldChronasApiHost + markerId + yearId)
      .then(response => response.text())
      .then((response) => {
        try {
        const markerGeojson = JSON.parse(response)
        console.log('markerGeojson received with length', markerGeojson.features.length)

        const features = (markerGeojson || {}).features || false

          if (features) {
            features.forEach((feature) => {
              // const year = (feature.properties.yOBirth === 'NOTDEFINED') ? +yearId : +feature.properties.yOBirth
              return fetch(`${properties.chronasApiHost}/markers`, {
                method: 'POST',
                body: JSON.stringify({
                  name: feature.properties.name,
                  coo: (feature.geometry.coordinates || []).map(el => Math.round(el * 100) / 100),
                  type: typeId,
                  year: +feature.properties.start,
                  end: +feature.properties.start + 1000,
                  wiki: feature.properties.wikiUrl,
                }),
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                },
              })
                .then((response) => {
                  if (response.status < 200 || response.status >= 300) {
                    console.log('marker failed', response.statusText)
                    resolve()
                  } else {
                    console.log('marker success')
                    resolve()
                  }
                })
            })
          } else {
            console.error('No features in response!')
            resolve()
          }
        } catch (err) {
          console.log('err catch', err)
          resolve()
        }
      })
})
    .catch((err) => {
      resolve()
    })

// http://chronas.org/en/app/datalayer/301082/
