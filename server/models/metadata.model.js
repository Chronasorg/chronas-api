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
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
})

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
    return this.findById(id)
      .exec()
      .then((metadata) => {
        if (metadata.data && method === "GET") {
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
  list({ offset = 0, length = 50, sort, order, filter, fList = false } = {}) {
    if (fList) {
      const resourceArray = fList.split(',')
      return this.find({
        '_id': { $in: resourceArray } })
        .exec()
        .then(metadata => metadata.reduce((obj, item) => {
          obj[item._id] = item.data
          return obj
        }, {}))
    } else {
          return this.find()
            .sort({ _id: 1 })
            .skip(+offset)
            .limit(+length)
            .exec()
            .then(metadata => metadata.map((obj) => {
              const dataString = JSON.stringify(obj.data).substring(0, 200)
              obj.data = dataString + ((dataString.length === 203) ? '...' : '')
              return obj
            }))
    }
  }
}

/**
 * @typedef Metadata
 */
export default mongoose.model('Metadata', MetadataSchema)
