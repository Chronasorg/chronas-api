import express from 'express';
import httpStatus from 'http-status';
import { expressjwt as expressJwt } from 'express-jwt';
import rateLimit from 'express-rate-limit';

import { validate } from '../helpers/validation.js';
import paramValidation from '../../config/param-validation.js';
import { config } from '../../config/config.js';
import authCtrl from '../controllers/auth.controller.js';
import { DynamoRateLimitStore } from '../middleware/dynamo-rate-store.js';

const router = express.Router();

const FIFTEEN_MIN = 15 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new DynamoRateLimitStore({ prefix: 'auth', windowMs: FIFTEEN_MIN }),
  message: { message: 'Too many auth attempts, try again later.' }
});

const refreshLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new DynamoRateLimitStore({ prefix: 'refresh', windowMs: FIFTEEN_MIN }),
  message: { message: 'Too many refresh attempts, try again later.' }
});

/** POST /v1/auth/login - Returns token if correct email and password is provided */
router.route('/login')
  .post(authLimiter, validate(paramValidation.login), authCtrl.login);

/** POST /v1/auth/signup - Returns token if email not duplicated */
router.route('/signup')
  .post(authLimiter, validate(paramValidation.signup), authCtrl.signup);

/** POST /v1/auth/refresh - Returns a fresh token for an authenticated user */
router.route('/refresh')
  .post(refreshLimiter, expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }), authCtrl.refresh);

// Google, Facebook and GitHub logins were retired on 2026-10-13: their client
// secrets were revoked and neither frontend could complete these logins.
const socialLoginGone = (_req, res) => res.status(httpStatus.GONE).json({
  message: 'Social logins have been retired. Log in with email and password.'
});

['facebook', 'google', 'github', 'twitter'].forEach((provider) => {
  router.all(`/login/${provider}`, socialLoginGone);
  router.all(`/login/${provider}/*splat`, socialLoginGone);
});

export default router;
