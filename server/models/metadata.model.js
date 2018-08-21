import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'
import { cache } from '../../config/config'

// const MAXCACHEDIMAGES = 2
const CACHETTL = 1000 * 60 * 60 * 24 * 7 // 1 week

/**
 * Metadata Schema
 */
const MetadataSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  name: {
    type: String,
  },
  coo: {
    type: Array,
    required: false
  },
  type: {
    type: String,
    default: 'g',
    required: true,
    index: true
  },
  wiki: {
    type: String,
  },
  subtype: {
    type: String
  },
  year: {
    type: Number,
    index: true
  },
  score: {
    type: Number,
    default: 0,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
}, { versionKey: false })

/**
 * Methods
 */
MetadataSchema.method({
})

/**
 * Statics
 */
MetadataSchema.statics = {
  /**.np
   * Get Metadata
   * Metadata.
   * @returns {Promise<Metadata, APIError>}
   */
  get(id, method = '') {
    return this.findOne({
      _id: id
    })
      .exec()
      .then((metadata) => {
        if (metadata.data && method === 'GET') {
          return metadata
        } else if (metadata) {
          return metadata
        }
        const err = new APIError('No such metadata exists!', httpStatus.NOT_FOUND)
        return Promise.reject(err)
      })
  },

  /**
   * List metadata in descending order of 'createdAt' timestamp.
   * @param {number} offset - Number of year to start from.
   * @param {number} length - Limit number of metadata to be returned.
   * @returns {Promise<Metadata[]>}
   */
  list({ start = 0, end = 50, sort, order, filter, fList = false, type = false, subtype = false, year = false, delta = false, wiki = false, search = false } = {}) {
    if (fList) {
      const cachedInit = cache.get('init')
      if (cachedInit) {
        console.debug('returning saved')
        return new Promise((resolve) => { resolve(cachedInit) })
      }

      const resourceArray = fList.split(',')
      const findObject = {
        _id: { $in: resourceArray }
      }

      if (type) {
        findObject.type = type
      }
      if (subtype) {
        findObject.type = subtype
      }

      return this.find(findObject)
        .exec()
        .then(metadata => {
          const completeRes = metadata.reduce((obj, item) => {
            obj[item._id] = item.data
            return obj
          }, {})
          cache.put('init', completeRes, CACHETTL)
          return completeRes
        })
    }
    else if (type || subtype || year || wiki || search) {
      const subtypes = (subtype) ? subtype.split(',') : ''
      const searchQuery = {
        year: { $gt: (year - delta), $lt: (year + delta) },
        type,
        subtype: { $in: subtypes },
        $or: [
          {'_id': new RegExp(search, 'i')},
          {'name': new RegExp(search, 'i')}
        ]
      }

      if (!type) delete searchQuery.type
      if (!search) delete searchQuery.$or
      if (!subtype) delete searchQuery.subtype
      if (!year) delete searchQuery.year

      if (wiki) searchQuery.wiki = wiki

      return this.find(searchQuery)
        .skip(+start)
        .limit(+end)
        .sort({ score: 'desc' })
        .exec()
        .then((metadata) => {

          if (search) {
            return metadata.map(item => item._id)
          } else {
            return metadata.map(item => item)
          }
        })
    }
    return this.find()
        .skip(+start)
        .limit(+end)
        .sort({ score: 'desc' })
        .exec()
        .then(metadata => metadata.map((obj) => {
          const dataString = JSON.stringify(obj.data).substring(0, 200)
          obj.data = dataString + ((dataString.length === 203) ? '...' : '')
          return obj
        }))
  }
}

/**
 * @typedef Metadata
 */
export default mongoose.model('Metadata', MetadataSchema)
