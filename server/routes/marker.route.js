import express from 'express';
import validate from 'express-validation';
import expressJwt from 'express-jwt';
import paramValidation from '../../config/param-validation';
import markerCtrl from '../controllers/marker.controller';
import config from '../../config/config';

const router = express.Router(); // eslint-disable-line new-cap

router.route('/')
  /** GET /api/markers - Get list of markers */
  .get(expressJwt({ secret: config.jwtSecret }), markerCtrl.list)

  /** POST /api/markers - Create new marker */
  .post(expressJwt({ secret: config.jwtSecret }), validate(paramValidation.createMarker), markerCtrl.create);

router.route('/:markerId')
  /** GET /api/markers/:markerId - Get marker */
  .get(expressJwt({ secret: config.jwtSecret }), markerCtrl.get)

  /** PUT /api/markers/:markerId - Update marker */
  .put(expressJwt({ secret: config.jwtSecret }), validate(paramValidation.updateMarker), markerCtrl.update)

  /** DELETE /api/markers/:markerId - Delete marker */
  .delete(expressJwt({ secret: config.jwtSecret }), markerCtrl.remove);

/** Load marker when API with markerId route parameter is hit */
router.param('markerId', markerCtrl.load);

export default router;
