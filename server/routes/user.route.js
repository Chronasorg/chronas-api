import express from 'express';

import { retired } from '../helpers/require-auth.js';

// Retired 2026-11-26 after the pentest: highscore and sustainers listed every
// profile, and account edits could overwrite credentials. The new frontend
// uses none of these routes. Accounts stay in chronas-users; login still works.
const router = express.Router();
const gone = retired('The users API has been retired.');

router.all('/', gone);
router.all('/*splat', gone);

export default router;
