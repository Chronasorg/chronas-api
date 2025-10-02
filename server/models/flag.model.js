import Promise from 'bluebird';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError.js';

/**
 * Flag Schema
 */
const FlagSchema = new mongoose.Schema({
  // _id: { // RESOURCE (or TRANSACTION) ID + increment?, automatic?
  //   type: String,
  //   required: true
  // },
  fullUrl: { // id of the resource
    type: String
  },
  subEntityId: {
    type: String
  },
  resource: {
    type: String
  },
  wrongWiki: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  fixed: {
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
FlagSchema.method({
});

/**
 * Statics
 */
FlagSchema.statics = {
  /**
   * Get Flag
   * @param {ObjectId} id - The objectId of Flag.
   * @returns {Promise<Flag, APIError>}
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((flag) => {
        if (flag) {
          return flag;
        }
        const err = new APIError('No such flag exists!', httpStatus.NOT_FOUND);
        return Promise.reject(err);
      });
  },

  /**
   * List flags in descending order of 'createdAt' timestamp.
   * @param {number} offset - Number of year to start from.
   * @param {number} length - Limit number of flags to be returned.
   * @returns {Promise<Flag[]>}
   */
  list({ start = 0, end = 50, entity, order, subentity, fixed, sort = 'timestamp' } = {}) {
    const optionalFind = (entity) ? { entityId: entity } : {};
    if (subentity) {
      optionalFind.subEntityId = subentity;
    }
    if (typeof fixed !== 'undefined') {
      optionalFind.fixed = fixed;
    }

    return this.find(optionalFind)
      .sort({ [sort]: order })
      .skip(+start)
      .limit(end - start)
      .lean()
      .exec()
      .then(flags => flags.map((obj) => {
        obj.fullUrl = decodeURIComponent(obj.fullUrl);

        return obj;
      }));
  }
};

/**
 * @typedef Flag
 */
export default mongoose.model('Flag', FlagSchema);
