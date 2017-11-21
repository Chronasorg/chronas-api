import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'

/**
 * Marker Schema
 */
const MarkerSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  name: {
    type: String,
  },
  geo: {
    type: Array,
  },
  type: {
    type: String,
    required: true
  },
  subtype: {
    type: String,
  },
  start: {
    type: Number,
  },
  end: {
    type: Number,
  },
  date: {
    type: Number, // Epoch
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  rating: {
    type: Number,
    default: 1
  }
})

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */

/**
 * Methods
 */
MarkerSchema.method({
})

/**
 * Statics
 */
MarkerSchema.statics = {
  /**
   * Get Marker
   * @param {ObjectId} id - The objectId of Marker.
   * @returns {Promise<Marker, APIError>}
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((marker) => {
        if (marker) {
          return marker
        }
        const err = new APIError('No such marker exists!', httpStatus.NOT_FOUND)
        return Promise.reject(err)
      })
  },

  /**
   * List markers in descending order of 'createdAt' timestamp.
   * @param {number} offset - Number of year to start from.
   * @param {number} length - Limit number of markers to be returned.
   * @returns {Promise<Marker[]>}
   */
  list({ offset = 0, length = 50 } = {}) {
    return this.find()
      .sort({ createdAt: -1 })
      .skip(+offset)
      .limit(+length)
      .exec()
  }
}

/**
 * @typedef Marker
 */
export default mongoose.model('Marker', MarkerSchema)
