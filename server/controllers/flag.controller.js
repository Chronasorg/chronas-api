import { omit } from 'underscore'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import Flag from '../models/flag.model'
import { config } from '../../config/config'
import httpStatus from 'http-status'

/**
 * Load flag and append to req.
 */
function load(req, res, next, id) {
  Flag.findOne({ fullUrl: encodeURIComponent(id) })
    .then((flag) => {
      req.flag = flag // eslint-disable-line no-param-reassign
      return next()
    })
    .catch((e) => {
      res.status(httpStatus.NOT_FOUND).json({
        message: e.isPublic ? e.message : httpStatus[e.status],
        stack: config.env === 'development' ? e.stack : {}
      })
    })
}


/**
 * Get flag
 * @returns {Flag}
 */
function get(req, res) {
  return res.json(req.flag)
}

function update(req, res, next) {
  const flag = req.flag

  flag.fixed = !flag.fixed

  flag.save()
    .then(savedFlag => res.json(savedFlag))
    .catch(e => next(e))
}


function create(req, res, next) {
  const flagId = (req.body.fullUrl)
  Flag.findOne({ fullUrl: flagId })
    .lean()
    .exec()
    .then((duplicatedFlag) => {
      if (duplicatedFlag) {
        const err = new APIError('A flag with this fullUrl already exists!', 400)
        next(err)
      }

      const flag = new Flag({
        fullUrl: flagId,
        subEntityId: req.body.subEntityId,
        wrongWiki: req.body.wrongWiki,
        resource: req.body.resource
      })

      flag.save()
        .then((savedFlag) => {
          res.json(savedFlag)
        })
        .catch(e => next(e))
    })
    .catch(e => next(e))
}

/**
 * Get flag list.
 * @property {number} req.query.offe - Number of flags to be skipped.
 * @property {number} req.query.limit - Limit number of flags to be returned.
 * @returns {Flag[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'timestamp', entity = false, subentity = false, order = 'asc', filter = '' } = req.query
  let potentialUser
  let potentialReverted
  let potentialEntity = false
  let potentialSubentity = false
  if (filter) {
    const fullFilter = JSON.parse(filter)
    potentialReverted = fullFilter.fixed
  }
  const fEntity = (potentialEntity || entity)
  const fSubentity = (potentialSubentity || subentity)
  Flag.list({ start, end, sort, order, entity: fEntity, user: potentialUser, subentity: fSubentity, fixed: potentialReverted, filter })
    .then((flags) => {
      if (count) {
        const optionalFind = (fEntity) ? { entityId: fEntity } : {}
        if (fSubentity) {
          optionalFind.subEntityId = fSubentity
        }
        Flag.find(optionalFind).count().exec().then((flagCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', flagCount)
          res.json(flags)
        })
      } else {
        res.json(flags)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete flag.
 * @returns {Flag}
 */
function remove(req, res, next) {
  const flag = req.flag
  flag.remove()
    .then(deletedFlag => res.json(deletedFlag))
    // .then(deletedFlag => next(new APICustomResponse(`${deletedFlag} deleted successfully`, 204, true)))
    .catch(e => next(e))
}

export default { create, load, get, update, list, remove }
