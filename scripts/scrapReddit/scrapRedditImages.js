/*

node scrapRedditImages.js papertowns
node scrapRedditImages.js museum
node scrapRedditImages.js HistoryPorn
node scrapRedditImages.js BattlePaintings
node scrapRedditImages.js ArtefactPorn

*/


const axios = require('axios')
const fs = require('fs')

const stream = fs.createWriteStream('potentialImageCities.csv', { flags: 'a' })

function myRec(iter, after) {
  axios.get(`https://www.reddit.com/r/${process.argv[2]}/new.json?limit=100${after}`).then((res) => {
    res.data.data.children.forEach((item, i) => {
      let urlImage = item.data.url
      if (JSON.stringify(item.data).indexOf('i.imgur.com') > -1) {
        const full = JSON.stringify(item.data)
        const found = full.lastIndexOf('i.imgur.com')
        urlImage = `http://${decodeURIComponent(full.substring(found, found + 4 + full.substr(found, 40).indexOf('.jpg')))}`
      }
      if (urlImage === 'http://i.i') {
        return
      }
      const title = item.data.title
      const year = (title.match(/[0-9]+/g) || {})[0]
      const source = `http://reddit.com${item.data.permalink}`
      const score = Math.round((item.data.score / process.argv[3]) * 100)

      stream.write(`${'i'},${process.argv[2]},${year},${title},${urlImage},${source},${score}\n`, () => { })
    })

    if (iter < 801) {
      iter += 100
      setTimeout(() => {
        myRec(iter, `&after=${res.data.data.after}`)
      }, 100)
    }
  })
}

myRec(0, '')
