import Revision from '../models/revision.model'
import Marker from '../models/marker.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import { omit } from 'underscore'
import logger from '../../config/winston'

const debug = require('debug')('chronas-api:index')

/**
 * Load marker and append to req.
 */
function load(req, res, next, id) {
  logger.info("look for id", id)
  Marker.get(id)
    .then((marker) => {
      logger.info("found marker 0000 inside markersmarkersmarker", marker)
      req.marker = marker // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

/**
 * Get marker
 * @returns {Marker}
 */
function get(req, res) {
  return res.json(req.marker)
}

/**
 * Create new marker
 * @property {string} req.body.name - The markername of marker.
 * @property {string} req.body.privilege - The privilege of marker.
 * @returns {Marker}
 */
function create(req, res, next) {
  Marker.findById(decodeURIComponent(req.body.wiki))
    .exec()
    .then((duplicatedMarker) => {
      if (duplicatedMarker) {
        const err = new APIError('A marker with this wiki already exists!', 400)
        next(err)
      }

      const marker = new Marker({
        _id: decodeURIComponent(req.body.wiki),
        name: req.body.name,
        geo: req.body.geo,
        type: req.body.type,
        subtype: req.body.subtype,
        startYear: req.body.startYear,
        endYear: req.body.endYear,
        date: req.body.date,
        rating: req.body.rating,
      })
      marker.lastUpdated = Date.now()

      marker.save()
        .then(savedMarker => {
          // TODO: add revision record


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
function update(req, res, next, addRevertRecord = true) {
  const marker = req.marker

  if (addRevertRecord) {
    logger.info("req.body,req.body,req.body,", req.body)
    logger.info("marker,marker,marker,marker,", marker)

    const username = req.auth.username
    //TODO: add karma here

    const nexBody = shallowDiff(req.body,marker.toObject())
    const prevBody = shallowDiff(marker.toObject(),req.body)

    delete nexBody.id
    delete prevBody.id
    delete nexBody["_id"]
    delete prevBody["_id"]

    const revision = new Revision({
      entityId: marker["_id"],
      type: "UPDATE",
      subtype: req.body.subtype,
      startYear: req.body.startYear,
      user: username,
      resource: "markers",
      nextBody: JSON.stringify(nexBody),
      prevBody: JSON.stringify(prevBody),
    })

    // add revision record
    revision.save()
      // .then((savedRevision) => res.json(savedRevision))
  }

  if (typeof req.body.name !== 'undefined') marker.name = req.body.name
  // if (typeof req.body.wiki !== 'undefined') marker._id = req.body.wiki
  if (typeof req.body.geo !== 'undefined') marker.geo = req.body.geo
  if (typeof req.body.type !== 'undefined') marker.type = req.body.type
  if (typeof req.body.subtype !== 'undefined') marker.subtype = req.body.subtype
  if (typeof req.body.startYear !== 'undefined') marker.startYear = req.body.startYear
  if (typeof req.body.endYear !== 'undefined') marker.endYear = req.body.endYear
  if (typeof req.body.date !== 'undefined') marker.date = req.body.date
  if (typeof req.body.rating !== 'undefined') marker.rating = req.body.rating
  marker.lastUpdated = Date.now()

  marker.save()
    .then(savedMarker => {
      if (addRevertRecord) {
        res.json(savedMarker)
      }
    })
    .catch(e => next(e))
}

/**
 * Get marker list.
 * @property {number} req.query.offe - Number of markers to be skipped.
 * @property {number} req.query.limit - Limit number of markers to be returned.
 * @returns {Marker[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'lastUpdated', order = 'asc', filter = '' } = req.query
  const limit = end - start
  Marker.list({ start, limit, sort, order, filter })
    .then((markers) => {
      if (count) {
        Marker.find().count({}).exec().then((markerCount) => {
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
function remove(req, res, next) {
  const marker = req.marker
  marker.remove()
    .then(deletedMarker => next(new APICustomResponse(`${deletedMarker} deleted successfully`, 204, true)))
    .catch(e => next(e))
}

function shallowDiff(a,b) {
  return omit(a, function(v, k) {
    return JSON.stringify(b[k]) ===  JSON.stringify(v);
  })
}
export default { load, get, create, update, list, remove }
