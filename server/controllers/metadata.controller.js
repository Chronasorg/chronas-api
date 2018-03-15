import Metadata from '../models/metadata.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import logger from '../../config/winston'

/**
 * Load metadata and append to req.
 */
function load(req, res, next, id) {
  Metadata.get(id, req.method)
    .then((metadata) => {
      req.entity = metadata // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

/**
 * Get metadata
 * @returns {Metadata}
 */
function get(req, res) {
  return res.json(req.entity)
}

/**
 * Create new metadata
 * @property {string} req.body.key - The key of metadata.
 * @property {string} req.body.data - The data of metadata.
 * @returns {Metadata}
 */
function create(req, res, next) {
  Metadata.findById(req.body._id)
    .exec()
    .then((foundMetadata) => {
      if (foundMetadata && !req.body.parentId) {
        const err = new APIError('This id already exists!', 400)
        next(err)
      }
      else if (foundMetadata && req.body.parentId) {
        createNodeOne(foundMetadata, req, res, next)
      }
      else {
        const metadata = new Metadata({
          _id: req.body._id,
          data: req.body.data,
        })

        metadata.save({ checkKeys: false })
          .then(savedMetadata => res.json(savedMetadata))
          .catch(e => next(e))
      }
    })
    .catch(e => next(e))
}

function createNodeOne(metadata, req, res, next) {
  const parentId = req.body.parentId
  const childId = req.body.childId
  const childValue = req.body.childValue

  if (typeof metadata.data[parentId] !== 'undefined' &&
    typeof metadata.data[parentId][childId] !== 'undefined') {
    res.status(400).send("This entity already exists.")
  }

  if (typeof parentId !== 'undefined' &&
    typeof childId !== 'undefined' &&
    typeof metadata.data[parentId] !== 'undefined' &&
    typeof metadata.data[parentId][childId] === 'undefined' &&
    typeof childValue !== 'undefined') {
    metadata.data[parentId][childId] = childValue
    metadata.markModified('data')
  }

  metadata.save()
    .then(savedMetadata => res.json({}))
    .catch(e => next(e))
}

/**
 * Update existing metadata
 * @property {string} req.body.key - The key of metadata.
 * @property {string} req.body.data - The data of metadata.
 * @returns {Metadata}
 */
function update(req, res, next) {
  const metadata = req.entity
  if (typeof req.body._id !== 'undefined') metadata._id = req.body._id
  if (typeof req.body.data !== 'undefined') metadata.data = req.body.data

  metadata.save()
    .then(savedMetadata => res.json(savedMetadata))
    .catch(e => next(e))
}

function updateSingle(req, res, next, fromRevision = false) {
  const metadata = req.entity
  const subEntityId = req.body.subEntityId
  const nextBody = req.body.nextBody

  req.body.prevBody = metadata.data[subEntityId] || -1

  if (nextBody === -1) {
    // remove attribute again
    delete metadata.data[subEntityId]
  } else {
    metadata.data[subEntityId] = nextBody
  }

  metadata.markModified('data')
  metadata.save()
    .then(() => { if (!fromRevision) next() })
    .catch(e => { if (!fromRevision) next(e) })
}

/**
 * Get metadata list.
 * @property {number} req.query.offset - Number of metadata to be skipped.
 * @property {number} req.query.length - Limit number of metadata to be returned.
 * @returns {Metadata[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'createdAt', order = 'asc', filter = '' } = req.query
  const limit = end - start
  const fList = req.query.f || false
  Metadata.list({ start, limit, sort, order, filter, fList })
    .then((metadata) => {
      if (count) {
        Metadata.find().count({}).exec().then((metadataCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', metadataCount)
          res.json(metadata)
        })
      } else {
        res.json(metadata)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete metadata.
 * @returns {Metadata}
 */
function remove(req, res, next, fromRevision = false) {
  const metadata = req.entity
  metadata.remove()
    .then((deletedMarker) => {
      if (!fromRevision) {
        res.json(deletedMarker)
      }
    })
    .catch(e => next(e))
}
// TODO: add revision for add delete update of nested items
// { "_id": "items", "parentId": "relPlus", "childId": "c1halcedonism", "childValue": [
//   "C1atholicism",
//   "rgb(204,204,0)",
//   "History_of_the_Catholic_Church"
// ] }

function defineEntity(req, res, next) {
  req.resource = 'metadata'
  next()
}

export default { defineEntity, load, get, create, update, updateSingle, list, remove }
