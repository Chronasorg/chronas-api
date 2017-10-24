import User from '../models/user.model'
import logger from '../../config/winston'
import APIError from '../helpers/APIError'

/**
 * Load user and append to req.
 */
function load(req, res, next, id) {
  User.get(id)
    .then((user) => {
      logger.info("User.get(id)", user)
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
  return res.json(req.user)
}

/**
 * Create new user
 * @property {string} req.body.username - The username of user.
 * @property {string} req.body.privilege - The privilege of user.
 * @returns {User}
 */
function create(req, res, next) {
  User.findById(req.body.username)
    .exec()
    .then((duplicatedUsername) => {
      if (duplicatedUsername) {
        const err = new APIError('This username already exists!', 400)
        next(err)
      }

      const user = new User({
        _id: req.body.username,
        username: req.body.username,
        name: req.body.name,
        education: req.body.education,
        email: req.body.email,
        privilege: req.body.privilege
      })

      user.save()
        .then(savedUser => res.json(savedUser))
        .catch(e => next(e))
    })
    .catch(e => next(e))
}

/**
 * Update existing user
 * @property {string} req.body.username - The username of user.
 * @property {string} req.body.privilege - The privilege of user.
 * @returns {User}
 */
function update(req, res, next) {
  const user = req.user
  if (typeof req.body.username !== 'undefined') user.username = req.body.username
  if (typeof req.body.privilege !== 'undefined') user.privilege = req.body.privilege
  if (typeof req.body.name !== 'undefined') user.name = req.body.name
  if (typeof req.body.education !== 'undefined') user.education = req.body.education
  if (typeof req.body.email !== 'undefined') user.email = req.body.email

  user.save()
    .then(savedUser => res.json(savedUser))
    .catch(e => next(e))
}

/**
 * Get user list.
 * @property {number} req.query.skip - Number of users to be skipped.
 * @property {number} req.query.limit - Limit number of users to be returned.
 * @returns {User[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'createdAt', order = 'asc' } = req.query
  const limit = end - start
  User.list({ start, limit, sort, order })
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

export default { load, get, create, update, list, remove }
