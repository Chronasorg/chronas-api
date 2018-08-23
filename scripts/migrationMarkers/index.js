const fetch = require('node-fetch')

const markerId = '90'
const typeId = 'politician'

// http://chronas.org/en/app/datalayer/301082/

// no dots in fields! - dot -> \u002E

const allMarkers = [//  21 for bc, (or ++)
  ["events", 20, undefined /* b,si */], // battles and sieges (properties._storage_options.iconUrl === (/static/i/b0.png || /static/i/b1.png || /static/i/b2.png)  ---  (properties._storage_options.iconUrl === (/static/i/s0.png || /static/i/s1.png || /static/i/s2.png)  --- if  properties.age === 0
  ["cities", 30, 'c'], // noage
  ["castles", 40, 'ca'],
  ["art", 50, 'ar'], // artefact
  // ["areaInfo", 60, 'ai'],
  // ["unc", 70, 'ai'],
  ["mil", 80, 'm'],
  ["pol", 90, 'p'],
  ["sci", 12, 's'],
  ["rel", 14, 'r'],
  ["uncP", 16, 'op'],
  ["exp", 18, 'e'],
  ["arti", 22, 'a'],
  ["ath", 24, 'at'],
]

const properties = {
  oldChronasApiHost: 'http://chronas.org/en/app/datalayer/',
  chronasApiHost: 'http://localhost:4040/v1',
}

const yearList = []

for (let j = 0; j < allMarkers.length; j++) {
  for (let i = 0; i <= 2000; i++) {
    yearList.push([i.toString(), j])
  }

}
yearList.reduce(
  (p, x) => p.then(_ => queryYear(x[0],x[1])),
  Promise.resolve()
)

queryYear = (yearId, markerIndex) => new Promise((resolve, reject) => {
  fetch(properties.oldChronasApiHost + allMarkers[markerIndex][1] + yearId)
      .then(response => response.text())
      .then((response) => {
        try {
        const markerGeojson = JSON.parse(response)
        console.log('markerGeojson received with length', markerGeojson.features.length)

        const features = (markerGeojson || {}).features || false

          if (features) {
            features.forEach((feature) => {
              let year

              switch(allMarkers[markerIndex][0]) {
                case "events":
                  year =  +feature.properties.yearOfOcc
                case "cities":
                  year =  +feature.properties.start
                case "castles":
                case "art":
                case "mil":
                case "pol":
                case "sci":
                case "rel":
                case "uncP":
                case "exp":
                case "arti":
                case "ath":

                break;
              }
              if (year) {
                return fetch(`${properties.chronasApiHost}/markers`, {
                  method: 'POST',
                  body: JSON.stringify({
                    name: feature.properties.name,
                    coo: feature.geometry.coordinates,
                    type: allMarkers[markerIndex][0],
                    year,
                    wiki: feature.properties.Url,
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
              } else {
                resolve()
              }
              // (feature.properties.yOBirth === 'NOTDEFINED') ? +yearId : +feature.properties.yOBirth

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


// http://chronas.org/en/app/datalayer/901082/
