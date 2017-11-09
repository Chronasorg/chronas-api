import mongoose from 'mongoose'
import Revision from '../models/revision.model'
import Marker from '../models/marker.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import request from 'request-promise'
import logger from '../../config/winston'
import markerCtrl from './marker.controller'

const debug = require('debug')('chronas-api:index')

/**
 * Load revision and append to req.
 */
function load(req, res, next, id) {

  // const reqN = {body: JSON.parse(req.body.prevBody)}
  // new Promise(() => { markerCtrl.load(req, res, next, JSON.parse(req.body.prevBody).wiki)}).then(() => { console.debug("we are here") })
  // logger.warn('tring to lookup revision', id)
  Revision.get(id)
    .then((revision) => {
      // logger.warn('found revision')
      req.revision = revision // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

function loadEntity(req, res, next) {

  // const reqN = {body: JSON.parse(req.body.prevBody)}
  // new Promise(() => { markerCtrl.load(req, res, next, JSON.parse(req.body.prevBody).wiki)}).then(() => { console.debug("we are here") })

  // logger.warn('tring to lookup entity', JSON.parse(req.body.prevBody)["_id"])
  let entityId
  try {
    entityId = req.body.entityId
  }
  catch(err) {
    next()
  }

  Marker.get(entityId)
    .then((marker) => {
      // logger.warn('found!', marker)
      req.marker = marker // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next())
}


/**
 * Get revision
 * @returns {Revision}
 */
function get(req, res) {
  return res.json(req.revision)
}

/**
 * Create new revision
 * @property {string} req.body.name - The revisionname of revision.
 * @property {string} req.body.privilege - The privilege of revision.
 * @returns {Revision}
 */
function create(req, res, next) {
  Revision.findById(decodeURIComponent(req.body.wiki))
    .exec()
    .then((duplicatedRevision) => {
      if (duplicatedRevision) {
        const err = new APIError('A revision with this wiki already exists!', 400)
        next(err)
      }

      const revision = new Revision({
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
      revision.lastUpdated = Date.now()

      revision.save()
        .then(savedRevision => res.json(savedRevision))
        .catch(e => next(e))
    })
    .catch(e => next(e))
}

/**
 * Update existing revision
 * @property {string} req.body.name - The name of revision.
 * @property {string} req.body.privilege - The privilege of revision.
 * @returns {Revision}
 */
function update(req, res, next) {
  const revision = req.revision //.toObject()

  switch (revision.type) {
    case "CREATE":
    if (revision.reverted){
      // was post, so delete again by id nextBody

    } else {
      // post nextBody

    }
    break;
    case "UPDATE":
    if (revision.reverted){
      // was updated, so put prevBody
      req.body = JSON.parse(req.body.nextBody)
      markerCtrl.update(req, res, next, false)
    } else {
      // update to nextBody
      req.body = JSON.parse(req.body.prevBody)
      markerCtrl.update(req, res, next, false)
    }
    break;
    case "DELETE":
    if (revision.reverted){
      // was deleted, so post prevBody

    } else {
      // delete by id prevBody

    }
    break;
  }

  //        prev  next
  //  POST        X
  //  PUT   X     X
  // DELETE X

  revision.lastUpdated = Date.now()
  revision.reverted = !revision.reverted

  revision.save()
    .then(savedRevision => res.json(savedRevision))
    .catch(e => next(e))
}

/**
 * Get revision list.
 * @property {number} req.query.offe - Number of revisions to be skipped.
 * @property {number} req.query.limit - Limit number of revisions to be returned.
 * @returns {Revision[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'lastUpdated', order = 'asc', filter = '' } = req.query
  const limit = end - start
  Revision.list({ start, limit, sort, order, filter })
    .then((revisions) => {
      if (count) {
        Revision.find().count({}).exec().then((revisionCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', revisionCount)
          res.json(revisions)
        })
      } else {
        res.json(revisions)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete revision.
 * @returns {Revision}
 */
function remove(req, res, next) {
  const revision = req.revision
  revision.remove()
    .then(deletedRevision => next(new APICustomResponse(`${deletedRevision} deleted successfully`, 204, true)))
    .catch(e => next(e))
}

export default { loadEntity, load, get, create, update, list, remove }
