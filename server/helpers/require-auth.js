import { expressjwt as expressJwt } from 'express-jwt';
import httpStatus from 'http-status';

import { config } from '../../config/config.js';
import APIError from './APIError.js';
import privileges from './privileges.js';
import User from '../models/user.model.js';

/**
 * Lifetime of the tokens /v1/auth/login issues. Before 2026-11 tokens carried
 * no expiry and stayed valid forever; requireAdmin refuses those.
 */
export const TOKEN_LIFETIME = '12h';

/**
 * The token version a user's tokens must carry (claim `tv`). Raising
 * `tokenVersion` on the user item revokes every token issued before.
 */
export function tokenVersionOf(user) {
  return Number((user || {}).tokenVersion) || 0;
}

const verifySignature = expressJwt({
  secret: config.jwtSecret,
  requestProperty: 'auth',
  algorithms: ['HS256']
});

const unauthorized = message => new APIError(message, httpStatus.UNAUTHORIZED, true);

// jsonwebtoken checks `exp` only when a token has one, so a token without it
// would never expire. Every token login issues now has one.
function requireExpiry(req, res, next) {
  if (typeof (req.auth || {}).exp !== 'number') return next(unauthorized('Token expired, log in again.'));
  return next();
}

// Privilege 5 only. Unlike the old checkPrivilege(), a Patreon subscription
// does not count: map data and revisions are edited by admins only.
// The claim is checked first, so other accounts' tokens never cause a read.
// Then the account itself must still exist, still be an admin, and still
// have the token version the token was issued with: deleting or demoting an
// account, or raising its tokenVersion, takes effect at once, not after expiry.
async function currentAdmin(req, res, next) {
  if (!privileges.isAdmin(req.auth)) return next(unauthorized('Unauthorized. Only admins can do this.'));
  try {
    const user = await User.findById(req.auth.id).exec();
    if (!user || !privileges.isAdmin(user) || tokenVersionOf(user) !== (Number(req.auth.tv) || 0)) {
      return next(unauthorized('Unauthorized. Only admins can do this.'));
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

/** A valid, expiring token of an account that is an admin now (privilege 5). */
export const requireAdmin = [verifySignature, requireExpiry, currentAdmin];

/**
 * Every POST, PUT, PATCH and DELETE on this router needs requireAdmin.
 * Register it before the routes: it then runs before any router.param loader,
 * so a write without an admin token never reads the database, and a write
 * route added later is admin-only without anyone having to remember it.
 */
export function adminWrites(router) {
  ['post', 'put', 'patch', 'delete'].forEach((method) => {
    router[method](['/', '/*splat'], requireAdmin);
  });
}

/** Handler for an API that has been retired: 410 Gone for every method. */
export function retired(message) {
  return (_req, res) => res.status(httpStatus.GONE).json({ message });
}
