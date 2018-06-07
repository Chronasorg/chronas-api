import { omit } from 'underscore'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import logger from '../../config/winston'
import Revision from '../models/revision.model'
import Area from '../models/area.model'
import Marker from '../models/marker.model'
import Metadata from '../models/metadata.model'
import areaCtrl from './area.controller'
import userCtrl from './user.controller'
import markerCtrl from './marker.controller'
import metadataCtrl from './metadata.controller'

const debug = require('debug')('chronas-api:index')

const resourceCollection = {
  areas: { id: 'year', model: Area, controller: areaCtrl },
  markers: { id: 'wiki', model: Marker, controller: markerCtrl },
  metadata: { id: '_id', model: Metadata, controller: metadataCtrl },
}

/**
 * Load revision and append to req.
 */
function load(req, res, next, id) {
  Revision.findById(id)
    .then((revision) => {
      req.revision = revision // eslint-disable-line no-param-reassign
      // loadEntity
      const resource = revision.resource
      const entityId = revision.entityId

      if (entityId === 'MANY') {
        next()
      } else {
        resourceCollection[resource].model.findById(entityId)
          .then((entity) => {
            req.entity = entity // eslint-disable-line no-param-reassign
            return next()
          })
          .catch(e => next(e))
      }
    })
    .catch(e => next(e))
}

// function loadEntity(req, rels, next) {
//   const resource = req.body.resource
//   if (typeof resource !== 'undefined') {
//     let entityId
//     try {
//       entityId = req.body.entityId
//     } catch (err) {
//       next()
//     }
//     resourceCollection[resource].model.get(entityId)
//       .then((entity) => {
//         req.entity = entity // eslint-disable-line no-param-reassign
//         return next()
//       })
//       .catch(e => next())
//   } else {
//     next()
//   }
// }


/**
 * Get revision
 * @returns {Revision}
 */
function get(req, res) {
  return res.json(req.revision)
}

function addCreateRevision(req, res, next) {
  if (req.query.r === 'false') {
    next()
    return
  }

  const username = req.auth.username
  userCtrl.changePoints(username, "created", 1)

  const entityId = decodeURIComponent(req.body[resourceCollection[req.resource].id])
  const revision = new Revision({
    entityId,
    type: 'CREATE',
    subtype: req.body.subtype,
    start: req.body.start,
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
  userCtrl.changePoints(username, "deleted", 1)

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
  userCtrl.changePoints(username, "updated", 1)

  const nextBody =
    (req.resource === 'areas')
      ? (entity._id === 'MANY')
        ? req.body.nextBody
        : shallowDiff(req.body.data, entity.toObject().data)
      : shallowDiff(req.body, entity.toObject())

  const prevBody =
    (req.resource === 'areas')
      ? (entity._id === 'MANY')
        ? req.body.prevBody
        : shallowDiff(entity.toObject().data, req.body.data)
      : shallowDiff(entity.toObject(), req.body)

  if (typeof nextBody !== 'undefined') {
    delete nextBody.id
    delete nextBody._id
  }

  if (typeof prevBody !== 'undefined') {
    delete prevBody.id
    delete prevBody._id
  }

  const revision = new Revision({
    entityId: entity._id,
    type: 'UPDATE',
    subtype: req.body.subtype,
    start: req.body.start,
    end: req.body.end,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nextBody),
    prevBody: JSON.stringify(prevBody),
  })

  // add revision record
  revision.save()
    .then(() => {
      next()
    })
    .catch(e => next(e))
}

function addUpdateSingleRevision(req, res, next, shouldReturn = true) {
  const entity = req.entity
  const username = req.auth.username
  userCtrl.changePoints(username, "updated", 1)

  const { prevBody, nextBody } = req.body

  if (typeof nextBody !== 'undefined') {
    delete nextBody.id
    delete nextBody._id
  }

  if (typeof prevBody !== 'undefined') {
    delete prevBody.id
    delete prevBody._id
  }

  const revision = new Revision({
    entityId: entity._id,
    type: 'UPDATE',
    subEntityId: req.body.subEntityId,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nextBody),
    prevBody: JSON.stringify(prevBody),
  })

  revision.save()
    .then(() => {
      if (shouldReturn) res.status(200).send('Metadata successfully updated.')
    })
    .catch(e => {
      if (shouldReturn) res.status(500).send(e)
    })
}

