import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import { validate } from '../helpers/validation.js';
import paramValidation from '../../config/param-validation.js';
import collectionCtrl from '../controllers/collection.controller.js';
import markerCtrl from '../controllers/marker.controller.js';
import { config } from '../../config/config.js';
import checkPrivilege from '../helpers/privileges.js';

const router = express.Router(); // eslint-disable-line new-cap

router.route('/')
  /** GET /v1/collections - Get list of collections */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    // checkPrivilege.checkPrivilege(1),
    collectionCtrl.list)

  /** POST /v1/collections - Create new collection */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(1),
    // validate(paramValidation.createMarker),
    collectionCtrl.create);

router.route('/slides')
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(1),
    collectionCtrl.updateBookmark);

router.route('/:collectionId')
  .get(
    collectionCtrl.get)
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(1),
    collectionCtrl.update)

  /** DELETE /v1/collections/:collectionId - Delete collection */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(1),
    collectionCtrl.remove);

/** Load collection when API with collectionId route parameter is hit */
router.param('collectionId', collectionCtrl.load);

export default router;
