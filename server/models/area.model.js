import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'

/**
 * Area Schema
 */
const AreaSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  year: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
}, { versionKey: false })

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */

/**
 * Methods
 */
AreaSchema.method({
})

/**
 * Statics
 */
AreaSchema.statics = {
  /**
   * Get Area
   * @param {ObjectId} id - The objectId of Area.
   * @returns {Promise<Area, APIError>}
   */
  get(id, method = '') {
    return this.findById(id)
      .exec()
      .then((area) => {
        if (area && area.data && method === "GET") {
          return area.data
        } else if (area) {
          return area
        }
        const err = new APIError('No such area exists!', httpStatus.NOT_FOUND)
        return Promise.reject(err)
      })
  },

  /**
   * List areas in descending order of 'createdAt' timestamp.
   * @param {number} offset - Number of year to start from.
   * @param {number} length - Limit number of areas to be returned.
   * @returns {Promise<Area[]>}
   */
  list({ offset = 0, length = 50 } = {}) {
    return this.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(length)
      .exec()
      .then(areas => areas.map((obj) => {
        const dataString = JSON.stringify(obj.data).substring(0, 200)
        obj.data = dataString + ((dataString.length === 203) ? '...' : '')
        return obj
      }))
  }
}

/**
 * @typedef Area
 */
export default mongoose.model('Area', AreaSchema)
