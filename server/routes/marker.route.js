import express from 'express'
import validate from 'express-validation'
import expressJwt from 'express-jwt'
import paramValidation from '../../config/param-validation'
import markerCtrl from '../controllers/marker.controller'
import revisionCtrl from '../controllers/revision.controller'
import { config } from '../../config/config'
import checkPrivilege from '../helpers/privileges'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  .all(markerCtrl.defineEntity)
  /** GET /v1/markers - Get list of markers */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    markerCtrl.list)

  /** POST /v1/markers - Create new marker */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(1),
    revisionCtrl.addCreateRevision,
    // validate(paramValidation.createMarker),
    markerCtrl.create)

router.route('/:markerId')
  .all(markerCtrl.defineEntity)
  /** GET /v1/markers/:markerId - Get marker */
  .get(
    markerCtrl.get)

  /** PUT /v1/markers/:markerId - Update marker */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(1),
    // validate(paramValidation.updateMarker),
    revisionCtrl.addUpdateRevision,
    markerCtrl.update)

  /** DELETE /v1/markers/:markerId - Delete marker */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(1),
    revisionCtrl.addDeleteRevision,
    markerCtrl.remove)

/** Load marker when API with markerId route parameter is hit */
router.param('markerId', markerCtrl.load)

export default router
