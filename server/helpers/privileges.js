import { APIError } from './APIError'

/**
 * Check of user privilege suffices
 */

function checkPrivilege(threshold) {
  return function (req, res, next) {
    if (req && req.auth && req.auth.privilege >= threshold) {
      next()
    } else {
      const err = new APIError('Unauthorized. Your profile does not have sufficient privileges to access this resource.', 401)
      next(err)
    }
  }
}

export default { checkPrivilege }
