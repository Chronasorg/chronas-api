import express from 'express';

import statisticsCtrl from '../controllers/statistics.controller.js';

const router = express.Router();

// get general data statistics
router.route('/')
  .get(statisticsCtrl.list);

export default router;
