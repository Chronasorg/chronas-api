import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'

/**
 * User Schema
 */
const UserSchema = new mongoose.Schema({
  username: {
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
    type: String,
    default: 'user',
    required: true
  },
  status: {
    type: String,
    default: 'inactive',
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
  },
  edits: {
    type: Number,
    default: 0,
    required: true
  },
  comments: {
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
  list({ skip = 0, limit = 50 } = {}) {
    return this.find()
      .sort({ createdAt: -1 })
      .skip(+skip)
      .limit(+limit)
      .exec()
  }
}

/**
 * @typedef User
 */
export default mongoose.model('User', UserSchema)
