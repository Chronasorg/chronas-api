import express from 'express';

import { retired } from '../helpers/require-auth.js';

// Retired 2026-11-26 after the pentest (anyone could create, close or delete
// flags). In the 60 days before, only old.chronas.org sent reports (7), and
// none was ever processed. The chronas-flags table is kept.
const router = express.Router();
const gone = retired('The flags API has been retired.');

router.all('/', gone);
router.all('/*splat', gone);

export default router;
