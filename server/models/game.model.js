import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import bcrypt from 'bcryptjs'
import APIError from '../helpers/APIError.js'

/**
 * Game Schema
 */
const GameSchema = new mongoose.Schema({
  avatar: {
    type: String
  },
  // _id: {
  //   type: String,
  //   required: true
  // },
  name: {
    type: String,
  },
  gold: {
    type: Number,
    default: 0,
    required: true
  },
  identified: {
    type: Number,
    default: 0,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  duration: {
    type: Number,
    default: 1,
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
GameSchema.method({
})

/**
 * Statics
 */
GameSchema.statics = {
  /**
   * List games in descending order of 'createdAt' timestamp.
   * @param {number} skip - Number of games to be skipped.
   * @param {number} limit - Limit number of games to be returned.
   * @returns {Promise<Game[]>}
   */
  list({ start, limit, sort, order, filter } = {}) {
    const findObject = filter ? saveJSONparse(filter) : {}
    const sortObject = {}
    sortObject[sort] = order.toLowerCase()

    if (Object.prototype.hasOwnProperty.call(findObject, 'q')) {
      findObject.gamename = new RegExp(findObject.q, 'i')
      delete findObject.q
    }
    return this.find(findObject)
      .sort(sortObject)
      .skip(+start)
      .limit(+limit)
      .lean()
      .exec()
  }
}

function saveJSONparse(str) {
  try {
    return JSON.parse(str)
  } catch (e) {
    return {}
  }
}

/**
 * @typedef Game
 */
export default mongoose.model('Game', GameSchema)
