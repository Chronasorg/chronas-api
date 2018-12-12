import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import Marker from './marker.model'
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
    type: [Number],
    required: false,
    default: undefined,
    validate: v => typeof v === 'undefined' || v.length === 0 || (v[1] > -90 && v[1] < 90 && v[0] > -180 && v[0] < 180)
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
  /** .np
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
  list({ start = 0, end = 50, sort, order, filter, fList = false, type = false, subtype = false, year = false, delta = false, wiki = false, search = false, discover = false } = {}) {

    let hasEw = false
    if (fList) {
      const cachedInit = cache.get('init')
      if (cachedInit) {
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
        .lean()
        .exec()
        .then((metadata) => {
          const completeRes = metadata.reduce((obj, item) => {
            obj[item._id] = item.data
            return obj
          }, {})
          cache.put('init', completeRes, CACHETTL)
          return completeRes
        })
    }
    else if (type || subtype || year || wiki || search || discover) {
      const subtypes = (subtype) ? subtype.split(',') : ''
      const discovers = (discover) ? discover.split(',') : ''
      hasEw = (subtypes || []).includes("ew")
      const searchQuery = {
        year: { $gt: (year - delta), $lt: (year + delta) },
        type,
        subtype: { $in: subtypes },
        $or: [
          { _id: new RegExp(search, 'i') },
          { name: new RegExp(search, 'i') }
        ]
      }

      if (!type) delete searchQuery.type
      if (!search) delete searchQuery.$or
      if (!subtype) delete searchQuery.subtype
      if (!year) delete searchQuery.year

      if (wiki) searchQuery.wiki = wiki

      if (discover) {
        // find each discover item separately (promise reduce)
        let allDiscoverItems = [[],[]]
        return discovers.reduce(
          (p, typeToSearch) => p.then(() => {
            if (typeToSearch === "e") {
              delete searchQuery.subtype
              searchQuery.type = typeToSearch
            } else {
              searchQuery.type = "i"
              searchQuery.subtype = typeToSearch
            }
            return this.find(searchQuery)
              .skip(+start)
              .limit(+end)
              .sort({ score: 'desc' })
              .lean()
              .exec()
              .then((metadata) => {
                if (typeToSearch === "e") {
                  allDiscoverItems[0] = metadata
                } else {
                  allDiscoverItems[1] = allDiscoverItems[1].concat(metadata)
                }
                
                return 1
              })
              .catch(err => 1)
          }),
          Promise.resolve()
        ).then(() => {
          return allDiscoverItems
        })
      }
      else {
        return this.find(searchQuery)
          .skip(+start)
          .limit(+end)
          .sort({ score: 'desc' })
          .lean()
          .exec()
          .then((metadata) => {
            if (search) {
              return metadata.map(item => item._id)
            }
            else if (hasEw) {
              return Marker.find({
                "type": "b",
                "partOf": { $exists: true}
              })
                .lean()
                .exec()
                .then((markers) => {
                  var resObj = {}
                  markers.forEach((el) => {
                    if (!resObj[el.partOf]) {
                      resObj[el.partOf] = [[el.name, el.year]]
                    }
                    else {
                      resObj[el.partOf].push([el.name, el.year])
                    }
                  })
                  metadata.unshift(resObj)
                  return metadata
                })
            } else {
              return metadata
            }
          })
      }
    }
    else {
      return this.find()
        .skip(+start)
        .limit(+end)
        .sort({ score: 'desc' })
        .lean()
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
