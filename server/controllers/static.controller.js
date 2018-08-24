import { pick, keys, isEqual, extendOwn } from 'underscore'
const puppeteer = require('puppeteer')
import { cache } from '../../config/config'

const MAXCACHEDIMAGES = 2
const CACHETTL = 1000 * 60 * 60 * 24 * 7 // 1 week
/**
 * Get static image
 * @returns {image}
 */
function get(req, res) {
  const selectedYearAndFormat = (req.params.year || '').split('.')

  if (selectedYearAndFormat[1] !== 'png' && selectedYearAndFormat[1] !== 'jpeg') {
    return res.status(400).send('Image format must be either jpeg or png')
  }

  if (+selectedYearAndFormat[0] < -2000 && selectedYearAndFormat[0] > 2000) {
    return res.status(400).send('Year must be between -2000 and 2000')
  }

  const cachedImage = cache.get('image_' + req.params.year)
  if (cachedImage) {
    res.contentType('image/' + selectedYearAndFormat[1]);
    return res.send(cachedImage);
  }

  puppeteer.launch().then(browser => {
    browser.newPage()
      .then(page => {
        page.goto('http://localhost:3000/?year=' + selectedYearAndFormat[0] + '&isStatic=true')
          .then(resp => page.waitForFunction('document.querySelector(".mapboxgl-canvas") !== null'))
          .then(resp => page.waitFor(3000))
          .then(resp => page.screenshot({ type : selectedYearAndFormat[1] }))
          .then(buffer => {
            browser.close()

            const currImageKeys = cache.keys().filter(el => el.substr(0,6) === "image_")
            if (currImageKeys.length > MAXCACHEDIMAGES) {
              // max cached items reached, delete first in
              if (cache.del(currImageKeys[0])) {
                cache.put('image_' + req.params.year, buffer, CACHETTL)
              }
            } else {
              cache.put('image_' + req.params.year, buffer, CACHETTL)
            }
            res.contentType('image/' + selectedYearAndFormat[1])
            res.send(buffer)
          })
      })
  })
}

export default { get }
