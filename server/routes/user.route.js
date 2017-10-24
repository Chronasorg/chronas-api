import express from 'express'
import validate from 'express-validation'
import expressJwt from 'express-jwt'
import paramValidation from '../../config/param-validation'
import userCtrl from '../controllers/user.controller'
import config from '../../config/config'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  /** GET /v1/users - Get list of users */
  .get(
    expressJwt({ secret: config.jwtSecret }),
    userCtrl.list)

  /** POST /v1/users - Create new user */
  .post(expressJwt({ secret: config.jwtSecret }),
    validate(paramValidation.createUser),
    userCtrl.create)

router.route('/:userId')
  /** GET /v1/users/:userId - Get user */
  .get(
    // expressJwt({ secret: config.jwtSecret }),
    userCtrl.get)

  /** PUT /v1/users/:userId - Update user */
  .put(
    // expressJwt({secret: config.jwtSecret }),
    // validate(paramValidation.updateUser),
    userCtrl.update)

  /** DELETE /v1/users/:userId - Delete user */
  .delete(
    // expressJwt({ secret: config.jwtSecret }),
    userCtrl.remove)

/** Load user when API with userId route parameter is hit */
router.param('userId', userCtrl.load)

export default router
