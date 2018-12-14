import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'
import Metadata from './metadata.model'

const METAtypes = ['c']
/**
 * Marker Schema
 */
const MarkerSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  name: {
    type: String,
  },
  capital: {
    type: Array,
    default: undefined,
  },
  partOf: {
    type: String,
  },
  coo: {
    type: [Number], // long lat
    default: undefined,
    validate: v => typeof v === 'undefined' || v.length === 0 || (v[1] > -90 && v[1] < 90 && v[0] > -180 && v[0] < 180)
  },
  subtype: {
    type: String
  },
  year: {
    type: Number,
    min: -2000,
    max: 2000,
  },
  end: {
    type: Number,
    min: -2000,
    max: 2000,
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
  list({ offset = 0, length = 2000, sort, order, filter, delta, year = false, typeArray = false, wikiArray = false, format = false, search = false, includeMarkers = true, both = false } = {}) {
    if (+length === 0) {
      return new Promise((resolve) => { resolve([]) })
    }

    if (year || typeArray || wikiArray || search) {
      // geojson endpoint hit
      let mongoSearchQuery = {}

      if (year) {
        mongoSearchQuery.year = {
          $gt: (year - delta),
          $lt: (year + delta)
        }
      }

      let types = false
      if (typeArray) {
        types = typeArray.split(',')
        if (year) {
          const types1 = types.filter(el => el === 'c' || el === 'ca')
          const types2 = types.filter(el => el !== 'c' && el !== 'ca')
          const AND1 = {
            type: { $in: types1 },
            coo: { $exists: true },
            year: {
              $lt: (year),
            },
            $or: [
              { end: { $exists: false } },
              { end: { $gt: (year) } }
            ]
          }

          const AND2 = {
            type: { $in: types2 },
            coo: { $exists: true },
            year: {
              $gt: (year - delta),
              $lt: (year + delta)
            }
          }
          mongoSearchQuery = {
            $or: [
              AND1,
              AND2
            ]
          }
        } else {
          mongoSearchQuery.type = { $in: types }
          // mongoSearchQuery.capital = { $exists: true }
        }
      }

      if (wikiArray) {
        const wikis = wikiArray.split(',')
        mongoSearchQuery._id = { $in: wikis }
      }

      if (search) {
        mongoSearchQuery.$or = [
          { _id: new RegExp(search, 'i') },
          { name: new RegExp(search, 'i') }
        ]
      }

      if (!includeMarkers) {
        mongoSearchQuery.type = { $in: [] }
        delete mongoSearchQuery.$or
      }

      const optionalMarkerQuery = new Promise((resolve, reject) => {
        if (includeMarkers) {
          this.find(mongoSearchQuery)
            .skip(+offset)
            .limit(+length)
            .lean()
            .exec()
            .then((markers) => { resolve(markers) })
        } else {
          resolve([])
        }
      })

      return optionalMarkerQuery
        .then((markers) => {
          const metaAreaAddition = []
          const optionalMetadata = new Promise((resolve, reject) => {
            const subtypes = []
            if (!both && !types) resolve([])
            if (!both) {
              types.forEach((t) => {
                const isMeta = (METAtypes.indexOf(t) > -1)
                if (isMeta) subtypes.push(t)
              })
            }

            if (!both && subtypes.length === 0) resolve([])

            let searchQuery = { }

            if (both) {
              searchQuery.$or = [
                { _id: new RegExp(search, 'i') },
                { name: new RegExp(search, 'i') },
                { 'data.title': new RegExp(search, 'i') }
              ]
            } else {
              searchQuery = {
                year: { $gt: (year - delta), $lt: (year + delta) },
                type: 'i',
                // coo: { $exists: true, $ne: [] },
                subtype: { $in: subtypes }
              }
            }

            Metadata.find(searchQuery)
              .skip(+offset)
              .limit(+length)
              .lean()
              .exec()
              .then((metadata) => {
                if (both) {
                  const areaMetaIds = ['ruler', 'culture', 'capital', 'religion', 'religionGeneral']
                  Metadata.find({ _id: { $in: areaMetaIds } })
                    .lean()
                    .exec()
                    .then((areaMeta) => {
                      const lowerSearch = search.toLowerCase()
                      areaMeta.forEach((aM) => {
                        let addCounter = 0
                        const currId = aM._id
                        const oIds = Object.keys(aM.data)
                        const oValues = Object.values(aM.data)
                        for (const [index, eO] of oValues.entries()) {
                          if (eO[0] && eO[0].toLowerCase().indexOf(lowerSearch) > -1) {
                            addCounter++
                            metaAreaAddition.push([oIds[index], eO[0], `ae|${currId}`])
                          }
                          if (addCounter > 2) break
                        }
                      })
                      resolve(metadata)
                    })
                } else {
                  resolve(metadata)
                }
              })
              .catch(() => resolve([]))
          })

          return optionalMetadata.then((metaRes) => {
            const markersPlus = markers.map((item) => {
              if (!item.subtype) item.subtype = item.type
              item.type = 'w'
              return item
            }).concat(metaRes)
            if (search) {
              if (both) {
                const forbiddenTypes = ['g', 'a_', 'ap']
                return metaAreaAddition.concat(markersPlus.filter(item => !forbiddenTypes.includes((item.subtype || item.type).substr(0, 2))).map(item => [item._id, (item.data || {}).title || item.name, `${item.type}|${item.subtype}`]))
              }
              return markersPlus.map(item => item._id)
            } else if (format && format.toLowerCase() === 'geojson') {
              return markersPlus.map(feature => ({
                properties: {
                  n: feature.mongod,
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
            }
            return markersPlus
          })
        })
    }
    return this.find()
      .sort({ createdAt: -1 })
      .skip(+offset)
      .limit(+length)
      .lean()
      .exec()
  }
}

/**
 * @typedef Marker
 */
export default mongoose.model('Marker', MarkerSchema)
