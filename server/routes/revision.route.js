import express from 'express'
import { validate } from '../helpers/validation.js'
import { expressjwt as expressJwt } from 'express-jwt'
import paramValidation from '../../config/param-validation.js'
import revisionCtrl from '../controllers/revision.controller.js'
import { config } from '../../config/config.js'
import checkPrivilege from '../helpers/privileges.js'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  /** GET /v1/revisions - Get list of revisions */
  .get(
   checkPrivilege.checkPrivilege(3),
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    revisionCtrl.list)

  // /** POST /v1/revisions - Create new revision */
  // .post(
  //   expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
  //   // validate(paramValidation.createMarker),
  //   revisionCtrl.create)

router.route('/:revisionId')
  /** GET /v1/revisions/:revisionId - Get revision */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    revisionCtrl.get)

  /** PUT /v1/revisions/:revisionId - Update revision */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(3),
    // validate(paramValidation.updateMarker),
    revisionCtrl.update)

  /** DELETE /v1/revisions/:revisionId - Delete revision */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth', algorithms: ['HS256'] }),
    checkPrivilege.checkPrivilege(5),
    revisionCtrl.remove)

/** Load revision when API with revisionId route parameter is hit */
router.param('revisionId', revisionCtrl.load)
// router.param('revisionId', revisionCtrl.loadEntity)

export default router
