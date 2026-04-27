import express from 'express';

import statisticsCtrl from '../controllers/statistics.controller.js';

const router = express.Router();

// get general data statistics (reads from S3, falls back to live compute)
router.route('/')
  .get(statisticsCtrl.list);

// recompute statistics and write to S3 (call after data changes)
router.route('/refresh')
  .post(statisticsCtrl.refresh);

export default router;
