import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import { validate } from '../helpers/validation.js';
import paramValidation from '../../config/param-validation.js';
import metadataCtrl from '../controllers/metadata.controller.js';
import revisionCtrl from '../controllers/revision.controller.js';
import { config } from '../../config/config.js';
import checkPrivilege from '../helpers/privileges.js';

const router = express.Router(); // eslint-disable-line new-cap

router.route('/')
  .all(metadataCtrl.defineEntity)
  /** GET /v1/metadata - Get list of metadata keys */
  .get(metadataCtrl.list)

  /** POST /v1/metadata - Create new metadata */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilegeForTypes(5, ['g']),
    checkPrivilege.checkPrivilege(3),
    revisionCtrl.addCreateRevision,
    // validate(paramValidation.createMetadata),
    metadataCtrl.create);

router.route('/:metadataId')
  .all(metadataCtrl.defineEntity)
  /** GET /v1/metadata/:metadataIds - Get metadata through semicolon delimited ids */
  .get(
    // checkPrivilege.checkPrivilegeForTypes(5, ['g']),
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    metadataCtrl.get)

  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    // validate(paramValidation.updateSingle),
    // checkPrivilege.checkPrivilegeForTypes(5, ['g']),
    checkPrivilege.checkPrivilege(3),
    revisionCtrl.addUpdateRevision,
    metadataCtrl.update)

  /** DELETE /v1/metadata/:metadataId - Delete metadata */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilegeForTypes(5, ['g']),
    checkPrivilege.checkPrivilege(3),
    revisionCtrl.addDeleteRevision,
    metadataCtrl.remove);

router.route('/:metadataId/single')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    // validate(paramValidation.updateSingle),
    checkPrivilege.checkPrivilege(3),
    metadataCtrl.updateSingle,
    revisionCtrl.addUpdateSingleRevision
  );

router.route('/:metadataId/getLinked')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .get(
    metadataCtrl.getLinked
  );

router.route('/:metadataId/addLink')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    validate(paramValidation.updateLink),
    checkPrivilege.checkPrivilege(3),
    metadataCtrl.updateLink(true)
  );

router.route('/:metadataId/removeLink')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    validate(paramValidation.updateLink),
    checkPrivilege.checkPrivilege(3),
    metadataCtrl.updateLink(false)
  );

router.route('/:metadataId/upvote')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    metadataCtrl.vote(1)
  );

router.route('/:metadataId/downvote')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    metadataCtrl.vote(-1)
  );
/** Load metadata when API with metadataId route parameter is hit */
router.param('metadataId', metadataCtrl.load);

export default router;
