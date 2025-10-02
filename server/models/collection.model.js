import Promise from 'bluebird';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError.js';

/**
 * Collection Schema
 */
const CollectionSchema = new mongoose.Schema({
  // _id: { // RESOURCE (or TRANSACTION) ID + increment?, automatic?
  //   type: String,
  //   required: true
  // },
  avatar: {
    type: String
  },
  title: {
    type: String
  },
  description: {
    type: String
  },
  owner: {
    type: String
  },
  coo: {
    type: [Number],
    required: false,
    default: undefined,
    validate: v => typeof v === 'undefined' || v.length === 0 || (v[1] > -90 && v[1] < 90 && v[0] > -180 && v[0] < 180)
  },
  yearRange: {
    type: [Number],
    required: false,
    default: undefined,
    validate: v => typeof v === 'undefined' || v.length === 0 || (v.length === 2 && v[1] > -2001 && v[1] < 2001 && v[0] > -2001 && v[0] < 2001)
  },
  viewport: {
    type: [Number],
    required: false,
    default: undefined,
    validate: v => typeof v === 'undefined' || v.length === 0 || (v.length === 4 && v[1] > -90 && v[1] < 90 && v[0] > -180 && v[0] < 180 && v[3] > -90 && v[3] < 90 && v[2] > -180 && v[2] < 180)
  },
  year: {
    type: Number,
    index: true
  },
  created: {
    type: Date,
    default: Date.now
  },
  slides: {
    type: Array,
    default: []
  },
  quiz: {
    type: Array,
    default: undefined
  },
  allowClickAway: {
    type: Boolean,
    default: true
  },
  isStory: {
    type: Boolean,
    default: false
  },
  drawRoute: {
    type: Boolean,
    default: false
  },
  changeYearByArticle: {
    type: Boolean,
    default: false
  },
  isPublic: {
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
CollectionSchema.method({
});

/**
 * Statics
 */
CollectionSchema.statics = {
  /**
   * Get Collection
   * @param {ObjectId} id - The objectId of Collection.
   * @returns {Promise<Collection, APIError>}
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((collection) => {
        if (collection) {
          return collection;
        }
        const err = new APIError('No such collection exists!', httpStatus.NOT_FOUND);
        return Promise.reject(err);
      });
  },

  /**
   * List collections in descending order of 'createdAt' timestamp.
   * @param {number} offset - Number of year to start from.
   * @param {number} length - Limit number of collections to be returned.
   * @returns {Promise<Collection[]>}
   */
  list({ start = 0, end = 50, entity, order, subentity, sort = 'timestamp', username = false } = {}) {
    const optionalFind = (entity) ? { entityId: entity } : {};
    if (subentity) {
      optionalFind.subEntityId = subentity;
    }

    if (username) {
      optionalFind.isPublic = false;
      optionalFind.owner = username;
    } else {
      optionalFind.isPublic = true;
    }
    return this.find(optionalFind)
      .sort({ [sort]: order })
      .skip(+start)
      .limit(end - start)
      .lean()
      .exec()
      .then(collections => collections);
  }
};

/**
 * @typedef Collection
 */
export default mongoose.model('Collection', CollectionSchema);
