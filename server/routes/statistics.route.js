import express from 'express';

import statisticsCtrl from '../controllers/statistics.controller.js';
import { requireAdmin } from '../helpers/require-auth.js';

const router = express.Router();

router.route('/')
  .get(statisticsCtrl.list);

router.route('/refresh')
  .post(
    requireAdmin,
    statisticsCtrl.refresh
  );

export default router;
