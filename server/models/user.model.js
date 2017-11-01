import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'

/**
 * User Schema
 */
const UserSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
  },
  education: {
    type: String
  },
  email: {
    type: String
  },
  privilege: {
    type: Number,
    default: 1,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  karma: {
    type: Number,
    default: 0,
    required: true
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
UserSchema.method({
})

/**
 * Statics
 */
UserSchema.statics = {
  /**
   * Get user
   * @param {ObjectId} id - The objectId of user.
   * @returns {Promise<User, APIError>}
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((user) => {
        if (user) {
          user.id = '_id' // eslint-disable-line no-param-reassign
          return user
        }
        const err = new APIError('No such user exists!', httpStatus.NOT_FOUND)
        return Promise.reject(err)
      })
  },

  /**
   * List users in descending order of 'createdAt' timestamp.
   * @param {number} skip - Number of users to be skipped.
   * @param {number} limit - Limit number of users to be returned.
   * @returns {Promise<User[]>}
   */
  list({ start, limit, sort, order, filter } = {}) {
    const findObject = filter ? saveJSONparse(filter) : {}
    const sortObject = {}
    sortObject[sort] = order.toLowerCase()

    if (Object.prototype.hasOwnProperty.call(findObject, 'q')) {
      findObject.username = new RegExp(findObject.q, 'i')
      delete findObject.q
    }
    return this.find(findObject)
      .sort(sortObject)
      .skip(+start)
      .limit(+limit)
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
 * @typedef User
 */
export default mongoose.model('User', UserSchema)
