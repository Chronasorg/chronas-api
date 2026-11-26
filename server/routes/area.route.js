import express from 'express';
import httpStatus from 'http-status';

import areaCtrl from '../controllers/area.controller.js';
import revisionCtrl from '../controllers/revision.controller.js';
import { adminWrites } from '../helpers/require-auth.js';

const router = express.Router();

// The aggregation endpoints (aggregateProvinces, aggregateMetaCoo,
// aggregateDimension) streamed every year through a database cursor, which
// the DynamoDB models don't have, so they have not worked since the
// migration. Retired on 2026-10-15; no frontend calls them.
const aggregationGone = (_req, res) => res.status(httpStatus.GONE).json({
  message: 'The area aggregation API has been retired.'
});
router.route('/aggregateProvinces').all(aggregationGone);
router.route('/aggregateMetaCoo').all(aggregationGone);
router.route('/aggregateDimension').all(aggregationGone);

// Every write on this router is for admins; checked before any loader runs.
adminWrites(router);

router.route('/')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas - Get list of areas */
  .get(areaCtrl.list)

  /** PUT /v1/areas/ - Update area */
  .put(
    areaCtrl.updateMany,
    revisionCtrl.addUpdateManyRevision)

  /** POST /v1/areas - Create new area */
  .post(
    // revisionCtrl.addCreateRevision,
    // validate(paramValidation.createArea),
    areaCtrl.create);

router.route('/replace')
  .all(areaCtrl.defineEntity)
  /** PUT /v1/areas/replace - Replace a ruler, culture or religion across a year range */
  .put(
    areaCtrl.replaceAll,
    revisionCtrl.addUpdateManyRevision);

router.route('/:areaId')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas/:areaId - Get area */
  .get(areaCtrl.get)

  /** PUT /v1/areas/:areaId - Update area */
  .put(
    revisionCtrl.addUpdateRevision,
    areaCtrl.update)

  /** DELETE /v1/areas/:areaId - Delete area */
  .delete(
    revisionCtrl.addDeleteRevision,
    areaCtrl.remove);

/** Load area when API with areaId route parameter is hit */
router.param('areaId', areaCtrl.load);

export default router;
