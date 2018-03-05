import Metadata from '../models/metadata.model'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import logger from '../../config/winston'

/**
 * Load metadata and append to req.
 */
function load(req, res, next, id) {
  Metadata.get(id,req.method)
    .then((metadata) => {
      req.metadata = metadata // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

/**
 * Get metadata
 * @returns {Metadata}
 */
function get(req, res) {
  return res.json(req.metadata)
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

  logger.warn("createNodeOne(metadata.data[parentId][childId]",metadata.data[parentId][childId])

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
  if (req.params.metadataId === "items") {
    if (typeof req.body.childValue !== 'undefined') {
      updateNodeOne(req, res, next)
    } else if (typeof req.body.childArrayValue !== 'undefined') {
      updateNodeTwo(req, res, next)
    }
  } else {
    const metadata = req.metadata
    if (typeof req.body._id !== 'undefined') metadata._id = req.body._id
    if (typeof req.body.data !== 'undefined') metadata.data = req.body.data

    metadata.save()
      .then(savedMetadata => res.json(savedMetadata))
      .catch(e => next(e))
  }
}

function updateNodeOne(req, res, next) {
  // metadata is items object
  const metadata = req.metadata
  const parentId = req.body.parentId
  const childId = req.body.childId
  const childValue = req.body.childValue

  if (typeof parentId !== 'undefined' &&
    typeof childId !== 'undefined' &&
    typeof metadata.data[parentId] !== 'undefined' &&
    typeof childValue !== 'undefined'){
    metadata.data[parentId][childId] = childValue
    metadata.markModified('data')
  }

  metadata.save()
    .then(savedMetadata => res.json(savedMetadata))
    .catch(e => next(e))
}

function updateNodeTwo(req, res, next) {
  // metadata is items object
  const metadata = req.metadata
  const parentId = req.body.parentId
  const childId = req.body.childId
  const childArrayValue = req.body.childArrayValue

  if (typeof parentId !== 'undefined' &&
    typeof childId !== 'undefined' &&
    typeof metadata.data[parentId] !== 'undefined' &&
    typeof childArrayValue === 'object') {
    if (typeof metadata.data[parentId][childId] !== 'undefined') {
      childArrayValue.forEach((arrayItem, index) => {
        if (typeof arrayItem !== 'undefined' && arrayItem !== null) {
          metadata.data[parentId][childId][index] = arrayItem
          metadata.markModified('data')
        }
      })
    } else {
      metadata.data[parentId][childId] = childArrayValue
      metadata.markModified('data')
    }
  }

  metadata.save()
    .then(savedMetadata => res.json(savedMetadata))
    .catch(e => next(e))
}

function deleteNodeOne(req, res, next) {
  // metadata is items object
  const metadata = req.metadata
  const parentId = req.body.parentId
  const childId = req.body.childId
  const childValue = req.body.childValue
  const childArrayValue = req.body.childArrayValue

  if (typeof parentId !== 'undefined' &&
    typeof childId !== 'undefined' &&
    typeof metadata.data[parentId] !== 'undefined' &&
    typeof childValue === 'undefined' &&
    typeof childArrayValue === 'undefined'){

    delete metadata.data[parentId][childId]
    metadata.markModified('data')
  }

  metadata.save()
    .then(savedMetadata => res.json(savedMetadata))
    .catch(e => next(e))
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
  Metadata.list({ start, limit, sort, order, filter })
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
function remove(req, res, next) {
  const metadata = req.metadata
  metadata.remove()
    .then(() => next(new APICustomResponse('Metadata deleted successfully', 204, true)))
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

export default { load, get, create, update, list, remove, defineEntity }
