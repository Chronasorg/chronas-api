import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'

/**
 * Metadata Schema
 */
const MetadataSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'g',
    required: true,
    index: true
  },
  linked: {
    type: String,
  },
  subtype: {
    type: String,
  },
  year: {
    type: Number,
    index: true
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
  /**
   * Get Metadata
   * @param {key} key - The key of Metadata.
   * @returns {Promise<Metadata, APIError>}
   */
  get(id, method = '') {
    return this.find({
      _id: id
    })
      .exec()
      .then((metadata) => {
        if (metadata.data && method === 'GET') {
          return metadata.data
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
  list({ start = 0, end = 50, sort, order, filter, fList = false, type = false, subtype = false, year = false, delta = false } = {}) {
    if (fList) {
      const resourceArray = fList.split(',')
      return this.find({
        _id: { $in: resourceArray } })
        .exec()
        .then(metadata => metadata.reduce((obj, item) => {
          obj[item._id] = item.data
          return obj
        }, {}))
    } else if (type || subtype || year) {
      console.debug(type, subtype, year)
      const searchQuery = {
        year: { $gt: (year - delta), $lt: (year + delta) },
        type,
        subtype,
      }

      if (!type) delete searchQuery.type
      if (!subtype) delete searchQuery.subtype
      if (!year) delete searchQuery.year

      return this.find(searchQuery)
        .skip(+start)
        .limit(+end)
        .exec()
        .then(metadata => metadata.map(item => item))
    }
    return this.find()
        .sort({ _id: 1 })
        .skip(+start)
        .limit(+end)
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
