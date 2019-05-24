import { omit } from 'underscore'
import { APICustomResponse, APIError } from '../../server/helpers/APIError'
import Collection from '../models/collection.model'
import { config } from '../../config/config'
import httpStatus from 'http-status'
import Marker from "../models/marker.model";
import Metadata from "../models/metadata.model";
import userCtrl from "./user.controller";

const markersTypes = ['w', 'w|b', 'w|si', 'w|c', 'w|ca', 'w|m', 'w|p', 'w|e', 'w|s', 'w|a', 'w|r', 'w|at', 'w|op', 'w|l', 'w|o']
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
 * Load collection and append to req.
 */
function load(req, res, next, id) {
  console.debug('load',req, id)
  Collection.findById(id)
    .then((collection) => {
      req.collection = collection // eslint-disable-line no-param-reassign
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
 * Get collection
 * @returns {Collection}
 */
function get(req, res) {
  const MAPIDS = ['a', 'b']
  const MEDIAIDS = ['e', 'b']
  const returnCollection = req.collection.toObject()

  const linkedItems = returnCollection.slides || []
  returnCollection.map = []
  returnCollection.media = []

  if (!linkedItems) {
    return res.json(returnCollection)
  }

  const idTypeObj = {}
  const markerIdList = []
  const metadataAeList = []
  const metadataIdList = []

  linkedItems.forEach((el, index) => {
    const [wikiId, typeId] = el.split('||')
    if (markersTypes.indexOf(typeId) > -1) {
      idTypeObj[wikiId] = ['a', index]
      markerIdList.push(wikiId)
    }
    else if (typeId.indexOf('ae|') > -1) {
      const [ae, type] = typeId.split('|')
      idTypeObj[[ae, type, wikiId].join('|')] = ['a', index]
      metadataAeList.push([ae, type, wikiId])
    }
    else {
      idTypeObj[wikiId] = ['e', index]
      metadataIdList.push(wikiId)
    }
  })

  const mongoSearchQueryMarker = { _id: { $in: markerIdList } }
  const mongoSearchQueryMetadata = { _id: { $in: metadataIdList.concat(metadataAeList.map(el => el[1])) } }

  console.debug(markerIdList, metadataIdList, metadataAeList)
  // TODO: links collection should be cached!
  // console.debug("mongoSearchQueryMetadata", mongoSearchQueryMetadata)
  // return res.json(returnCollection)
  Metadata.find(mongoSearchQueryMetadata)
    .lean()
    .exec()
    .then((metadataPre) => {
      const metadata = metadataPre.filter(el => !metadataAeList.map(el => el[1]).includes(el._id)) || []
      const aeEntities = []
      metadataAeList.forEach((el) => {
        // console.debug('res22',metadataPre, el)
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
      console.debug("mongoSearchQueryMarker", mongoSearchQueryMarker)
      Marker.find(mongoSearchQueryMarker)
        .lean()
        .exec()
        .then((markers) => {
          console.debug("markers",markers)
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
            if (el.properties.w || MAPIDS.includes(idTypeObj[el.properties.aeId || el.properties.id || el.properties.w][0])) {
              returnCollection.map.push({ ...el, order: idTypeObj[el.properties.aeId || el.properties.id || el.properties.w][1]})
            }
            if (MEDIAIDS.includes(idTypeObj[el.properties.aeId || el.properties.id || el.properties.w][0])) {
              returnCollection.media.push({ ...el, order: idTypeObj[el.properties.aeId || el.properties.id || el.properties.w][1]})
            }
          })

          return res.json(returnCollection)
        })
    })
    .catch(e => res.status(500).send(e))
}

function updateBookmark(req, res, next) {

  console.debug('updateBookmark')
  const { username = false, toUpdate = false, toAdd = -1, collection = false } = req.query
  if (!collection || !username || !toUpdate || toAdd === -1) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: 'username, toUpdate, toAdd is required as query parameters',
    })
  }

  const findObj = (collection === 'bookmark') ? { title: 'Bookmarks', owner: username } : { _id: collection}

  Collection.findOne(findObj)
    .exec()
    .then((foundBookmark) => {
      console.debug('foundBookmark',foundBookmark)
      if (foundBookmark) {
        // update and return
        console.debug('1')
        if (!foundBookmark.isPublic && foundBookmark.owner !== username) {
          return res.status(httpStatus.NOT_FOUND).json({
            message: 'Collection is not public and you are not the owner',
          })
        }
        console.debug('12', foundBookmark)
        if (toAdd === "true") {
          foundBookmark.slides = [ ...foundBookmark.slides, toUpdate]
        } else {
          foundBookmark.slides = (foundBookmark.slides || []).filter(el => el !== toUpdate)
        }
        console.debug('1foundBookmark', foundBookmark)
        foundBookmark.save()
          .then((savedBookmarks) => {
            return res.json(savedBookmarks)
          })
          .catch(e => next(e))
      } else {
        const newBookmarks = new Collection({
          title: "Bookmarks",
          owner: username,
          isPublic: false,
          allowClickAway: true,
          drawRoute: false,
          changeYearByArticle: false,
          slides: toAdd === "true" ? [toUpdate] : []
        })

        newBookmarks.save()
          .then((savedBookmarks) => {
            return res.json(savedBookmarks)
          })
          .catch(e => next(e))
      }
    })
    .catch(e => next(e))
}

