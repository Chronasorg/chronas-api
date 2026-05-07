import express from 'express';

import contactCtrl from '../controllers/contact.controller.js';
import { contactLimiter } from '../middleware/rate-limit.js';

const router = express.Router();

router.route('/')
  .post(contactLimiter, contactCtrl.create);

export default router;
