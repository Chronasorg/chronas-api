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
  list({ offset = 0, length = 500, sort, order, filter, delta, year = false, typeArray = false, wikiArray = false, format = false, search = false } = {}) {
    if (year || typeArray || wikiArray || search) {
      // geojson endpoint hit
      const mongoSearchQuery = {}

      if (year) {
        mongoSearchQuery.year = { $gt: (year - delta), $lt: (year + delta) }
      }

      if (typeArray) {
        const types = typeArray.split(',')
        mongoSearchQuery.type = { $in: types }
      }

      if (wikiArray) {
        const wikis = wikiArray.split(',')
        mongoSearchQuery._id = { $in: wikis }
      }

      if (search) {
        mongoSearchQuery._id = new RegExp(search, 'i')
      }

      return this.find(mongoSearchQuery)
        .sort({ createdAt: -1 })
        .skip(+offset)
        .limit(+length)
        .exec()
        .then((markers) => {
          if (search) {
            return markers.map(item => item._id)
          } else if (format && format.toLowerCase() === 'geojson') {
            return markers.map(feature => ({
              properties: {
                n: feature.name,
                w: feature._id,
                y: feature.year,
                t: feature.type,
              },
              geometry: {
                coordinates: feature.coo,
                type: 'Point'
              },
              type: 'Feature'
            }))
          } else {
            return markers
          }
        })
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
