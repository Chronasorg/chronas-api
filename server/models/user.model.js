import Promise from 'bluebird'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import bcrypt from 'bcrypt'
import APIError from '../helpers/APIError'

const SALT_WORK_FACTOR = 10

/**
 * User Schema
 */
const UserSchema = new mongoose.Schema({
  avatar: {
    type: String
  },
  _id: {
    type: String,
    required: true,
    index: { unique: true }
  },
  username: {
    type: String,
  },
  loginCount: {
    type: Number,
    default: 1,
    required: true
  },
  password: {
    type: String,
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
  authType: {
    type: String,
    default: 'Chronas',
    required: true
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
  lastUpdated: {
    type: Date,
    default: Date.now,
    required: true
  },
  count_voted: {
    type: Number,
    default: 0,
    required: true
  },
  count_deleted: {
    type: Number,
    default: 0,
    required: true
  },
  count_updated: {
    type: Number,
    default: 0,
    required: true
  },
  count_reverted: {
    type: Number,
    default: 0,
    required: true
  },
  count_created: {
    type: Number,
    default: 0,
    required: true
  },
  count_mistakes: {
    type: Number,
    default: 0,
    required: true
  },
  website: {
    type: String
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
UserSchema.method({
})

UserSchema.pre('save', function (next) {
  const user = this

// only hash the password if it has been modified (or is new)
  if (!user.isModified('password')) return next()

// generate a salt
  return bcrypt.genSalt(SALT_WORK_FACTOR, (err, salt) => {
    if (err) return next(err)

    if (typeof user.password !== "undefined") {
      // hash the password using our new salt
      return bcrypt.hash(user.password, salt, (err2, hash) => {
        if (err2) return next(err2)

        // override the cleartext password with the hashed one
        user.password = hash
        return next()
      })
    } else {
      return next()
    }
  })
})

UserSchema.methods.comparePassword = function (candidatePassword, cb) {
  bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
    if (err) return cb(err)
    return cb(null, isMatch)
  })
}

/**
 * Statics
 */
UserSchema.statics = {
  // comparePassword(candidatePassword, cb) {
  //   bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
  //     if (err) return cb(err)
  //     cb(null, isMatch)
  //   })
  // },
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
