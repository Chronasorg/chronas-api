import express from 'express';

import { validate } from '../helpers/validation.js';
import paramValidation from '../../config/param-validation.js';
import metadataCtrl from '../controllers/metadata.controller.js';
import revisionCtrl from '../controllers/revision.controller.js';
import { requireAdmin, retired } from '../helpers/require-auth.js';

const router = express.Router();

// Votes were retired on 2026-11-26 after the pentest: any account could vote
// again and again and farm karma. Answered before the :metadataId loader runs.
const VOTE_PATH = /^\/[^/]+\/(up|down)vote\/?$/i;
const votesGone = retired('Voting has been retired.');
router.use((req, res, next) => (VOTE_PATH.test(req.path) ? votesGone(req, res) : next()));

router.route('/')
  .all(metadataCtrl.defineEntity)
  /** GET /v1/metadata - Get list of metadata keys */
  .get(metadataCtrl.list)

  /** POST /v1/metadata - Create new metadata */
  .post(
    requireAdmin,
    revisionCtrl.addCreateRevision,
    // validate(paramValidation.createMetadata),
    metadataCtrl.create);

router.route('/:metadataId')
  .all(metadataCtrl.defineEntity)
  /** GET /v1/metadata/:metadataIds - Get metadata through semicolon delimited ids */
  .get(
    metadataCtrl.get)

  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    requireAdmin,
    revisionCtrl.addUpdateRevision,
    metadataCtrl.update)

  /** DELETE /v1/metadata/:metadataId - Delete metadata */
  .delete(
    requireAdmin,
    revisionCtrl.addDeleteRevision,
    metadataCtrl.remove);

router.route('/:metadataId/single')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    requireAdmin,
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
    requireAdmin,
    validate(paramValidation.updateLink),
    metadataCtrl.updateLink(true)
  );

router.route('/:metadataId/removeLink')
  .all(metadataCtrl.defineEntity)
  /** PUT /v1/metadata/:metadataId - Update metadata */
  .put(
    requireAdmin,
    validate(paramValidation.updateLink),
    metadataCtrl.updateLink(false)
  );

/** Load metadata when API with metadataId route parameter is hit */
router.param('metadataId', metadataCtrl.load);

export default router;
