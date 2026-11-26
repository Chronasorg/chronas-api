import express from 'express';

import revisionCtrl from '../controllers/revision.controller.js';
import { requireAdmin, retired } from '../helpers/require-auth.js';

const router = express.Router();

// The revision list and revision edits (PUT, DELETE) were retired on
// 2026-11-26 after the pentest. Reading a single revision stays for admins:
// the data-validation scripts read the revisions their own writes created.
const gone = retired('The revisions API has been retired, except reading a single revision.');

router.all('/', gone);

/** GET /v1/revisions/:revisionId - Get revision (admins only) */
router.route('/:revisionId')
  // The revision is loaded only after the token check, so callers without
  // a valid admin token never cause a database read.
  .get(
    requireAdmin,
    (req, res, next) => revisionCtrl.load(req, res, next, req.params.revisionId),
    revisionCtrl.get)
  .all(gone);

export default router;