function addUpdateManyRevision(req, res, next) {
  const username = req.auth.username
  userCtrl.changePoints(username, "updated", 1)

  const { prevBody, nextBody } = req.body

  delete nextBody.id
  delete prevBody.id
  delete nextBody._id
  delete prevBody._id

  const revision = new Revision({
    entityId: 'MANY',
    type: 'UPDATE',
    subtype: req.body.subtype,
    start: req.body.start,
    end: req.body.end,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nextBody),
    prevBody: JSON.stringify(prevBody),
  })

  // add revision record
  revision.save()
    .then(() => {
      res.status(200).send('Areas successfully updated.')
    })
    .catch(e => res.status(500).send(e))
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
  const username = req.auth.username
  const usernameAuthor = revision.user

  userCtrl.changePoints(username, "reverted", 1)
  switch (revision.type) {
    case 'CREATE':
      if (revision.reverted) {
        userCtrl.changePoints(usernameAuthor, "mistakes", -1)
        // post nextBody
        req.body = JSON.parse(revision.nextBody)
        resourceCollection[resource].controller.create(req, res, next, true)
      } else {
        userCtrl.changePoints(usernameAuthor, "mistakes", 1)
        // was post, so delete again by id nextBody
        resourceCollection[resource].controller.remove(req, res, next, true)
      }
      break
    case 'UPDATE':
      if (revision.reverted) {
        userCtrl.changePoints(usernameAuthor, "mistakes", -1)
      // was updated, so put prevBody
        if (revision.entityId === 'MANY') {
          const unpackedObj = unpackObj(JSON.parse(revision.nextBody))
          const areaPromises = Object.keys(unpackedObj).map(year => resourceCollection[resource].controller.revertSingle(req, res, next, year, unpackedObj[year]))
          Promise.all(areaPromises).then(() => {
              // res.status(200).send('Areas revision MANY successfully applied.')
          }, (error) => {
            res.status(500).send(error)
          })
        } else if (revision.subEntityId && revision.resource === 'metadata') {
          req.body.nextBody = JSON.parse(revision.nextBody)
          req.body.subEntityId = revision.subEntityId
          resourceCollection[resource].controller.updateSingle(req, res, next, true)
        } else {
          req.body = JSON.parse(revision.nextBody)
          resourceCollection[resource].controller.update(req, res, next, true)
        }
      } else {
        userCtrl.changePoints(usernameAuthor, "mistakes", 1)
        // update to nextBody
        if (revision.entityId === 'MANY') {
          const unpackedObj = unpackObj(JSON.parse(revision.prevBody))
          const areaPromises = Object.keys(unpackedObj).forEach(year => resourceCollection[resource].controller.revertSingle(req, res, next, year, unpackedObj[year]))
          Promise.all(areaPromises).then(() => {
            res.status(200).send('Areas revision MANY successfully applied.')
          }, (error) => {
            logger.error(error)
          })
        } else if (revision.subEntityId && revision.resource === 'metadata') {
          req.body.nextBody = JSON.parse(revision.prevBody)
          req.body.subEntityId = revision.subEntityId
          resourceCollection[resource].controller.updateSingle(req, res, next, true)
        } else {
          req.body = JSON.parse(revision.prevBody)
          resourceCollection[resource].controller.update(req, res, next, true)
        }
      }
      break
    case 'DELETE':
      if (revision.reverted) {
        userCtrl.changePoints(usernameAuthor, "mistakes", -1)
        // delete by id prevBody
        resourceCollection[resource].controller.remove(req, res, next, true)
      } else {
        userCtrl.changePoints(usernameAuthor, "mistakes", 1)
        // was deleted, so post prevBody
        req.body = JSON.parse(revision.prevBody)
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
  Revision.list({ start, end, sort, order, filter })
    .then((revisions) => {
      if (count) {
        Revision.count().exec().then((revisionCount) => {
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

function unpackObj(obj) {
  const array = Object.keys(obj)
  const unpackedObj = {}
  for (let i = 0; i < array.length; i++) {
    const years = array[i].split('-')
    for (let j = 0; j < years.length; j++) {
      unpackedObj[years[j]] = obj[array[i]]
    }
  }
  return unpackedObj
}

export default { addUpdateRevision, addUpdateSingleRevision, addUpdateManyRevision, addCreateRevision, addDeleteRevision, load, get, update, list, remove }
