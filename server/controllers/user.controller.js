import User from '../models/user.model'
import logger from '../../config/winston'
import APIError from '../helpers/APIError'

/**
 * Load user and append to req.
 */
function load(req, res, next, id) {
  User.get(id)
    .then((user) => {
      req.user = user // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

/**
 * Get user
 * @returns {User}
 */
function get(req, res) {
  const userPlus = req.user.toObject()
  userPlus.id = userPlus._id
  return res.json(userPlus)
}

/**
 * Create new user
 * @property {string} req.body.username - The username of user.
 * @property {string} req.body.privilege - The privilege of user.
 * @returns {User}
 */
function create(req, res, next) {
  User.findById(req.body.id || req.body.username)
    .exec()
    .then((duplicatedUsername) => {
      if (duplicatedUsername) {
        if (!req.body.thirdParty) {
          const err = new APIError('This username already exists!', 400)
          return next(err)
        }
        duplicatedUsername.loginCount += 1
        return duplicatedUsername.save()
      }

      const user = new User({
        _id: req.body.id || req.body.username,
        avatar: req.body.avatar,
        website: req.body.website,
        username: req.body.username,
        name: req.body.name,
        password: req.body.password,
        education: req.body.education,
        email: req.body.email,
        authType: req.body.authType || 'chronas',
        privilege: req.body.privilege
      })

      return user.save()
        .then((savedUser) => {
          if (!req.body.thirdParty) {
            res.json(savedUser)
          }
        })
        .catch((e) => {
          if (!req.body.thirdParty) {
            next(e)
          }
        })
    })
    .catch((e) => {
      if (!req.body.thirdParty) {
        next(e)
      }
    })
}

/**
 * Update existing user
 * @property {string} req.body.username - The username of user.
 * @property {string} req.body.privilege - The privilege of user.
 * @returns {User}
 */
function update(req, res, next) {
  const user = req.user
  if (typeof req.body.avatar !== 'undefined') user.avatar = req.body.avatar
  if (typeof req.body.username !== 'undefined') user.username = req.body.username
  if (typeof req.body.name !== 'undefined') user.name = req.body.name
  if (typeof req.body.privilege !== 'undefined') user.privilege = req.body.privilege
  if (typeof req.body.education !== 'undefined') user.education = req.body.education
  if (typeof req.body.createdAt !== 'undefined') user.createdAt = req.body.createdAt
  if (typeof req.body.email !== 'undefined') user.email = req.body.email
  if (typeof req.body.karma !== 'undefined') user.karma = req.body.karma
  if (typeof req.body.website !== 'undefined') user.website = req.body.website
  if (typeof req.body.password !== 'undefined') user.password = req.body.password

  user.save()
    .then(savedUser => res.json(savedUser))
    .catch(e => next(e))
}

function changeKarma(username, karmaDelta) {
  User.findOne({ username })
    .exec()
    .then((user) => {
      if (typeof user !== 'undefined') {
        user.karma += karmaDelta
        user.save()
      }
    })
}

/**
 * Get user list.
 * @property {number} req.query.skip - Number of users to be skipped.
 * @property {number} req.query.limit - Limit number of users to be returned.
 * @returns {User[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'createdAt', order = 'asc', filter = '' } = req.query
  const limit = end - start
  User.list({ start, limit, sort, order, filter })
    .then((users) => {
      if (count) {
        User.find().count({}).exec().then((userCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', userCount)
          res.json(users)
        })
      } else {
        res.json(users)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete user.
 * @returns {User}
 */
function remove(req, res, next) {
  const user = req.user
  user.remove()
    .then(deletedUser => res.json(deletedUser))
    .catch(e => next(e))
}

export default { changeKarma, load, get, create, update, list, remove }
