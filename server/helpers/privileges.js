import APIError from './APIError.js'

/**
 * Check of user privilege suffices
 */

function checkPrivilege(threshold) {
  return function (req, res, next) {
  console.debug(req.auth)
    if (req && req.auth && ((req.auth.subscription && req.auth.subscription !== "-1" && req.auth.subscription !== "") || req.auth.privilege >= threshold)) {
      next()
    } else {
      const err = new APIError('Unauthorized. 1 Your profile does not have sufficient privileges to access this resource.', 401)
      next(err)
    }
  }
}

function checkPrivilegeForTypes(threshold, typesBlocked) {
  return function (req, res, next) {
    const typeToChecked = req.body.type || ((req.entity || {})[0] || {}).type

    if (typesBlocked.indexOf(typeToChecked) === -1 || (req && req.auth && req.auth.privilege >= threshold)) {
      next()
    } else {
      const err = new APIError('Unauthorized. 2 Your profile does not have sufficient privileges to access this resource.', 401)
      next(err)
    }
  }
}

// only proceed if the token belongs to the user or the user has admin privileges

function checkPrivilegeOrOwnership(threshold) {
  return function (req, res, next) {
    if (req && req.auth && req.auth.privilege >= threshold || (req.params || {}).userId === (req.user || {})._id || (req.params || {}).userId === (req.user || {}).id) {
      next()
    } else {
      const err = new APIError("Unauthorized. 3 Your profile does not have sufficient privileges to access this resource.", 401)
      next(err)
    }
  }
}

export default { checkPrivilege, checkPrivilegeForTypes, checkPrivilegeOrOwnership }
