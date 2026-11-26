import express from 'express';
import httpStatus from 'http-status';
import rateLimit from 'express-rate-limit';

import { validate } from '../helpers/validation.js';
import paramValidation from '../../config/param-validation.js';
import authCtrl from '../controllers/auth.controller.js';
import { DynamoRateLimitStore } from '../middleware/dynamo-rate-store.js';
import { retired } from '../helpers/require-auth.js';

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

/** POST /v1/auth/login - Returns token if correct email and password is provided */
router.route('/login')
  .post(authLimiter, validate(paramValidation.login), authCtrl.login);

// Signup and token refresh were retired on 2026-11-26 after the pentest: open
// signup allowed one-character passwords, reused usernames and account
// enumeration, and refresh renewed tokens that never expired. Accounts are
// no longer created through the API; existing ones still log in.
router.all('/signup', retired('Signup has been retired.'));
router.all('/refresh', retired('Token refresh has been retired. Log in again.'));

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
