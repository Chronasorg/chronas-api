import Marker from '../models/marker.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import config from "../../config/config";
import httpStatus from "http-status";

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
        coo: req.body.coo,
        type: req.body.type,
        year: req.body.year,
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
  if (typeof req.body.type !== 'undefined') marker.type = req.body.type
  if (typeof req.body.year !== 'undefined') marker.year = req.body.year

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
  const { start = 0, end = 500, count = 0, sort = 'name', order = 'asc', filter = '' } = req.query
  const length = +end - +start
  const typeArray = req.query.types || false
  const wikiArray = req.query.wikis || false
  const format = req.query.format || false
  const year = +req.query.year || false
  const delta = +req.query.delta || 10
  const search = req.query.search || false
  const both = req.query.both || false

  Marker.list({ start, length, sort, order, filter, delta, year, typeArray, wikiArray, search, both, format })
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
