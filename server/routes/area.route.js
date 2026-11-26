import express from 'express';
import httpStatus from 'http-status';

import areaCtrl from '../controllers/area.controller.js';
import revisionCtrl from '../controllers/revision.controller.js';
import { requireAdmin } from '../helpers/require-auth.js';

const router = express.Router();

router.route('/')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas - Get list of areas */
  .get(areaCtrl.list)

  /** PUT /v1/areas/ - Update area */
  .put(
    requireAdmin,
    areaCtrl.updateMany,
    revisionCtrl.addUpdateManyRevision)

  /** POST /v1/areas - Create new area */
  .post(
    requireAdmin,
    // revisionCtrl.addCreateRevision,
    // validate(paramValidation.createArea),
    areaCtrl.create);

router.route('/replace')
  .all(areaCtrl.defineEntity)
  /** PUT /v1/areas/replace - Replace a ruler, culture or religion across a year range */
  .put(
    requireAdmin,
    areaCtrl.replaceAll,
    revisionCtrl.addUpdateManyRevision);

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

router.route('/:areaId')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas/:areaId - Get area */
  .get(areaCtrl.get)

  /** PUT /v1/areas/:areaId - Update area */
  .put(
    requireAdmin,
    revisionCtrl.addUpdateRevision,
    areaCtrl.update)

  /** DELETE /v1/areas/:areaId - Delete area */
  .delete(
    requireAdmin,
    revisionCtrl.addDeleteRevision,
    areaCtrl.remove);


/** Load area when API with areaId route parameter is hit */
router.param('areaId', areaCtrl.load);

export default router;
