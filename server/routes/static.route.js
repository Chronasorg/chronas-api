import express from 'express';

import staticCtrl from '../controllers/static.controller.js';

const router = express.Router(); // eslint-disable-line new-cap

router.route('/:year')
  .get(staticCtrl.get);

export default router;
