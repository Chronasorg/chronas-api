import express from 'express'
import expressJwt from 'express-jwt'
import areaCtrl from '../controllers/area.controller'
import revisionCtrl from '../controllers/revision.controller'
import { config } from '../../config/config'
import checkPrivilege from '../helpers/privileges'

const router = express.Router() // eslint-disable-line new-cap

router.route('/')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas - Get list of areas */
  .get(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.list)

  /** PUT /v1/areas/ - Update area */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(3),
    areaCtrl.updateMany,
    revisionCtrl.addUpdateManyRevision)

  /** POST /v1/areas - Create new area */
  .post(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    //checkPrivilege.checkPrivilege(5),
    // revisionCtrl.addCreateRevision,
    // validate(paramValidation.createArea),
    areaCtrl.create)

router.route('/replace')
  .all(areaCtrl.defineEntity)
/** GET /v1/areas/aggregateProvinces - Aggregate all years by provinces */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(3),
    areaCtrl.replaceAll,
    revisionCtrl.addUpdateManyRevision)

router.route('/aggregateProvinces')
  /** GET /v1/areas/aggregateProvinces - Aggregate all years by provinces */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.aggregateProvinces)

router.route('/aggregateMetaCoo')
/** GET /v1/areas/aggregateProvinces - Aggregate all years by provinces */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.aggregateMetaCoo)

router.route('/aggregateDimension')
/** GET /v1/areas/aggregateDimension - Aggregate all years by selected dimension (ruler, religion, religionGeneral or culture) */
  .get(
    // expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    areaCtrl.aggregateDimension)

router.route('/:areaId')
  .all(areaCtrl.defineEntity)
  /** GET /v1/areas/:areaId - Get area */
  .get(areaCtrl.get)

  /** PUT /v1/areas/:areaId - Update area */
  .put(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(3),
    revisionCtrl.addUpdateRevision,
    areaCtrl.update)

  /** DELETE /v1/areas/:areaId - Delete area */
  .delete(
    expressJwt({ secret: config.jwtSecret, requestProperty: 'auth' }),
    checkPrivilege.checkPrivilege(5),
    revisionCtrl.addDeleteRevision,
    areaCtrl.remove)


/** Load area when API with areaId route parameter is hit */
router.param('areaId', areaCtrl.load)

export default router
