import { omit } from 'underscore';
import httpStatus from 'http-status';
import Promise from 'bluebird';

import { APICustomResponse, APIError } from '../../server/helpers/APIError.js';
import logger from '../../config/winston.js';
import Revision from '../models/revision.model.js';
import Area from '../models/area.model.js';
import Marker from '../models/marker.model.js';
import Metadata from '../models/metadata.model.js';
import { cache, config, initItemsAndLinksToRefresh } from '../../config/config.js';

import areaCtrl from './area.controller.js';
import userCtrl from './user.controller.js';
import markerCtrl from './marker.controller.js';
import metadataCtrl from './metadata.controller.js';

/**
 * Load revision and append to req.
 */
function load(req, res, next, id) {
  const resourceCollection = {
    areas: { id: 'year', model: Area, controller: areaCtrl },
    markers: { id: 'wiki', model: Marker, controller: markerCtrl },
    metadata: { id: '_id', model: Metadata, controller: metadataCtrl }
  };

  Revision.findById(id)
    .then((revision) => {
      req.revision = revision; // eslint-disable-line no-param-reassign
      // loadEntity
      const { resource } = revision;
      const { entityId } = revision;

      if (entityId === 'MANY') {
        next();
      } else {
        resourceCollection[resource].model.findById(entityId)
          .then((entity) => {
            if (resource === 'metadata' && initItemsAndLinksToRefresh.includes(entityId)) {
              if (id === 'links') {
                cache.del('links');
              } else {
                cache.del('init');
              }
            }

            req.entity = entity; // eslint-disable-line no-param-reassign
            return next();
          })
          .catch(e => res.status(httpStatus.NOT_FOUND).json({
            message: e.isPublic ? e.message : httpStatus[e.status],
            stack: config.env === 'development' ? e.stack : {}
          }));
      }
    })
    .catch(e => next(e));
}


/**
 * Get revision
 * @returns {Revision}
 */
function get(req, res) {
  return res.json(req.revision);
}

function addCreateRevision(req, res, next) {
  if (req.query.r === 'false') {
    next();
    return;
  }

  const resourceCollection = {
    areas: { id: 'year', model: Area, controller: areaCtrl },
    markers: { id: 'wiki', model: Marker, controller: markerCtrl },
    metadata: { id: '_id', model: Metadata, controller: metadataCtrl }
  };
  const { username } = req.auth;
  userCtrl.changePoints(username, 'created', 1);

  const entityId = decodeURIComponent(req.body[resourceCollection[req.resource].id]);
  const revision = new Revision({
    entityId,
    type: 'CREATE',
    subtype: req.body.subtype,
    start: req.body.start,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(req.body)
  });

  // add revision record
  revision.save()
    .then(() => {
      next();
    })
    .catch(e => next(e));
}

function addDeleteRevision(req, res, next) {
  const { entity } = req;
  const { username } = req.auth;
  userCtrl.changePoints(username, 'deleted', 1);

  const revision = new Revision({
    entityId: entity._id,
    type: 'DELETE',
    user: username,
    resource: req.resource,
    prevBody: JSON.stringify(entity)
  });

  // add revision record
  revision.save()
    .then(() => {
      next();
    })
    .catch(e => next(e));
}

function addUpdateRevision(req, res, next) {
  const { entity } = req;
  const { username } = req.auth;
  userCtrl.changePoints(username, 'updated', 1);

  const nextBody =
    (req.resource === 'areas')
      ? (entity._id === 'MANY')
        ? req.body.nextBody
        : shallowDiff(req.body.data, entity.toObject().data)
      : shallowDiff(req.body, entity.toObject());

  const prevBody =
    (req.resource === 'areas')
      ? (entity._id === 'MANY')
        ? req.body.prevBody
        : shallowDiff(entity.toObject().data, req.body.data)
      : shallowDiff(entity.toObject(), req.body);

  if (typeof nextBody !== 'undefined') {
    delete nextBody.id;
    delete nextBody._id;
  }

  if (typeof prevBody !== 'undefined') {
    delete prevBody.id;
    delete prevBody._id;
  }

  const revision = new Revision({
    entityId: entity._id,
    type: 'UPDATE',
    subtype: req.body.subtype,
    start: req.body.start,
    end: req.body.end,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nextBody),
    prevBody: JSON.stringify(prevBody)
  });

  // add revision record
  revision.save()
    .then(() => {
      next();
    })
    .catch(e => next(e));
}

