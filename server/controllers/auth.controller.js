import jwt from 'jsonwebtoken'
import httpStatus from 'http-status'
import Moniker from 'moniker'
import APIError from '../helpers/APIError'
import config from '../../config/config'
import User from '../models/user.model'
import userCtrl from '../controllers/user.controller'
/**
 * Returns jwt token if valid username and password is provided
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
function login(req, res, next) {
  User.findById(req.body.email)
    .exec()
    .then((user) => {
      if (user && req.body.email === user.email) {
        return user.comparePassword(req.body.password, (err, isMatch) => {
          if (err) {
            return next(err)
          } else if (!isMatch) {
            const err2 = new APIError('Authentication error', httpStatus.UNAUTHORIZED, true)
            return next(err2)
          }
          const token = jwt.sign({
            id: user._id,
            username: user.username,
            lastUpdated: user.lastUpdated,
            privilege: user.privilege ? user.privilege : 1
          }, config.jwtSecret)
          return res.json({
            token,
            username: user.username
          })
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


/**
 * Returns jwt token and registers user if email not duplicate
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */

function signup(req, res, next) {
  req.body.signup = true
  req.body.username = (req.body.first_name && req.body.last_name) ? req.body.first_name + ' ' + req.body.last_name
    : (req.body.first_name) ? req.body.first_name
      : (req.body.last_name) ? req.body.last_name : Moniker.choose()

  userCtrl.create(req, res, next)
}

export default { login, signup }
