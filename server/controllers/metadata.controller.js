import Metadata from '../models/metadata.model.js'
import Marker from '../models/marker.model.js'
import userCtrl from './user.controller.js'
import APIError from '../helpers/APIError.js'
import revisionCtrl from './revision.controller.js'
import { config, cache, initItemsAndLinksToRefresh } from '../../config/config.js'
import httpStatus from 'http-status'

const linkedTypeAccessor = {
  m: 0,
  markers: 0,
  marker: 0,
  area: 1,
  me: 1,
  metadata: 1
}

const nameAccByAEtype = {
  ruler: 0,
  culture: 0,
  capital: 0,
  religion: 0,
  religionGeneral: 0,
}

const wikiAccByAEtype = {
  ruler: 2,
  culture: 2,
  capital: 0,
  religion: 2,
  religionGeneral: 2,
}

const iconAccByAEtype = {
  ruler: 3,
  culture: 3,
  capital: 1,
  religion: 4,
  religionGeneral: 3,
}

/**
 * Load metadata and append to req.
 */
function load(req, res, next, id) {
  if (req.method === 'PUT' && initItemsAndLinksToRefresh.includes(id)) {
    if (id === 'links') {
      cache.del('links')
    } else {
      cache.del('init')
    }
  }

  if (req.method === 'GET' && id === 'links') {
    const cachedLinks = cache.get('links')
    if (cachedLinks) {
      req.entity = cachedLinks
      return next()
    }
  }

  Metadata.get(id, req.method)
    .then((metadata) => {
      req.entity = metadata // eslint-disable-line no-param-reassign
      return next()
    })
    .catch((e) => {
      if((id || "").substr(0,2) === "a_") {
        req.entity = {
          "_id": id,
          "data": {
            "influence": []
          }
        }
        return next()
      } else {
        res.status(httpStatus.NOT_FOUND).json({
          message: e.isPublic ? e.message : httpStatus[e.status],
          stack: config.env === 'development' ? e.stack : {}
        })
      }
    })
}

/**
 * Get metadata
 * @returns {Metadata}
 */
function get(req, res) {
  return res.json(req.entity)
}

/**
 * Create new metadata
 * @property {string} req.body.key - The key of metadata.
 * @property {string} req.body.data - The data of metadata.
 * @returns {Metadata}
 */
function create(req, res, next) {
  Metadata.findById(req.body._id)
    .exec()
    .then((foundMetadata) => {
      if (foundMetadata && !req.body.parentId) {
        // const err = new APIError('This id already exists!', 400)
        return res.status(400).send()
        // next(err)
      } else if (foundMetadata && req.body.parentId) {
        createNodeOne(foundMetadata, req, res, next)
      } else {
        const metadata = new Metadata({
          _id: req.body._id,
          coo: req.body.coo,
          data: req.body.data,
          wiki: req.body.wiki,
          type: req.body.type,
          subtype: req.body.subtype,
          year: req.body.year,
        })

        metadata.save({ checkKeys: false })
          .then(savedMetadata => res.json(savedMetadata))
          .catch(e => next(e))
      }
    })
    .catch(e => next(e))
}

function createNodeOne(metadata, req, res, next) {
  const parentId = req.body.parentId
  const childId = req.body.childId
  const childValue = req.body.childValue

  if (typeof metadata.data[parentId] !== 'undefined' &&
    typeof metadata.data[parentId][childId] !== 'undefined') {
    res.status(400).send('This entity already exists.')
  }

  if (typeof parentId !== 'undefined' &&
    typeof childId !== 'undefined' &&
    typeof metadata.data[parentId] !== 'undefined' &&
    typeof metadata.data[parentId][childId] === 'undefined' &&
    typeof childValue !== 'undefined') {
    metadata.data[parentId][childId] = childValue
    metadata.markModified('data')
  }

  metadata.save()
    .then(savedMetadata => res.json({}))
    .catch(e => next(e))
}

/**
 * Update existing metadata
 * @property {string} req.body.key - The key of metadata.
 * @property {string} req.body.data - The data of metadata.
 * @returns {Metadata}
 */
