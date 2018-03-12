import Marker from '../models/marker.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'

const debug = require('debug')('chronas-api:index')

/**
 * Load marker and append to req.
 */
function load(req, res, next, id) {
  Marker.get(id)
    .then((marker) => {
      req.entity = marker // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
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

  const markerId = req.body._id || decodeURIComponent(req.body.wiki)
  Marker.findById(markerId)
    .exec()
    .then((duplicatedMarker) => {
      if (duplicatedMarker) {
        const err = new APIError('A marker with this wiki already exists!', 400)
        next(err)
      }

      const marker = new Marker({
        _id: markerId,
        name: req.body.name,
        geo: req.body.geo,
        type: req.body.type,
        subtype: req.body.subtype,
        start: req.body.start,
        end: req.body.end,
        date: req.body.date,
        rating: req.body.rating,
      })

      marker.lastUpdated = Date.now()
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
  if (typeof req.body.geo !== 'undefined') marker.geo = req.body.geo
  if (typeof req.body.type !== 'undefined') marker.type = req.body.type
  if (typeof req.body.subtype !== 'undefined') marker.subtype = req.body.subtype
  if (typeof req.body.start !== 'undefined') marker.start = req.body.start
  if (typeof req.body.end !== 'undefined') marker.end = req.body.end
  if (typeof req.body.date !== 'undefined') marker.date = req.body.date
  if (typeof req.body.rating !== 'undefined') marker.rating = req.body.rating

  marker.lastUpdated = Date.now()
  marker.save()
    .then((savedMarker) => {
      if (!fromRevision) {
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
