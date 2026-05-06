import express from 'express';

import { validate } from '../helpers/validation.js';
import paramValidation from '../../config/param-validation.js';
import gameCtrl from '../controllers/game.controller.js';

const router = express.Router();

router.route('/')
  /** POST /v1/game - Create new game */
  .post(
    validate(paramValidation.createGame),
    gameCtrl.create);

router.route('/highscore')
/** GET /v1/game - Get list of game */
  .get(
    gameCtrl.list);


export default router;
