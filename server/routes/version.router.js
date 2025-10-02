import express from 'express';

import versionCtrl from '../controllers/version.controller.js';

const router = express.Router(); // eslint-disable-line new-cap

router.route('/welcome')
/** GET /v1/version - get current deployed version */
  .get(versionCtrl.getPlusUser);

router.route('/')
/** GET /v1/version - get current deployed version */
  .get(versionCtrl.get);


export default router;
