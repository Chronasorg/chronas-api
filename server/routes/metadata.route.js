import express from 'express'
import validate from 'express-validation'
import expressJwt from 'express-jwt'
import paramValidation from '../../config/param-validation'
import metadataCtrl from '../controllers/metadata.controller'
import revisionCtrl from '../controllers/revision.controller'
import config from '../../config/config'
import checkPrivilege from '../helpers/privileges'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  .all(metadataCtrl.defineEntity)
  /** GET /v1/metadata - Get list of metadata keys */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    metadataCtrl.list)

  /** POST /v1/metadata - Create new metadata */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(1),
    revisionCtrl.addCreateRevision,
    // validate(paramValidation.createMetadata),
    metadataCtrl.create)

router.route('/:metadataId')
  /** GET /v1/metadata/:metadataIds - Get metadata through semicolon delimited ids */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    metadataCtrl.get)

  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(1),
    revisionCtrl.addUpdateRevision,
    // validate(paramValidation.updateMetadata),
    metadataCtrl.update)

  /** DELETE /v1/metadata/:metadataId - Delete metadata */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(1),
    revisionCtrl.addDeleteRevision,
    metadataCtrl.remove)

/** Load metadata when API with metadataId route parameter is hit */
router.param('metadataId', metadataCtrl.load)

export default router
