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
  coo: {
    type: Array,
  },
  type: {
    type: String,
    required: true
  },
  year: {
    type: Number, // Epoch
  },
  wiki: {
    type: String,
    required: true
  }
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
  list({ offset = 0, length = 500, sort, order, filter, delta, year = false, typeArray = false } = {}) {
    if (year) {
      // geojson endpoint hit
      if (typeArray) {
        const types = typeArray.split(',')
        return this.find({
          type: { $in: types },
          year: { $gt: (year - delta), $lt: (year + delta) },
        })
        .sort({ createdAt: -1 })
          .skip(+offset)
          .limit(+length)
          .exec().map(feature => ({
            properties: {
              n: feature.name,
              w: feature.wiki,
              y: feature.year,
              t: feature.type,
            },
            geometry: {
              coordinates: feature.coo,
              type: 'Point'
            },
            type: 'Feature'
          }))
      }
      return this.find({
        year: { $gt: (year - delta), $lt: (year + delta) },
      })
        .sort({ createdAt: -1 })
        .skip(+offset)
        .limit(+length)
        .exec().map(feature => ({
          properties: {
            n: feature.name,
            w: feature.wiki,
            y: feature.year,
            t: feature.type,
          },
          geometry: {
            coordinates: feature.coo,
            type: 'Point'
          },
          type: 'Feature'
        }))
    }
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
