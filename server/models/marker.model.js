/**
 * Legacy Marker Model
 *
 * Simplified marker model compatible with existing controllers
 * Maintains backward compatibility with the original schema
 */

import Promise from 'bluebird';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

import APIError from '../helpers/APIError.js';

/**
 * Marker Schema - Legacy Compatible
 */
const MarkerSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  year: {
    type: Number,
    required: true,
    index: true
  },

  // Legacy coordinate format [longitude, latitude]
  coo: {
    type: [Number],
    validate: {
      validator: function (v) {
        return !v || (Array.isArray(v) && v.length === 2 &&
               v[1] >= -90 && v[1] <= 90 &&
               v[0] >= -180 && v[0] <= 180);
      },
      message: 'Invalid coordinates format'
    }
  },

  // Secondary coordinates (if needed)
  coo2: {
    type: [Number]
  },

  // Marker type
  type: {
    type: String,
    required: true,
    index: true
  },

  // Capital flag
  capital: {
    type: Boolean,
    default: false
  },

  // HTML content
  html: {
    type: String
  },

  // Part of relationship
  partOf: {
    type: String
  },

  // End year
  end: {
    type: Number
  },

  // Wiki reference
  wiki: {
    type: String,
    trim: true
  },

  // Score for ranking
  score: {
    type: Number,
    default: 0
  },

  // Additional data
  data: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  versionKey: false,
  timestamps: false
});

// Indexes for performance
MarkerSchema.index({ year: 1, type: 1 });
MarkerSchema.index({ name: 1 });
MarkerSchema.index({ wiki: 1 });
MarkerSchema.index({ type: 1 });
MarkerSchema.index({ partOf: 1 });

/**
 * Methods
 */
MarkerSchema.method({
});

/**
 * Statics
 */
MarkerSchema.statics = {
  /**
   * Get marker by ID
   * @param {string} id - Marker ID
   * @returns {Promise<Marker, APIError>}
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((marker) => {
        if (marker) {
          return marker;
        }
        const err = new APIError('No such marker exists!', httpStatus.NOT_FOUND);
        return Promise.reject(err);
      });
  },

  /**
   * List markers with filtering options
   * @param {Object} options - Query options
   * @returns {Promise<Marker[]>}
   */
  list(options = {}) {
    const {
      start = 0,
      length = 2000,
      sort = 'name',
      order = 'asc',
      filter = '',
      year,
      end,
      delta = 10,
      includeMarkers = true,
      typeArray,
      wikiArray,
      search,
      both,
      format,
      migrationDelta
    } = options;

    if (!includeMarkers) {
      return Promise.resolve([]);
    }

    // Build query
    const query = {};

    // Year filtering with delta
    if (year !== false && year !== undefined) {
      const actualDelta = migrationDelta || delta;
      query.year = {
        $gte: year - actualDelta,
        $lte: year + actualDelta
      };
    }

    // End year filtering
    if (end !== false && end !== undefined) {
      if (!query.year) query.year = {};
      if (typeof query.year === 'object') {
        query.year.$lte = end;
      } else {
        query.year = { $lte: end };
      }
    }

    // Type filtering
    if (typeArray && Array.isArray(typeArray)) {
      query.type = { $in: typeArray };
    }

    // Wiki filtering
    if (wikiArray && Array.isArray(wikiArray)) {
      query.wiki = { $in: wikiArray };
    }

    // Search filtering
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { wiki: { $regex: search, $options: 'i' } },
        { _id: { $regex: search, $options: 'i' } }
      ];
    }

    // Text filter
    if (filter) {
      query.name = { $regex: filter, $options: 'i' };
    }

    // Build sort
    const sortQuery = {};
    sortQuery[sort] = order === 'desc' ? -1 : 1;

    return this.find(query)
      .sort(sortQuery)
      .skip(start)
      .limit(length)
      .lean()
      .exec()
      .then((markers) => {
        // Format output based on format parameter
        if (format === 'geojson') {
          return {
            type: 'FeatureCollection',
            features: markers.map(marker => ({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: marker.coo || [0, 0]
              },
              properties: {
                id: marker._id,
                name: marker.name,
                year: marker.year,
                type: marker.type,
                wiki: marker.wiki,
                capital: marker.capital,
                partOf: marker.partOf,
                end: marker.end
              }
            }))
          };
        }

        return markers;
      });
  },

  /**
   * Count markers
   * @returns {Object} Query object with exec method
   */
  count() {
    return {
      exec: () => this.countDocuments({}).exec()
    };
  }
};

/**
 * @typedef Marker
 */
export default mongoose.model('Marker', MarkerSchema);
