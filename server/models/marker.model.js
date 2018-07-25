import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'
import Metadata from './metadata.model'

const METAtypes = ['cities']
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
  subtype: {
    type: String,
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
  list({ offset = 0, length = 500, sort, order, filter, delta, year = false, typeArray = false, wikiArray = false, format = false, search = false, both = false } = {}) {
    if (year || typeArray || wikiArray || search) {
      // geojson endpoint hit
      const mongoSearchQuery = {}

      if (year) {
        mongoSearchQuery.year = { $gt: (year - delta), $lt: (year + delta) }
      }

      let types = false
      if (typeArray) {
        types = typeArray.split(',')
        mongoSearchQuery.type = { $in: types }
      }

      if (wikiArray) {
        const wikis = wikiArray.split(',')
        mongoSearchQuery._id = { $in: wikis }
      }

      if (search) {
        mongoSearchQuery.$or = [
          {'_id':new RegExp(search, 'i')},
          {'name':new RegExp(search, 'i')}
        ]
      }

      return this.find(mongoSearchQuery)
        .skip(+offset)
        .limit(+length)
        .exec()
        .then((markers) => {
          const metaAreaAddition = []
          const optionalMetadata = new Promise((resolve, reject) => {
            const subtypes = []
            if (!both && !types) resolve([])
            if (!both) {
              types.forEach(t => {
                const isMeta = (METAtypes.indexOf(t) > -1)
                if (isMeta) subtypes.push(t)
              })
            }

            if (!both && subtypes.length === 0) resolve([])

            let searchQuery = { }

            if (both) {
              searchQuery.$or = [
                {'_id':new RegExp(search, 'i')},
                {'name':new RegExp(search, 'i')},
                {'data.title':new RegExp(search, 'i')}
              ]
            } else {
              searchQuery = {
                year: { $gt: (year - delta), $lt: (year + delta) },
                type: "i",
                coo: { $exists: true, $ne: [] },
                subtype: { $in: subtypes }
              }
            }

            Metadata.find(searchQuery)
              .skip(+offset)
              .limit(+length)
              .exec()
              .then((metadata) => {
                if (both) {
                  const areaMetaIds = ['ruler', 'culture', 'capital', 'religion', 'religionGeneral']
                  Metadata.find({_id: { $in: areaMetaIds }})
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
                            metaAreaAddition.push([oIds[index], eO[0], 'ae|' + currId])
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
                return markersPlus.filter(item => !forbiddenTypes.includes((item.subtype || item.type).substr(0,2))).map(item => [item._id, (item.data || {}).title || item.name, item.type + '|' + item.subtype]).concat(metaAreaAddition)
              } else {
                return markersPlus.map(item => item._id)
              }
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
    } else {
      return this.find()
        .sort({ createdAt: -1 })
        .skip(+offset)
        .limit(+length)
        .exec()
    }
  }
}

/**
 * @typedef Marker
 */
export default mongoose.model('Marker', MarkerSchema)
