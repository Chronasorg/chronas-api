import Marker from '../models/marker.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import { config } from '../../config/config'
import httpStatus from 'http-status'
import Metadata from '../models/metadata.model'

/**
 * Load marker and append to req.
 */
function load(req, res, next, id) {
  Marker.get(id)
    .then((marker) => {
      req.entity = marker // eslint-disable-line no-param-reassign
      return next()
    })
    .catch((e) => {
      res.status(httpStatus.NOT_FOUND).json({
        message: e.isPublic ? e.message : httpStatus[e.status],
        stack: config.env === 'development' ? e.stack : {}
      })
    })
}

/**
 * Get marker
 * @returns {Marker}
 */
function get(req, res) {
  return res.json(req.entity)
}

/**
 * Create new marker
 * @property {string} req.body.name - The markername of marker.
 * @property {string} req.body.privilege - The privilege of marker.
 * @returns {Marker}
 */
function create(req, res, next, fromRevision = false) {
  const markerId = decodeURIComponent(req.body._id || req.body.wiki)
  Marker.findById(markerId)
    .lean()
    .exec()
    .then((duplicatedMarker) => {
      if (duplicatedMarker) {
        const err = new APIError('A marker with this wiki already exists!', 400)
        next(err)
      }

      const marker = new Marker({
        _id: markerId,
        name: req.body.name,
        coo: req.body.coo,
        coo2: req.body.coo2,
        type: req.body.type,
        year: req.body.year,
        capital: req.body.capital,
        partOf: req.body.partOf,
        end: req.body.end,
      })

      marker.save()
        .then((savedMarker) => {
          if (!fromRevision) {
            res.json(savedMarker)
          }
        })
        .catch(e => next(e))
    })
    .catch(e => next(e))
}

/**
 * Update existing marker
 * @property {string} req.body.name - The name of marker.
 * @property {string} req.body.privilege - The privilege of marker.
 * @returns {Marker}
 */
function update(req, res, next, fromRevision = false) {
  const marker = req.entity
  if (typeof req.body.name !== 'undefined') marker.name = req.body.name
  if (typeof req.body.coo !== 'undefined') marker.coo = req.body.coo
  if (typeof req.body.coo2 !== 'undefined') marker.coo2 = req.body.coo2
  if (typeof req.body.type !== 'undefined') marker.type = req.body.type
  if (typeof req.body.year !== 'undefined') marker.year = req.body.year
  if (typeof req.body.capital !== 'undefined') marker.capital = req.body.capital
  if (typeof req.body.partOf !== 'undefined') marker.partOf = req.body.partOf
  if (typeof req.body.end !== 'undefined') marker.end = req.body.end

  const newId = decodeURIComponent(req.body.wiki || req.body._id)
  if (typeof newId !== 'undefined' && newId !== 'undefined' && newId !== marker._id) {
    const oldId = marker._id
    marker._id = newId
    // changing wiki (id!)
    // migrate links
    // create copy and remove old

    const markerNew = new Marker({
      _id: marker._id,
      name: marker.name,
      coo: marker.coo,
      coo2: marker.coo2,
      type: marker.type,
      year: marker.year,
      capital: marker.capital,
      partOf: marker.partOf,
      end: marker.end,
    })

    markerNew.save()
      .then((savedMarker) => {
        // return res.send("OK")
        Marker.get(oldId)
          .then((origMarker) => {
            origMarker.remove() // removing the just created
              .then(() => {
                Metadata.get('links', req.method)
                  .then((links) => {
                    if (links) {
                      const linkedItems = links.data[(`0:${oldId}`)]
                      if (linkedItems) {
                        const linkedMarkers = linkedItems[0]
                        const linkedMetadata = linkedItems[1]

                        linkedMarkers.map(el => `0:${el[0]}`).concat(linkedMetadata.map(el => `1:${el[0]}`)).forEach((key) => {
                          const currVal = links.data[key]
                          if (currVal) {
                            const mediaIndex = currVal[0].findIndex(el => el[0] === oldId)
                            const mapIndex = currVal[1].findIndex(el => el[0] === oldId)
                            const dirtyMedia = mediaIndex > -1
                            const dirtyMap = mapIndex > -1

                            if (dirtyMedia) {
                              currVal[0][mediaIndex] = [newId, currVal[0][mediaIndex][1]]
                            }
                            if (dirtyMap) {
                              currVal[1][mapIndex] = [newId, currVal[1][mapIndex][1]]
                            }
                            if (dirtyMap || dirtyMedia) {
                              links.data[key] = currVal
                            }
                          }
                        })

                        links.data[(`0:${newId}`)] = linkedItems
                        delete links.data[(`0:${oldId}`)]
                        links.markModified('data')
                      }

                      links.save()
                        .then(() => {
                          if (!fromRevision) {
                            res.json(savedMarker)
                          }
                        })
                        .catch((err) => {
                          if (!fromRevision) {
                            res.send('NOTOK')
                          }
                        })
                    }
                  })
                  .catch((err) => {
                    if (!fromRevision) {
                      res.send('NOTOK')
                    }
                  })
              })
              // .then(deletedMarker => next(new APICustomResponse(`${deletedMarker} deleted successfully`, 204, true)))
              .catch(e => next(e))
          }).catch(e => next(e))
      })
      .catch(e => next(e))
  } else {
    marker.save()
      .then((savedMarker) => {
        if (!fromRevision) {
          res.json(savedMarker)
        }
      })
      .catch(e => next(e))
  }
}

