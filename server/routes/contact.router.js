import express from 'express';

import contactCtrl from '../controllers/contact.controller.js';

const router = express.Router(); // eslint-disable-line new-cap

router.route('/')
/** GET /v1/version - get current deployed version */
  .post(contactCtrl.create);

export default router;
