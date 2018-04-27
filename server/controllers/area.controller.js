import { pick, keys, isEqual, extendOwn } from 'underscore'
import Area from '../models/area.model'
import Metadata from '../models/metadata.model'

const dimAccessor = {
  ruler: 0,
  culture: 1,
  religion: 2,
  religionGeneral: 2
}

/**
 * Load area and append to req.
 */
function load(req, res, next, id) {
  Area.get(id, req.method)
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
    _id: req.body.year,
    year: +req.body.year,
    data: req.body.data
  })

  area.save()
    .then(savedArea => res.json(savedArea))
    .catch(e => next(e))
}

function aggregateProvinces(req, res, next) {
  const province = req.query.province || false
  // TODO: allow for aggregation of single provinces upon change

  Metadata.findById('religion')
    .exec()
    .then((religion) => {
      const religionMap = religion.data
      const aggregatedData = {}
      const prevData = {}

      const areaStream = Area
        .find()
        .sort({ year: 1 })
        .cursor()

      let setUp = false

      areaStream.on('data', (area) => {
        const currData = area.data
        const currYear = area.year

        if (!setUp) {
          Object.keys(currData).forEach((currProv) => {
            aggregatedData[currProv] = {
              ruler: [],
              religion: [],
              religionGeneral: [],
              culture: [],
              capital: [],
            }
            prevData[currProv] = {
              ruler: '',
              religion: '',
              religionGeneral: '',
              culture: '',
              capital: '',
              population: ''
            }
          })
          setUp = true
        }

        Object.keys(currData).forEach((currProv) => {
          // console.debug(currProv,currYear,aggregatedData[currProv],prevData[currProv])
          if (typeof aggregatedData[currProv] === 'undefined') return
          const currProvData = currData[currProv]
          if (currProvData[0] !== prevData[currProv].ruler) {
            aggregatedData[currProv].ruler.push({ [currYear]: currProvData[0] })
            prevData[currProv].ruler = currProvData[0]
          }
          if (currProvData[1] !== prevData[currProv].culture) {
            aggregatedData[currProv].culture.push({ [currYear]: currProvData[1] })
            prevData[currProv].culture = currProvData[1]
          }
          if (currProvData[2] !== prevData[currProv].religion) {
            aggregatedData[currProv].religion.push({ [currYear]: currProvData[2] })
            prevData[currProv].religion = currProvData[2]
            if (prevData[currProv].religionGeneral !== religionMap[currProvData[2]][3]) {
              aggregatedData[currProv].religionGeneral.push({ [currYear]: religionMap[currProvData[2]][3] })
              prevData[currProv].religionGeneral = religionMap[currProvData[2]][3]
            }
          }
          if (currProvData[3] !== prevData[currProv].capital) {
            aggregatedData[currProv].capital.push({ [currYear]: currProvData[3] })
            prevData[currProv].capital = currProvData[3]
          }
          if (currYear % 100 === 0) {
            aggregatedData[currProv].population.push({ [currYear]: currProvData[4] })
          }
        })
      }).on('error', (e) => {
        res.status(500).send(e)
      }).on('close', () => {
        // the stream is closed

        Object.keys(aggregatedData).forEach((currProv) => {
          if (province && currProv.toLowerCase() !== province.toLowerCase()) return

          const metadataId = 'ap_' + currProv.toLowerCase()
          Metadata.findById(metadataId)
            .exec()
            .then((foundMetadataEntity) => {
              if (foundMetadataEntity) {
                // already exists -> update
                foundMetadataEntity.data = aggregatedData[currProv]
                foundMetadataEntity.save()
              } else {
                // does not exist -> create
                const metadata = new Metadata({
                  _id: metadataId,
                  data: aggregatedData[currProv],
                  type: 'ap'
                })

                metadata.save({ checkKeys: false })
                  .then(() => Promise.resolve())
              }
            })
            .catch(e => res.status(500).send(e))
        })
        res.send('OK')
      })
    })
    .catch(e => res.status(500).send(e))
}