/**
 * Get marker list.
 * @property {number} req.query.offe - Number of markers to be skipped.
 * @property {number} req.query.limit - Limit number of markers to be returned.
 * @returns {Marker[]}
 */
function list(req, res, next) {
  const { offset = 0, count = 2000, sort = 'name', order = 'asc', filter = '' } = req.query
  const length = +count
  const typeArray = req.query.types || false
  const wikiArray = req.query.wikis || false
  const format = req.query.format || false
  const year = isNaN(req.query.year) ? false : +req.query.year
  const end = isNaN(req.query.year) ? false : +req.query.year
  const delta = +req.query.delta
  const includeMarkers = req.query.includeMarkers !== 'false'
  const search = req.query.search || false
  const both = req.query.both || false
  const start = offset
  const finalDelta = delta ? +delta : (year > 1200) ? 10 : (year > 1000) ? 20 : (year > 500) ? 30 : (year > -200) ? 20 : (year > -500) ? 50 : (year > -1000) ? 100 : (year > -1200) ? 150 : (year > -1500) ? 200 : 10
  const migrationDelta = req.query.migration ? ((year > 1950) ? 1000 : (year > 1860) ? 50 : (year > 1820) ? 30 : (year > 1700) ? 20 : (year > 1500) ? 30 : (year > 1400) ? 50 : (year > 1200) ? 100 : (year > 1000) ? 250 : (year > 500) ? 300 : (year > -200) ? 200 : (year > -500) ? 250 : (year > -1000) ? 300 : (year > -1200) ? 400 : (year > -1500) ? 500 : 10) : false

  Marker.list({ start, migrationDelta, length, sort, order, filter, delta: finalDelta, year, includeMarkers, end, typeArray, wikiArray, search, both, format })
    .then((markers) => {
      if (count) {
        Marker.count().exec().then((markerCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', markerCount)
          res.json(markers)
        })
      } else {
        res.json(markers)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete marker.
 * @returns {Marker}
 */
function remove(req, res, next, fromRevision = false) {
  const marker = req.entity
  marker.remove()
    .then((deletedMarker) => {
      if (!fromRevision) {
        res.json(deletedMarker)
      }
    })
    // .then(deletedMarker => next(new APICustomResponse(`${deletedMarker} deleted successfully`, 204, true)))
    .catch(e => next(e))
}

function defineEntity(req, res, next) {
  req.resource = 'markers'
  next()
}

export default { defineEntity, load, get, create, update, list, remove }