function update(req, res, next, fromRevision = false) {
  const metadata = req.entity
  if (typeof req.body._id !== 'undefined') metadata._id = req.body._id
  if (typeof req.body.coo !== 'undefined') metadata.coo = req.body.coo
  if (typeof req.body.data !== 'undefined') metadata.data = req.body.data
  if (typeof req.body.type !== 'undefined') metadata.type = req.body.type
  if (typeof req.body.subtype !== 'undefined') metadata.subtype = req.body.subtype
  if (typeof req.body.year !== 'undefined') metadata.year = req.body.year
  if (typeof req.body.wiki !== 'undefined') metadata.wiki = req.body.wiki
  if (typeof req.body.year !== 'undefined') metadata.year = req.body.year
  if (typeof req.body.score !== 'undefined') metadata.score = req.body.score

  metadata.save()
    .then((savedMetadata) => { if (!fromRevision) res.json(savedMetadata) })
    .catch((e) => { if (!fromRevision) next(e) })
}

function vote(delta) {
  return (req, res, next) => {
    const username = (req.auth || {}).username
    const metadata = req.entity
    metadata.score += delta

    metadata.save()
      .then((savedMetadata) => {
        if (username) userCtrl.changePoints(username, 'voted', 1)
        res.json(savedMetadata)
      })
      .catch(e => next(e))
  }
}

function updateSinglePromise(req, res, next, fromRevision = false) {
  return new Promise((resolve) => {
    updateSingle(req, res, next, fromRevision, resolve)
  })
}

function updateSingle(req, res, next, from = false, resolve) {
  const fromRevision = (from === 'revision')
  const metadata = req.entity
  const subEntityId = req.body.subEntityId
  const nextBody = req.body.nextBody

  if (!fromRevision && (!subEntityId || typeof subEntityId === "undefined" || subEntityId === "undefined" || typeof nextBody === "undefined" || (req.params.metadataId !== "province" && nextBody !== -1 && _isInvalidRgb(nextBody[1])))) {
    return res.status(400).send("Malformated parameters")
  }

  req.body.prevBody = metadata.data[subEntityId] || -1

  if (nextBody === -1) {
    // remove attribute again
    delete metadata.data[subEntityId]
  } else {
    metadata.data[subEntityId] = nextBody
  }
  metadata.markModified('data')
  metadata.save()
    .then(() => {
      if (!fromRevision) next()
      if (resolve) {
        return resolve()
      }
    })
    .catch((e) => {
      if (!fromRevision) next(e)
      if (resolve) {
        return resolve()
      }
    })
}

function updateLink(addLink) {
  return (req, res, next) => {
    updateLinkAtom(req, res, next, addLink)
  }
}

