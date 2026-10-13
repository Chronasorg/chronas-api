import express from 'express';
import { expressjwt as expressJwt } from 'express-jwt';

import userCtrl from '../controllers/user.controller.js';
import { config } from '../../config/config.js';
import checkPrivilege from '../helpers/privileges.js';

const router = express.Router();

// Accounts are created through POST /v1/auth/signup or the OAuth logins.

router.route('/sustainers')
/** GET /v1/users - Get list of users */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    userCtrl.list);

router.route('/highscore')
/** GET /v1/users - Get list of users */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    userCtrl.list);

// Authorization runs before the user is loaded, so a 404 never reveals
// whether an email is registered to someone who may not see it.
router.route('/:userId')
  /** GET /v1/users/:userId - Get user */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilegeOrOwnership(5),
    userCtrl.load,
    userCtrl.get)

  /** PUT /v1/users/:userId - Update user */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilegeOrOwnership(5),
    userCtrl.load,
    userCtrl.update)

  /** DELETE /v1/users/:userId - Delete user */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilegeOrOwnership(5),
    userCtrl.load,
    userCtrl.remove);

export default router;