function update(req, res, next) {
  const collection = req.collection

  if (typeof req.body.title !== 'undefined') collection.title =  req.body.title
  if (typeof req.body.description !== 'undefined') collection.description =  req.body.description
  if (typeof req.body.owner !== 'undefined') collection.owner =  req.body.owner
  if (typeof req.body.avatar !== 'undefined') collection.avatar =  req.body.avatar
  if (typeof req.body.coo !== 'undefined') collection.coo = req.body.coo
  if (typeof req.body.yearRange !== 'undefined') collection.yearRange = req.body.yearRange
  if (typeof req.body.viewport !== 'undefined') collection.viewport = req.body.viewport
  if (typeof req.body.year !== 'undefined') collection.year = req.body.year
  if (typeof req.body.slides !== 'undefined') collection.slides = req.body.slides
  if (typeof req.body.quiz !== 'undefined') collection.quiz = req.body.quiz
  if (typeof req.body.allowClickAway !== 'undefined') collection.allowClickAway = req.body.allowClickAway
  if (typeof req.body.drawRoute !== 'undefined') collection.drawRoute = req.body.drawRoute
  if (typeof req.body.changeYearByArticle !== 'undefined') collection.changeYearByArticle = req.body.changeYearByArticle
  if (typeof req.body.isPublic !== 'undefined') collection.isPublic = req.body.isPublic

  collection.save()
    .then(savedCollection => res.json(savedCollection))
    .catch(e => next(e))
}


function create(req, res, next) {
  const collection = new Collection({
    title: req.body.title,
    description: req.body.description,
    owner: req.body.owner,
    avatar: req.body.avatar,
    coo: req.body.coo,
    yearRange: req.body.yearRange,
    viewport: req.body.viewport,
    year: req.body.year,
    slides: req.body.slides,
    quiz: req.body.quiz,
    allowClickAway: req.body.allowClickAway,
    drawRoute: req.body.drawRoute,
    changeYearByArticle: req.body.changeYearByArticle,
    isPublic: req.body.isPublic
  })

  userCtrl.changePoints(req.body.owner, 'voted', 1)
  collection.save()
    .then((savedCollection) => {
      res.json(savedCollection)
    })
    .catch(e => next(e))
    // })
    // .catch(e => next(e))
}

/**
 * Get collection list.
 * @property {number} req.query.offe - Number of collections to be skipped.
 * @property {number} req.query.limit - Limit number of collections to be returned.
 * @returns {Collection[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'timestamp', username = false, entity = false, subentity = false, order = 'asc', filter = '' } = req.query
  let potentialEntity = false
  let potentialSubentity = false
  const fEntity = (potentialEntity || entity)
  const fSubentity = (potentialSubentity || subentity)

  if (username) {
    Collection.list({ start, end, sort, order, entity: fEntity, username: username, subentity: fSubentity, filter })
      .then((privateCollections) => {
        Collection.list({ start, end, sort, order, entity: fEntity, subentity: fSubentity, filter })
          .then((publicCollections) => {
            res.json([privateCollections.sort((a, b) => {
              const textA = a.title
              const textB = b.title
              return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
            }), publicCollections.sort((a, b) => {
              const textA = a.title
              const textB = b.title
              return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
            })])
          })
          .catch(e => next(e))
      })
      .catch(e => next(e))
  } else {
    Collection.list({ start, end, sort, order, entity: fEntity, subentity: fSubentity, filter })
      .then((collections) => {
        if (count) {
          const optionalFind = (fEntity) ? { entityId: fEntity } : {}
          if (fSubentity) {
            optionalFind.subEntityId = fSubentity
          }
          Collection.find(optionalFind).count().exec().then((collectionCount) => {
            res.set('Access-Control-Expose-Headers', 'X-Total-Count')
            res.set('X-Total-Count', collectionCount)
            res.json(collections)
          })
        } else {
          res.json(collections)
        }
      })
      .catch(e => next(e))
  }
}

/**
 * Delete collection.
 * @returns {Collection}
 */
function remove(req, res, next) {
  const collection = req.collection
  collection.remove()
    .then(deletedCollection => res.json(deletedCollection))
    // .then(deletedCollection => next(new APICustomResponse(`${deletedCollection} deleted successfully`, 204, true)))
    .catch(e => next(e))
}

export default { create, load, get, update, updateBookmark, list, remove }
