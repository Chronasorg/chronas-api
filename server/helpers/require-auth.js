import { expressjwt as expressJwt } from 'express-jwt';
import httpStatus from 'http-status';

import { config } from '../../config/config.js';
import APIError from './APIError.js';
import privileges from './privileges.js';

/**
 * Lifetime of the tokens /v1/auth/login issues. Before 2026-11 tokens carried
 * no expiry and stayed valid forever; requireAdmin refuses those.
 */
export const TOKEN_LIFETIME = '12h';

const verifySignature = expressJwt({
  secret: config.jwtSecret,
  requestProperty: 'auth',
  algorithms: ['HS256']
});

// jsonwebtoken checks `exp` only when a token has one, so a token without it
// would never expire. Every token login issues now has one.
function requireExpiry(req, res, next) {
  if (typeof (req.auth || {}).exp !== 'number') {
    return next(new APIError('Token expired, log in again.', httpStatus.UNAUTHORIZED, true));
  }
  return next();
}

// Privilege 5 only. Unlike the old checkPrivilege(), a Patreon subscription
// does not count: map data and revisions are edited by admins only.
function adminOnly(req, res, next) {
  if (privileges.isAdmin(req.auth)) return next();
  return next(new APIError('Unauthorized. Only admins can do this.', httpStatus.UNAUTHORIZED, true));
}

/** A valid, expiring token of an admin (privilege 5). */
export const requireAdmin = [verifySignature, requireExpiry, adminOnly];

/** Handler for an API that has been retired: 410 Gone for every method. */
export function retired(message) {
  return (_req, res) => res.status(httpStatus.GONE).json({ message });
}
