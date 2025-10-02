import Promise from 'bluebird';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError.js';

/**
 * Revision Schema
 */
const RevisionSchema = new mongoose.Schema({
  // _id: { // RESOURCE (or TRANSACTION) ID + increment?, automatic?
  //   type: String,
  //   required: true
  // },
  type: { // POST, PUT, DELETE
    type: String,
    required: true
  },
  entityId: { // id of the resource
    type: String,
    required: true
  },
  subEntityId: { // accessId used for metadata
    type: String
  },
  resource: { // Marker, AREA, ...
    type: String,
    required: true
  },
  user: {
    type: String,
    required: true
  },
  nextBody: {
    type: String
  },
  prevBody: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  reverted: {
    type: Boolean,
    default: false
  }
}, { versionKey: false });

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */

/**
 * Methods
 */
RevisionSchema.method({
});

/**
 * Statics
 */
RevisionSchema.statics = {
  /**
   * Get Revision
   * @param {ObjectId} id - The objectId of Revision.
   * @returns {Promise<Revision, APIError>}
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((revision) => {
        if (revision) {
          return revision;
        }
        const err = new APIError('No such revision exists!', httpStatus.NOT_FOUND);
        return Promise.reject(err);
      });
  },

  /**
   * List revisions in descending order of 'createdAt' timestamp.
   * @param {number} offset - Number of year to start from.
   * @param {number} length - Limit number of revisions to be returned.
   * @returns {Promise<Revision[]>}
   */
  list({ start = 0, end = 50, entity, user, order, subentity, reverted, sort = 'timestamp' } = {}) {
    const optionalFind = (entity) ? { entityId: entity } : {};
    if (subentity) {
      optionalFind.subEntityId = subentity;
    }
    if (typeof reverted !== 'undefined') {
      optionalFind.reverted = reverted;
    }
    if (typeof user !== 'undefined') {
      optionalFind.user = user;
    }

    return this.find(optionalFind)
      .sort({ [sort]: order })
      .skip(+start)
      .limit(end - start)
      .lean()
      .exec()
      .then(revisions => revisions.map((obj) => {
        const nextBodyString = (JSON.stringify(obj.nextBody) || '').substring(0, 400);
        const prevBodyString = (JSON.stringify(obj.prevBody) || '').substring(0, 400);

        if (typeof obj.nextBody !== 'undefined') { obj.nextBody = nextBodyString + ((nextBodyString.length === 403) ? '...' : ''); }
        if (typeof obj.prevBody !== 'undefined') { obj.prevBody = prevBodyString + ((prevBodyString.length === 403) ? '...' : ''); }
        return obj;
      }));
  }
};

/**
 * @typedef Revision
 */
export default mongoose.model('Revision', RevisionSchema);
