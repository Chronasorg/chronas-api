const fetch = require('node-fetch')

const properties = {
  oldChronasApiHost: 'http://chronas.org/en/app/datalayer/',
  chronasApiHost: 'http://localhost:4040/v1'
}

const rulList = []

fetch(`${properties.oldChronasApiHost}1`)
  .then(response => response.text())
  .then((response) => {
    const oldPlus = JSON.parse(response).rulPlus
    const rulKeys = Object.keys(oldPlus)

    rulKeys.forEach((rulKey) => {
      rulList.push([rulKey, oldPlus[rulKey][3] || false])
    })

    rulList.reduce(
        (p, x) => p.then((_) => {
          return postRulPlus(x[0], x[1])
        }),
        Promise.resolve()
      )
  })

postRulPlus = (rulKey, rulOldKey) => new Promise((resolve, reject) => {
  fetch(`${properties.oldChronasApiHost}26${rulOldKey}`)
    .then(response => response.text())
    .then((responseTest) => {
      const rulerArr = []
      const ruler = JSON.parse(responseTest)
      Object.keys(ruler).sort((a,b) => {return +a - +b}).forEach((key) => { rulerArr.push({ [key]: ruler[key]}) })

      return fetch(`${properties.chronasApiHost}/metadata/a_ruler_${rulKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          data: { ruler: rulerArr }
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
        },
      })
          .then((response) => {
            if (response.status < 200 || response.status >= 300) {
              console.log(`ruler failed ${rulKey}`, response.statusText)
              resolve()
            } else {
              console.log(`ruler success ${rulKey}`)
              resolve()
            }
          })
    })
    .catch((err) => {
      resolve()
    })
})


// http://chronas.org/en/app/datalayer/26700
