import { omit } from 'underscore'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import logger from '../../config/winston'
import Revision from '../models/revision.model'
import Area from '../models/area.model'
import Marker from '../models/marker.model'
import Metadata from '../models/metadata.model'
import areaCtrl from './area.controller'
import markerCtrl from './marker.controller'
import metadataCtrl from './metadata.controller'

const debug = require('debug')('chronas-api:index')

const resourceCollection = {
  "areas": { id: "year", model: Area, controller: areaCtrl },
  "markers": { id: "wiki", model: Marker, controller: markerCtrl },
  "metadata": { id: "_id", model: Metadata, controller: metadataCtrl },
}

/**
 * Load revision and append to req.
 */
function load(req, res, next, id) {
  Revision.get(id)
    .then((revision) => {
      req.revision = revision // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

function loadEntity(req, res, next) {
  const resource = req.body.resource
  if (typeof resource !== "undefined") {
    let entityId
    try {
      entityId = req.body.entityId
    } catch (err) {
      next()
    }
    resourceCollection[resource].model.get(entityId)
      .then((entity) => {
        req.entity = entity // eslint-disable-line no-param-reassign
        return next()
      })
      .catch(e => next())
  } else {
    next()
  }
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
  Revision.findById(req.body.entityId)
    .exec()
    .then((duplicatedRevision) => {
      if (duplicatedRevision) {
        const err = new APIError('A revision with this wiki already exists!', 400)
        next(err)
      }

      const username = req.auth.username
      const revision = new Revision({
        type: 'CREATE',
        subtype: req.body.subtype,
        startYear: req.body.startYear,
        user: username,
        resource: req.resource,
      })

      revision.lastUpdated = Date.now()

      revision.save()
        .then(savedRevision => res.json(savedRevision))
        .catch(e => next(e))
    })
    .catch(e => next(e))
}

function addCreateRevision(req, res, next) {
  const username = req.auth.username
  // TODO: add karma here

  const entityId = decodeURIComponent(req.body[resourceCollection[req.resource].id])
  const revision = new Revision({
    entityId: entityId,
    type: 'CREATE',
    subtype: req.body.subtype,
    startYear: req.body.startYear,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(req.body),
  })

  // add revision record
  revision.save()
    .then(() => {
      next()
    })
    .catch(e => next(e))
}

function addDeleteRevision(req, res, next) {
  const entity = req.entity
  const username = req.auth.username
  // TODO: add karma here

  const revision = new Revision({
    entityId: entity._id,
    type: 'DELETE',
    user: username,
    resource: req.resource,
    prevBody: JSON.stringify(entity),
  })

  // add revision record
  revision.save()
    .then(() => {
      next()
    })
    .catch(e => next(e))
}

function addUpdateRevision(req, res, next) {
  const entity = req.entity
  const username = req.auth.username
  // TODO: add karma here

  const nexBody = shallowDiff(req.body, entity.toObject())
  const prevBody = shallowDiff(entity.toObject(), req.body)

  delete nexBody.id
  delete prevBody.id
  delete nexBody._id
  delete prevBody._id

  const revision = new Revision({
    entityId: entity._id,
    type: 'UPDATE',
    subtype: req.body.subtype,
    startYear: req.body.startYear,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nexBody),
    prevBody: JSON.stringify(prevBody),
  })

  // add revision record
  revision.save()
    .then(() => {
      next()
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
  const revision = req.revision // .toObject()
  const resource = revision.resource

  switch (revision.type) {
    case 'CREATE':
      if (revision.reverted) {
        // post nextBody
        req.body = JSON.parse(req.body.nextBody)
        resourceCollection[resource].controller.create(req, res, next, true)
      } else {
        // was post, so delete again by id nextBody
        resourceCollection[resource].controller.remove(req, res, next, true)
      }
      break
    case 'UPDATE':
      if (revision.reverted) {
      // was updated, so put prevBody
        req.body = JSON.parse(req.body.nextBody)
        resourceCollection[resource].controller.update(req, res, next, true)
      } else {
      // update to nextBody
        req.body = JSON.parse(req.body.prevBody)
        resourceCollection[resource].controller.update(req, res, next, true)
      }
      break
    case 'DELETE':
      if (revision.reverted) {
        // delete by id prevBody
        resourceCollection[resource].controller.remove(req, res, next, true)
      } else {
        // was deleted, so post prevBody
        req.body = JSON.parse(req.body.prevBody)
        resourceCollection[resource].controller.create(req, res, next, true)
      }
      break
    default:
      next()
      break
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
    .then(deletedRevision => res.json(deletedRevision))
    // .then(deletedRevision => next(new APICustomResponse(`${deletedRevision} deleted successfully`, 204, true)))
    .catch(e => next(e))
}

function shallowDiff(a, b) {
  return omit(a, (v, k) => JSON.stringify(b[k]) === JSON.stringify(v))
}

export default { addUpdateRevision, addCreateRevision, addDeleteRevision, loadEntity, load, get, create, update, list, remove }
