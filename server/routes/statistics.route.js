import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import statisticsCtrl from '../controllers/statistics.controller.js';
import { config } from '../../config/config.js';
import checkPrivilege from '../helpers/privileges.js';

const router = express.Router();

router.route('/')
  .get(statisticsCtrl.list);

router.route('/refresh')
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(5),
    statisticsCtrl.refresh
  );

export default router;
