import express from 'express';

import staticCtrl from '../controllers/static.controller.js';

const router = express.Router();

router.route('/:year')
  .get(staticCtrl.get);

export default router;
