import express from 'express';

import markerCtrl from '../controllers/marker.controller.js';
import revisionCtrl from '../controllers/revision.controller.js';
import { requireAdmin } from '../helpers/require-auth.js';

const router = express.Router();

router.route('/')
  .all(markerCtrl.defineEntity)
  /** GET /v1/markers - Get list of markers */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    markerCtrl.list)

  /** POST /v1/markers - Create new marker */
  .post(
    requireAdmin,
    revisionCtrl.addCreateRevision,
    // validate(paramValidation.createMarker),
    markerCtrl.create);

router.route('/:markerId')
  .all(markerCtrl.defineEntity)
  /** GET /v1/markers/:markerId - Get marker */
  .get(
    markerCtrl.get)

  /** PUT /v1/markers/:markerId - Update marker */
  .put(
    requireAdmin,
    // validate(paramValidation.updateMarker),
    revisionCtrl.addUpdateRevision,
    markerCtrl.update)

  /** DELETE /v1/markers/:markerId - Delete marker */
  .delete(
    requireAdmin,
    revisionCtrl.addDeleteRevision,
    markerCtrl.remove);

/** Load marker when API with markerId route parameter is hit */
router.param('markerId', markerCtrl.load);

export default router;
