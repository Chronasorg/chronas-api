import express from 'express'
import expressJwt from 'express-jwt'
import validate from 'express-validation'
import paramValidation from '../../config/param-validation'
import areaCtrl from '../controllers/area.controller'
import revisionCtrl from '../controllers/revision.controller'
import config from '../../config/config'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas - Get list of areas */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.list)

  /** PUT /v1/areas/ - Update area */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    // validate(paramValidation.updateArea),
    areaCtrl.updateMany,
    revisionCtrl.addUpdateManyRevision)

  /** POST /v1/areas - Create new area */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    revisionCtrl.addCreateRevision,
    // validate(paramValidation.createArea),
    areaCtrl.create)

router.route('/:areaId')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas/:areaId - Get area */
  .get(areaCtrl.get)

  /** PUT /v1/areas/:areaId - Update area */
  .put(expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    // validate(paramValidation.updateArea),
    revisionCtrl.addUpdateRevision,
    areaCtrl.update)

  /** DELETE /v1/areas/:areaId - Delete area */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    revisionCtrl.addDeleteRevision,
    areaCtrl.remove)

/** Load area when API with areaId route parameter is hit */
router.param('areaId', areaCtrl.load)

export default router
