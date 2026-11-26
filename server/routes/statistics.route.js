import express from 'express';

import statisticsCtrl from '../controllers/statistics.controller.js';
import { adminWrites } from '../helpers/require-auth.js';

const router = express.Router();

// Every write on this router is for admins; checked before any loader runs.
adminWrites(router);

router.route('/')
  .get(statisticsCtrl.list);

router.route('/refresh')
  .post(
    statisticsCtrl.refresh
  );

export default router;