function updateLinkAtom(req, res, next, addLink, resolve = false) {
  if (!resolve) {
    const username = req.auth.username
    userCtrl.changePoints(username, 'linked', 1)
  }

  const linkedItemType1 = req.body.linkedItemType1
  const linkedItemType2 = req.body.linkedItemType2
  const linkedItemKey1 = req.body.linkedItemKey1
  const linkedItemKey2 = req.body.linkedItemKey2
  const type1 = req.body.type1
  const type2 = req.body.type2
  const prevValue1 = req.entity.data[`${linkedTypeAccessor[linkedItemType1]}:${linkedItemKey1}`] || false
  const prevValue2 = req.entity.data[`${linkedTypeAccessor[linkedItemType2]}:${linkedItemKey2}`] || false

  let newNextBody1 = (prevValue1) || [
      [],
      [],
  ]

  let newNextBody2 = (prevValue2) || [
      [],
      [],
  ]

  if (addLink) {
    if (newNextBody1[linkedTypeAccessor[linkedItemType2]].map(el => el[0]).indexOf(linkedItemKey2) === -1) {
      newNextBody1[linkedTypeAccessor[linkedItemType2]].push([linkedItemKey2, type2]) // [linkedItemKey2, type2] ?
    } else if (type2 === 'b') {
      newNextBody1[linkedTypeAccessor[linkedItemType2]] = newNextBody1[linkedTypeAccessor[linkedItemType2]].map((el) => {
        if (el[0] === linkedItemKey2) {
          el[1] = 'b'
        }
        return el
      })
    }
    if (newNextBody2[linkedTypeAccessor[linkedItemType1]].map(el => el[0]).indexOf(linkedItemKey1) === -1) {
      newNextBody2[linkedTypeAccessor[linkedItemType1]].push([linkedItemKey1, type1])
    } else if (type1 === 'b') {
      newNextBody2[linkedTypeAccessor[linkedItemType1]] = newNextBody2[linkedTypeAccessor[linkedItemType1]].map((el) => {
        if (el[0] === linkedItemKey1) {
          el[1] = 'b'
        }
        return el
      })
    }
  } else {
    newNextBody1[linkedTypeAccessor[linkedItemType2]] = newNextBody1[linkedTypeAccessor[linkedItemType2]].filter(el => el[0] !== linkedItemKey2)
    newNextBody2[linkedTypeAccessor[linkedItemType1]] = newNextBody2[linkedTypeAccessor[linkedItemType1]].filter(el => el[0] !== linkedItemKey1)

    if (newNextBody1[linkedTypeAccessor[linkedItemType2]] && newNextBody1[0].length === 0 && newNextBody1[1].length === 0) newNextBody1 = -1
    if (newNextBody2[linkedTypeAccessor[linkedItemType2]] && newNextBody2[0].length === 0 && newNextBody2[1].length === 0) newNextBody2 = -1
  }

  req.body.nextBody = newNextBody1
  req.body.subEntityId = `${linkedTypeAccessor[linkedItemType1]}:${linkedItemKey1}`
  updateSinglePromise(req, res, next, 'revision')
      .then(() => {
        if (!resolve) revisionCtrl.addUpdateSingleRevision(req, res, next, false)
        req.body.nextBody = newNextBody2
        req.body.subEntityId = `${linkedTypeAccessor[linkedItemType2]}:${linkedItemKey2}`
        return updateSinglePromise(req, res, next, 'revision')
          .then(() => {
            if (resolve) return resolve()
            revisionCtrl.addUpdateSingleRevision(req, res, next)
          })
      })
}

