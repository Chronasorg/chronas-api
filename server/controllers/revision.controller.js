import httpStatus from 'http-status';

import APIError from '../helpers/APIError.js';
import passError from '../helpers/pass-error.js';
import Revision from '../models/revision.model.js';
import Area from '../models/area.model.js';
import Marker from '../models/marker.model.js';
import Metadata from '../models/metadata.model.js';

import areaCtrl from './area.controller.js';
import userCtrl from './user.controller.js';
import markerCtrl from './marker.controller.js';
import metadataCtrl from './metadata.controller.js';

/**
 * Load revision and append to req.
 */
/**
 * Load one revision for GET /v1/revisions/:revisionId (admins only). A
 * missing revision is a 404; throttling or an outage is a 5xx.
 */
function load(req, res, next, id) {
  Revision.findById(id)
    .then((revision) => {
      if (!revision) return next(new APIError('Revision not found', httpStatus.NOT_FOUND, true));
      req.revision = revision;
      return next();
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
      if (shouldReturn) return passError(req, res, next, e);
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

  // add revision record. Long area ranges have already answered.
  revision.save()
    .then(() => {
      if (!res.headersSent) res.status(200).send('Areas successfully updated.');
    })
    .catch(e => passError(req, res, next, e));
}

function shallowDiff(a, b) {
  return Object.fromEntries(
    Object.entries(a).filter(([k, v]) => JSON.stringify(b[k]) !== JSON.stringify(v))
  );
}

export default { addUpdateRevision, addUpdateSingleRevision, addUpdateManyRevision, addCreateRevision, addDeleteRevision, load, get };
