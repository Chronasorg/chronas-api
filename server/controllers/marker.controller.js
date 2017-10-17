import Marker from '../models/marker.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'

const debug = require('debug')('chronas-api:index')

/**
 * Load marker and append to req.
 */
function load(req, res, next, id) {
  Marker.get(id)
    .then((marker) => {
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
  return res.json(req.marker.data)
}

/**
 * Create new marker
 * @property {string} req.body.name - The markername of marker.
 * @property {string} req.body.privilege - The privilege of marker.
 * @returns {Marker}
 */
function create(req, res, next) {
  const marker = new Marker({
    name: req.body.name,
    owner: req.user.username,
    privilegeLevel: req.body.privilegeLevel,
    layout: req.body.layout,
    modifiedAt: req.body.modifiedAt,
    createdAt: req.body.createdAt
  })

  marker.save()
    .then(savedMarker => res.json(savedMarker))
    .catch(e => next(e))
}

/**
 * Update existing marker
 * @property {string} req.body.name - The name of marker.
 * @property {string} req.body.privilege - The privilege of marker.
 * @returns {Marker}
 */
function update(req, res, next) {
  const marker = req.marker
  if (typeof req.body.name !== 'undefined') marker.name = req.body.name
  if (typeof req.body.privilegeLevel !== 'undefined') marker.privilegeLevel = req.body.privilegeLevel
  if (typeof req.body.layout !== 'undefined') marker.layout = req.body.layout
  marker.modifiedAt = Date.now

  marker.save()
    .then(savedMarker => res.json(savedMarker))
    .catch(e => next(e))
}

/**
 * Get marker list.
 * @property {number} req.query.offe - Number of markers to be skipped.
 * @property {number} req.query.limit - Limit number of markers to be returned.
 * @returns {Marker[]}
 */
function list(req, res, next) {
  const { limit = 50, skip = 0 } = req.query
  Marker.list({ limit, skip })
    .then((markers) => {
      const markersTmp = JSON.parse(JSON.stringify(markers)) || [],
        markersToList = []

      for (let i = 0; i < markersTmp.length; i++) {
        if (markersTmp[i].owner === req.user.username
          || markersTmp[i].privilegeLevel.indexOf('public') > -1) {
          markersToList.push(markersTmp[i])
        }
      }

      res.json(markersToList)
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

export default { load, get, create, update, list, remove }