function getLinked(req, res, next, resolve = false) {
  const sourceItem = req.query.source || false

  const MAPIDS = ['a', 'b']
  const MEDIAIDS = ['e', 'b']

  if (!sourceItem) return res.status(400).send('query parameter "source" is required in the form of 0:markerId or 1:metadataId.')

  const linkedItems = req.entity.data[sourceItem] || false

  const resObj = {
    map: [],
    media: []
  }

  if (!linkedItems) {
    if (resolve) {
      return resolve(resObj)
    }
    return res.json(resObj)
  }

  const idTypeObj = {}
  const markerIdList = linkedItems[0].map((el) => {
    idTypeObj[el[0]] = el[1]
    return el[0]
  })

  const metadataAeList = linkedItems[1].filter(el => (el[0].indexOf('ae|') > -1)).map((el) => {
    idTypeObj[el[0]] = el[1]
    const aeArr = el[0].split('|')
    return aeArr
  }) || []

  const metadataIdList = linkedItems[1].map((el) => {
    idTypeObj[el[0]] = el[1]
    return el[0]
  })

  const mongoSearchQueryMarker = { _id: { $in: markerIdList } }
  const mongoSearchQueryMetadata = { _id: { $in: metadataIdList.concat(metadataAeList.map(el => el[1])) } }

  // TODO: links collection should be cached!
  Metadata.find(mongoSearchQueryMetadata)
    .lean()
    .exec()
    .then((metadataPre) => {
      const metadata = metadataPre.filter(el => !metadataAeList.map(el => el[1]).includes(el._id)) || []
      const aeEntities = []
      metadataAeList.forEach((el) => {
        const metaData = metadataPre.find(mEl => mEl._id === el[1]).data[el[2]]
        if (metaData) {
          aeEntities.push({
            properties: {
              n: metaData[nameAccByAEtype[el[1]]],
              w: metaData[wikiAccByAEtype[el[1]]],
              t: `${el[0]}|${el[1]}`,
              i: metaData[iconAccByAEtype[el[1]]],
              aeId: el.join('|'),
              ct: 'area'
            },
            geometry: {
            },
            type: 'Feature'
          })
        }
      })

      Marker.find(mongoSearchQueryMarker)
        .lean()
        .exec()
        .then((markers) => {
          const fullList = aeEntities.concat((markers || []).map(feature => ({
            properties: {
              n: feature.name || (feature.data || {}).title || feature.name,
              w: feature._id,
              y: feature.year,
              t: feature.type,
              f: (feature.data || {}).geojson,
              c: (feature.data || {}).content,
              src: (feature.data || {}).source,
              s: feature.score,
              ct: 'marker'
            },
            geometry: {
              coordinates: feature.coo,
              type: 'Point'
            },
            type: 'Feature'
          }))).concat(metadata.map(feature => ({
            properties: {
              n: feature.name || (feature.data || {}).title || feature._id,
              id: feature._id,
              w: feature.wiki || feature._id,
              s: feature.score,
              src: (feature.data || {}).source,
              y: feature.year,
              f: (feature.data || {}).geojson,
              c: (feature.data || {}).content,
              t: feature.subtype || feature.type,
              ct: 'metadata'
            },
            geometry: {
              coordinates: feature.coo,
              type: 'Point'
            },
            type: 'Feature'
          })))

          fullList.forEach((el) => {
            if (MAPIDS.includes(idTypeObj[el.properties.aeId || el.properties.id || el.properties.w])) {
              resObj.map.push(el)
            }
            if (MEDIAIDS.includes(idTypeObj[el.properties.aeId || el.properties.id || el.properties.w])) {
              resObj.media.push(el)
            }
          })

          if (resolve) {
            return resolve(resObj)
          }
          return res.json(resObj)
        })
    })
    .catch(e => res.status(500).send(e))
}

/**
 * Get metadata list.
 * @property {number} req.query.offset - Number of metadata to be skipped.
 * @property {number} req.query.length - Limit number of metadata to be returned.
 * @returns {Metadata[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'createdAt', order = 'asc', filter = '' } = req.query
  const fList = req.query.f || false
  const locale = req.query.locale || false
  const type = req.query.type || false
  const subtype = req.query.subtype || false
  const year = +req.query.year || false
  const delta = +req.query.delta || 10
  const wiki = req.query.wiki || false
  const search = req.query.search || false
  const mustGeo = req.query.geo || false
  const discover = req.query.discover || false

  Metadata.list({ start, end, sort, order, mustGeo, filter, fList, locale, type, subtype, year, delta, wiki, search, discover })
    .then((metadata) => {
      if (count) {
        Metadata.count().exec().then((metadataCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count')
          res.set('X-Total-Count', metadataCount)
          res.json(metadata)
        })
      } else {
        res.json(metadata)
      }
    })
    .catch(e => next(e))
}

/**
 * Delete metadata.
 * @returns {Metadata}
 */
function remove(req, res, next, fromRevision = false) {
  const metadata = req.entity
  metadata.deleteOne()
    .then((deletedMarker) => {
      if (!fromRevision) {
        res.json(deletedMarker)
      }
    })
    .catch(e => next(e))
}

function defineEntity(req, res, next) {
  req.resource = 'metadata'
  next()
}

function _isInvalidRgb(rgb) {
  const rxValidRgb = /([R][G][B][A]?[(]\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])\s*,\s*([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])(\s*,\s*((0\.[0-9]{1})|(1\.0)|(1)))?[)])/i

  if (rxValidRgb.test(rgb)) {
    return false
  } else {
    return true
  }
}

export default { defineEntity, getLinked, load, get, updateLink, updateLinkAtom, create, update, updateSingle, list, remove, vote }
