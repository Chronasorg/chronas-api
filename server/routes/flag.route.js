import express from 'express'
import validate from 'express-validation'
import expressJwt from 'express-jwt'
import paramValidation from '../../config/param-validation'
import flagCtrl from '../controllers/flag.controller'
import { config } from '../../config/config'
import checkPrivilege from '../helpers/privileges'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  /** GET /v1/flags - Get list of flags */
  .get(
    flagCtrl.list)

  /** POST /v1/flags - Create new flag */
  .post(
    // validate(paramValidation.createMarker),
    flagCtrl.create)

router.route('/:flagId')
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    flagCtrl.update)

  /** DELETE /v1/flags/:flagId - Delete flag */
  .delete(
    flagCtrl.remove)

/** Load flag when API with flagId route parameter is hit */
router.param('flagId', flagCtrl.load)

export default router
