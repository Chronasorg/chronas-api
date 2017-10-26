import jwt from 'jsonwebtoken'
import httpStatus from 'http-status'
import APIError from '../helpers/APIError'
import config from '../../config/config'
import User from '../models/user.model'

/**
 * Returns jwt token if valid username and password is provided
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
function login(req, res, next) {
  User.findById(req.body.username)
    .exec()
    .then((user) => {
      if (user && req.body.username === user.username && req.body.password === user.password) {
        const token = jwt.sign({
          username: user.username,
          privilege: user.privilege ? user.privilege : 1
        }, config.jwtSecret)
        return res.json({
          token,
          username: user.username
        })
      }
      const err = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true)
      return next(err)
    })
    .catch((e) => {
      const err = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true)
      return next(err)
    })
}

export default { login }