function addUpdateSingleRevision(req, res, next, shouldReturn = true) {
  const { entity } = req;
  const { username } = req.auth;
  userCtrl.changePoints(username, 'updated', 1);

  const { prevBody, nextBody } = req.body;

  if (typeof nextBody !== 'undefined') {
    delete nextBody.id;
    delete nextBody._id;
  }

  if (typeof prevBody !== 'undefined') {
    delete prevBody.id;
    delete prevBody._id;
  }

  const revision = new Revision({
    entityId: entity._id,
    type: 'UPDATE',
    subEntityId: req.body.subEntityId,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nextBody),
    prevBody: JSON.stringify(prevBody)
  });

  revision.save()
    .then(() => {
      if (shouldReturn) return res.status(200).send('Metadata successfully updated.');
    })
    .catch((e) => {
      if (shouldReturn) return res.status(500).send(e);
    });
}

function addUpdateManyRevision(req, res, next) {
  const { username } = req.auth;
  userCtrl.changePoints(username, 'updated', 1);

  const { prevBody, nextBody } = req.body;

  delete nextBody.id;
  delete prevBody.id;
  delete nextBody._id;
  delete prevBody._id;

  const revision = new Revision({
    entityId: 'MANY',
    type: 'UPDATE',
    subtype: req.body.subtype,
    start: req.body.start,
    end: req.body.end,
    user: username,
    resource: req.resource,
    nextBody: JSON.stringify(nextBody),
    prevBody: JSON.stringify(prevBody)
  });

  // add revision record
  revision.save()
    .then(() => {
      res.status(200).send('Areas successfully updated.');
    })
    .catch(e => res.status(500).send(e));
}

/**
 * Update existing revision
 * @property {string} req.body.name - The name of revision.
 * @property {string} req.body.privilege - The privilege of revision.
 * @returns {Revision}
 */
function update(req, res, next) {
  const { revision } = req; // .toObject()
  const { resource } = revision;
  const { username } = req.auth;
  const usernameAuthor = revision.user;

  const resourceCollection = {
    areas: { id: 'year', model: Area, controller: areaCtrl },
    markers: { id: 'wiki', model: Marker, controller: markerCtrl },
    metadata: { id: '_id', model: Metadata, controller: metadataCtrl }
  };
  userCtrl.changePoints(username, 'reverted', 1);
  switch (revision.type) {
  case 'CREATE':
    if (revision.reverted) {
      userCtrl.changePoints(usernameAuthor, 'mistakes', -1);
      // post nextBody
      req.body = JSON.parse(revision.nextBody);
      resourceCollection[resource].controller.create(req, res, next, true);
    } else {
      userCtrl.changePoints(usernameAuthor, 'mistakes', 1);
      // was post, so delete again by id nextBody
      resourceCollection[resource].controller.remove(req, res, next, true);
    }
    break;
  case 'UPDATE':
    if (revision.reverted) {
      userCtrl.changePoints(usernameAuthor, 'mistakes', -1);
      // was updated, so put prevBody
      if (revision.entityId === 'MANY') {
        const unpackedObj = unpackObj(JSON.parse(revision.nextBody));
        const yearToUpdate = Object.keys(unpackedObj).map(year => [year, unpackedObj[year]]);

        yearToUpdate.reduce(
          (p, x) => p.then(_ => new Promise((resolve) => {
            resourceCollection[resource].controller.revertSingle(req, res, next, x[0], x[1]).then(() => resolve());
          }))
          , Promise.resolve()
        );
      } else if (revision.subEntityId && revision.resource === 'metadata') {
        req.body.nextBody = JSON.parse(revision.nextBody);
        req.body.subEntityId = revision.subEntityId;
        resourceCollection[resource].controller.updateSingle(req, res, next, 'revision');
      } else {
        req.body = JSON.parse(revision.nextBody);
        resourceCollection[resource].controller.update(req, res, next, true);
      }
    } else {
      userCtrl.changePoints(usernameAuthor, 'mistakes', 1);
      // update to nextBody
      if (revision.entityId === 'MANY') {
        const unpackedObj = unpackObj(JSON.parse(revision.prevBody));
        const yearToUpdate = Object.keys(unpackedObj).map(year => [year, unpackedObj[year]]);

        yearToUpdate.reduce(
          (p, x) => p.then(_ => new Promise((resolve) => {
            resourceCollection[resource].controller.revertSingle(req, res, next, x[0], x[1]).then(() => resolve());
          }))
          , Promise.resolve()
        );
      } else if (revision.subEntityId && revision.resource === 'metadata') {
        req.body.nextBody = JSON.parse(revision.prevBody);
        req.body.subEntityId = revision.subEntityId;
        resourceCollection[resource].controller.updateSingle(req, res, next, 'revision');
      } else {
        req.body = JSON.parse(revision.prevBody);
        resourceCollection[resource].controller.update(req, res, next, 'revision');
      }
    }
    break;
  case 'DELETE':
    if (revision.reverted) {
      userCtrl.changePoints(usernameAuthor, 'mistakes', -1);
      // delete by id prevBody
      resourceCollection[resource].controller.remove(req, res, next, true);
    } else {
      userCtrl.changePoints(usernameAuthor, 'mistakes', 1);
      // was deleted, so post prevBody
      req.body = JSON.parse(revision.prevBody);
      resourceCollection[resource].controller.create(req, res, next, true);
    }
    break;
  default:
    next();
    break;
  }

  //        prev  next
  //  POST        X
  //  PUT   X     X
  // DELETE X

  revision.lastUpdated = Date.now();
  revision.reverted = !revision.reverted;

  revision.save()
    .then((savedRevision) => {
      const nextBodyString = (JSON.stringify(savedRevision.nextBody) || '').substring(0, 400);
      const prevBodyString = (JSON.stringify(savedRevision.prevBody) || '').substring(0, 400);

      if (typeof savedRevision.nextBody !== 'undefined') { savedRevision.nextBody = nextBodyString + ((nextBodyString.length === 403) ? '...' : ''); }
      if (typeof savedRevision.prevBody !== 'undefined') { savedRevision.prevBody = prevBodyString + ((prevBodyString.length === 403) ? '...' : ''); }

      res.json(savedRevision);
    })
    .catch(e => next(e));
}

