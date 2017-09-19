import express from 'express'
import validate from 'express-validation'
import paramValidation from '../../config/param-validation'
import areaCtrl from '../controllers/area.controller'

const router = express.Router(); // eslint-disable-line new-cap

router.route('/')
  /** GET /v1/areas - Get list of areas */
  .get(areaCtrl.list)

  /** POST /v1/areas - Create new marker */
  .post(validate(paramValidation.createArea), areaCtrl.create);

router.route('/:areaId')
  /** GET /v1/areas/:areaId - Get marker */
  .get(areaCtrl.get)

  /** PUT /v1/areas/:areaId - Update marker */
  .put(validate(paramValidation.updateArea), areaCtrl.update)

  /** DELETE /v1/areas/:areaId - Delete marker */
  .delete(areaCtrl.remove);

/** Load marker when API with areaId route parameter is hit */
router.param('areaId', areaCtrl.load);

export default router;
