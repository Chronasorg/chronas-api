import APIError from './APIError.js';

/**
 * Check of user privilege suffices
 */

function checkPrivilege(threshold) {
  return function (req, res, next) {
    console.debug(req.auth);
    if (req && req.auth && ((req.auth.subscription && req.auth.subscription !== '-1' && req.auth.subscription !== '') || req.auth.privilege >= threshold)) {
      next();
    } else {
      const err = new APIError('Unauthorized. 1 Your profile does not have sufficient privileges to access this resource.', 401);
      next(err);
    }
  };
}

const ADMIN_PRIVILEGE = 5;

/**
 * Admin check without the subscription bypass that checkPrivilege grants.
 */
function isAdmin(auth) {
  return Boolean(auth && Number(auth.privilege) >= ADMIN_PRIVILEGE);
}

function checkPrivilegeForTypes(threshold, typesBlocked) {
  return function (req, res, next) {
    if (req && req.auth && req.auth.privilege >= threshold) return next();

    // Changes to an existing item are judged by its stored type, not by what the body claims.
    // req.entity is set by the route's param loader; if it is missing, fail closed.
    const entity = Array.isArray(req.entity) ? req.entity[0] : req.entity;
    const err = new APIError('Unauthorized. 2 Your profile does not have sufficient privileges to access this resource.', 401);
    if (req.method !== 'POST' && !entity) return next(err);

    const types = [(entity || {}).type, req.storedType, (req.body || {}).type];
    if (types.some(type => typesBlocked.indexOf(type) !== -1)) return next(err);
    return next();
  };
}

// only proceed if the token belongs to the user or the user has admin privileges

function checkPrivilegeOrOwnership(threshold) {
  return function (req, res, next) {
    const callerId = String((req.auth || {}).id || '').toLowerCase();
    const targetId = String((req.params || {}).userId || '').toLowerCase();
    if ((req && req.auth && req.auth.privilege >= threshold) || (callerId !== '' && callerId === targetId)) {
      next();
    } else {
      const err = new APIError('Unauthorized. 3 Your profile does not have sufficient privileges to access this resource.', 401);
      next(err);
    }
  };
}

export default { checkPrivilege, checkPrivilegeForTypes, checkPrivilegeOrOwnership, isAdmin };