function aggregateDimension(req, res, next) {
  const dimension = req.query.dimension || false
  if (!dimension || (dimension !== 'ruler' && dimension !== 'culture' && dimension !== 'religion' && dimension !== 'religionGeneral')) res.status(400).send('No valid dimension specified.')

  Metadata.findById((dimension === 'religionGeneral') ? 'religion' : dimension)
    .exec()
    .then((dimensionMetaRes) => {
      const dimensionMeta = dimensionMetaRes.data
      const dimEntityList = (dimension === 'religionGeneral')
        ? Object.values(dimensionMeta).map(entity => entity[3]).filter((el, i, a) => i === a.indexOf(el))
        : Object.keys(dimensionMeta)

      const aggregatedData = {}
      const prevData = {}
      const dimIndex = dimAccessor[dimension]

      const areaStream = Area
        .find()
        .sort({ year: 1 })
        .cursor()

      let setUp = false

      areaStream.on('data', (area) => {
        const currData = area.data
        const currYear = area.year

        let popTotal = 0

        if (!setUp) {
          dimEntityList.forEach((currDimEntity) => {
            aggregatedData[currDimEntity] = []
            prevData[currDimEntity] = {
              provCount: 0,
              popCount: 0,
              popShare: 0
            }
          })
          setUp = true
        }

        const currYearAggregates = {}
        dimEntityList.forEach((currDimEntity) => {
          currYearAggregates[currDimEntity] = {
            provCount: 0,
            popCount: 0
          }
        })

        Object.values(currData).forEach((currProvData) => {
          const currProvDim = (dimension === 'religionGeneral') ? (dimensionMeta[currProvData[dimIndex]] || {})[3] : currProvData[dimIndex]
          const currProvPop = (isNaN(currProvData[4]) ? 0 : currProvData[4])

          popTotal += +currProvPop

          if (currYearAggregates[currProvDim]) {
            currYearAggregates[currProvDim] = {
              provCount: currYearAggregates[currProvDim].provCount + 1,
              popCount: currYearAggregates[currProvDim].popCount + currProvPop
            }
          }
        })

        Object.keys(currYearAggregates).forEach((currDimEntity) => {
          if (typeof aggregatedData[currDimEntity] === 'undefined') return
          const currValue = currYearAggregates[currDimEntity]
          const currpopShare = currValue.popCount / popTotal * 100
          const prevDataValue = prevData[currDimEntity]

          if (prevDataValue.provCount !== currValue.provCount) {
            // add provCount entry
            prevData[currDimEntity].provCount = currValue.provCount
            prevData[currDimEntity].popShare = currpopShare
            prevData[currDimEntity].popCount = currValue.popCount

            aggregatedData[currDimEntity].push({ [currYear]: [currValue.provCount, currValue.popCount, Math.round(currpopShare * 100) / 100] })
          }
        })
        // popTotal
      }).on('error', (e) => {
        res.status(500).send(e)
      }).on('close', () => {
        // the stream is closed

        Object.keys(aggregatedData).forEach((currDimEntity) => {

          const metadataId = 'a_' + dimension + '_' + currDimEntity
          Metadata.findById(metadataId)
            .exec()
            .then((foundMetadataEntity) => {
              if (foundMetadataEntity) {
                // already exists -> update
                foundMetadataEntity.data = { ...foundMetadataEntity.data, influence: aggregatedData[currDimEntity] }
                foundMetadataEntity.save()
              } else {
                // does not exist -> create
                const metadata = new Metadata({
                  _id: metadataId,
                  data: {  influence: aggregatedData[currDimEntity] },
                  type: 'a_' + dimension
                })

                metadata.save({ checkKeys: false })
                  .then(() => Promise.resolve())
              }
            })
            .catch(e => res.status(500).send(e))
        })
        res.send('OK')
      })
    })
    .catch(e => res.status(500).send(e))
}

function updateMany(req, res, next) {
  const { start, end = start, provinces, ruler, culture, religion, capital, population } = req.body
  const nextBody = [] // "SWE","swedish","redo","Stockholm",1000

  nextBody[0] = ruler
  nextBody[1] = culture
  nextBody[2] = religion
  nextBody[3] = capital
  nextBody[4] = population

  const prevBody = {}
  const trimmedNextBody = {}
  Area.find({ year: { $gte: start, $lte: end } })
    .sort({ year: 1 })
    .exec()
    .then((Areas) => {
      const areaPromises = Areas.map(area => new Promise((resolve, reject) => {
        const currYear = +area.year
        provinces.forEach((province) => {
          nextBody.forEach((singleValue, index) => {
            if (typeof nextBody[index] !== 'undefined' && !isEqual(area.data[province][index], nextBody[index])) {
              if (typeof prevBody[currYear] === 'undefined') prevBody[currYear] = {}
              if (typeof prevBody[currYear][province] === 'undefined') prevBody[currYear][province] = []
              if (typeof trimmedNextBody[currYear] === 'undefined') trimmedNextBody[currYear] = {}
              if (typeof trimmedNextBody[currYear][province] === 'undefined') trimmedNextBody[currYear][province] = []

              prevBody[currYear][province][index] = area.data[province][index]
              trimmedNextBody[currYear][province][index] = nextBody[index]
              area.data[province][index] = nextBody[index]
              area.markModified('data')
            }
          })
          if (typeof prevBody[currYear] !== 'undefined') {
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
      }))

      Promise.all(areaPromises).then(() => {
        // optimize prevBody and add revision record
        req.body.prevBody = getRanges(prevBody)
        req.body.nextBody = getRanges(trimmedNextBody)

        next()
      }, (error) => {
        next(error)
      })
    })
    .catch(e => next(e))
}

function revertSingle(req, res, next, year, newBody) {
  return new Promise((resolve, reject) => {
    const provinces = Object.keys(newBody)
    Area.findOne({ year })
      .exec()
      .then((area) => {
        provinces.forEach((province) => {
          const provinceValues = newBody[province]
          provinceValues.forEach((singleValue, index) => {
            if (typeof newBody[province][index] !== 'undefined' && area.data[province][index] !== newBody[province][index]) {
              area.data[province][index] = newBody[province][index]
              area.markModified('data')
            }
          })
        })
        area.save()
          .then(() => resolve())
          .catch(e => reject(e))
      })
      .catch(e => reject(e))
  })
}

/**
 * Update existing area
 * @property {string} req.body.areaname - The areaname of area.
 * @property {string} req.body.privilege - The privilege of area.
 * @returns {Area}
 */
function update(req, res, next) {
  const area = req.entity

  if (typeof req.body.year !== 'undefined') area.year = +req.body.year
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

function getRanges(obj) {
  const array = Object.keys(obj)
  const compressedObj = {}
  const ranges = []
  let rstart,
    rend
  for (let i = 0; i < array.length; i++) {
    rstart = array[i]
    rend = rstart
    while (array[i + 1] - array[i] === 1 && isEqual(obj[array[i + 1]], obj[array[i]])) {
      rend = array[i + 1] // increment the index if the numbers sequential
      i++
    }
    if (rstart === rend) {
      compressedObj[rstart.toString()] = obj[rstart]
    } else {
      compressedObj[`${rstart}-${rend}`] = obj[rstart]
    }
  }
  return compressedObj
}

export default { aggregateProvinces, aggregateDimension, load, get, create, update, updateMany, list, remove, revertSingle, defineEntity }