/**
 * Get revision list.
 * @property {number} req.query.offe - Number of revisions to be skipped.
 * @property {number} req.query.limit - Limit number of revisions to be returned.
 * @returns {Revision[]}
 */
function list(req, res, next) {
  const { start = 0, end = 10, count = 0, sort = 'timestamp', entity = false, subentity = false, order = 'asc', filter = '' } = req.query;
  let potentialUser;
  let potentialReverted;
  let potentialEntity = false;
  let potentialSubentity = false;
  if (filter) {
    const fullFilter = JSON.parse(filter);
    potentialUser = fullFilter.user;
    potentialReverted = fullFilter.reverted;
    potentialEntity = fullFilter.entity;
    potentialSubentity = fullFilter.subentity;
  }
  const fEntity = (potentialEntity || entity);
  const fSubentity = (potentialSubentity || subentity);
  Revision.list({ start, end, sort, order, entity: fEntity, user: potentialUser, subentity: fSubentity, reverted: potentialReverted, filter })
    .then((revisions) => {
      if (count) {
        const optionalFind = (fEntity) ? { entityId: fEntity } : {};
        if (fSubentity) {
          optionalFind.subEntityId = fSubentity;
        }
        Revision.find(optionalFind).count().exec().then((revisionCount) => {
          res.set('Access-Control-Expose-Headers', 'X-Total-Count');
          res.set('X-Total-Count', revisionCount);
          res.json(revisions);
        });
      } else {
        res.json(revisions);
      }
    })
    .catch(e => next(e));
}

/**
 * Delete revision.
 * @returns {Revision}
 */
function remove(req, res, next) {
  const { revision } = req;
  revision.remove()
    .then(deletedRevision => res.json(deletedRevision))
    // .then(deletedRevision => next(new APICustomResponse(`${deletedRevision} deleted successfully`, 204, true)))
    .catch(e => next(e));
}

function shallowDiff(a, b) {
  return omit(a, (v, k) => JSON.stringify(b[k]) === JSON.stringify(v));
}

function unpackObj(obj) {
  const array = Object.keys(obj);
  const unpackedObj = {};
  for (let i = 0; i < array.length; i++) {
    const years = array[i].split('-');
    for (let j = years[0]; j <= (isNaN(years[1]) ? years[0] : years[1]); j++) {
      unpackedObj[j] = obj[array[i]];
    }
  }
  return unpackedObj;
}

export default { addUpdateRevision, addUpdateSingleRevision, addUpdateManyRevision, addCreateRevision, addDeleteRevision, load, get, update, list, remove };
