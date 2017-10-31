import express from 'express'
import expressJwt from 'express-jwt'
import validate from 'express-validation'
import paramValidation from '../../config/param-validation'
import areaCtrl from '../controllers/area.controller'
import config from '../../config/config'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  /** GET /v1/areas - Get list of areas */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.list)

  /** POST /v1/areas - Create new area */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    // validate(paramValidation.createArea),
    areaCtrl.create)

router.route('/:areaId')
  /** GET /v1/areas/:areaId - Get area */
  .get(areaCtrl.get)

  /** PUT /v1/areas/:areaId - Update area */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    validate(paramValidation.updateArea),
    areaCtrl.update)

  /** DELETE /v1/areas/:areaId - Delete area */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.remove)

/** Load area when API with areaId route parameter is hit */
router.param('areaId', areaCtrl.load)

export default router
