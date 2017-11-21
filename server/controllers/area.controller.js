import Area from '../models/area.model'
import { pick, keys, isEqual, extendOwn } from 'underscore'
import logger from '../../config/winston'

/**
 * Load area and append to req.
 */
function load(req, res, next, id) {
  Area.get(id)
    .then((area) => {
      req.entity = area // eslint-disable-line no-param-reassign
      return next()
    })
    .catch(e => next(e))
}

/**
 * Get area
 * @returns {Area}
 */
function get(req, res) {
  return res.json(req.entity)
}

/**
 * Create new area
 * @property {string} req.body.name - The areaname of area.
 * @property {string} req.body.privilege - The privilege of area.
 * @returns {Area}
 */
function create(req, res, next) {
  const area = new Area({
    year: req.body.year,
    data: req.body.data
  })

  area.save()
    .then(savedArea => res.json(savedArea))
    .catch(e => next(e))
}

function updateMany(req, res, next) {
  const { start, end = start, provinces, nextBody } = req.body
  const prevBody = {}
  const trimmedNextBody = {}
  Area.find({ year: { '$gte': start, '$lte': end }})
    .sort({ year: 1 })
    .exec()
    .then(Areas => {

      const areaPromises = Areas.map(area => {
        return new Promise((resolve, reject) => {
          const currYear = area.year
          provinces.map(province => {
              if (!isEqual(area.data[province], nextBody)) {
                if (typeof prevBody[currYear] === "undefined") prevBody[currYear] = {}
                if (typeof trimmedNextBody[currYear] === "undefined") trimmedNextBody[currYear] = {}

                prevBody[currYear][province] = area.data[province]
                trimmedNextBody[currYear][province] = nextBody
                area.data[province] = nextBody
                area.markModified('data');
              }

              if (typeof prevBody[currYear] !== "undefined") {
                // need to update
                area.save()
                  .then((ar) => {
                    resolve()
                  })
                  .catch(e => reject(e))
              } else {
                resolve()
              }
          })
        })
      })

      Promise.all(areaPromises).then(() => {
        // optimize prevBody and add revision record
        req.body.prevBody = prevBody
        req.body.nextBody = trimmedNextBody

        next();
      }, (error) => {
        next(error)
      })
    })
    .catch(e => next(e))
}

/**
 * Update existing area
 * @property {string} req.body.areaname - The areaname of area.
 * @property {string} req.body.privilege - The privilege of area.
 * @returns {Area}
 */
function update(req, res, next) {
  const area = req.entity

  if (typeof req.body.year !== 'undefined') area.year = req.body.year
  if (typeof req.body.data !== 'undefined') area.data = req.body.data

  area.save()
    .then(savedArea => res.json(savedArea))
    .catch(e => next(e))
}

/**
 * Get area list.
 * @property {number} req.query.offset - Number of year to start from.
 * @property {number} req.query.length - Limit number of areas to be returned.
 * @returns {Area[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'createdAt', order = 'asc', filter = '' } = req.query
  const limit = end - start
  Area.list({ start, limit, sort, order, filter })
    .then((areas) => {
      if (count) {
        Area.find().count({}).exec().then((areaCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', areaCount)
          res.json(areas)
        })
      } else {
        const areasTmp = JSON.parse(JSON.stringify(areas)) || []
        const areasToList = []

        // for (let i = 0; i < areasTmp.length; i++) {
        //   if (areasTmp[i].owner === req.user.username
        //     || areasTmp[i].privilegeLevel.indexOf('public') > -1) {
        //     areasToList.push(areasTmp[i])
        //   }
        // }

        res.json(areasTmp)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete area.
 * @returns {Area}
 */
function remove(req, res, next) {
  const area = req.entity
  area.remove()
    .then(deletedArea => res.json(deletedArea))
    .catch(e => next(e))
}

function defineEntity(req, res, next) {
  req.resource = 'areas'
  next()
}

function getRanges(array) {
  var ranges = [], rstart, rend;
  for (var i = 0; i < array.length; i++) {
    rstart = array[i];
    rend = rstart;
    while (array[i + 1] - array[i] == 1) {
      rend = array[i + 1]; // increment the index if the numbers sequential
      i++;
    }
    ranges.push(rstart == rend ? [rstart] : [rstart,rend]);
  }
  return ranges;
}

export default { load, get, create, update, updateMany, list, remove, defineEntity }
