/**
 * Modern Marker Model
 * 
 * Updated for Mongoose 8.x with GeoJSON Point support,
 * improved validation, and modern features
 */

import mongoose from 'mongoose';
import { createNotFoundError, createValidationError } from '../middleware/errorHandler.js';

const { Schema } = mongoose;

/**
 * Coordinates Schema for Point geometry
 */
const CoordinatesSchema = new Schema({
  latitude: {
    type: Number,
    required: [true, 'Latitude is required'],
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  longitude: {
    type: Number,
    required: [true, 'Longitude is required'],
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  }
}, { _id: false });

/**
 * Marker Properties Schema
 */
const PropertiesSchema = new Schema({
  // Historical information
  founder: {
    type: String,
    trim: true,
    maxlength: [200, 'Founder name cannot exceed 200 characters']
  },
  
  foundingYear: {
    type: Number,
    min: [-3000, 'Founding year cannot be before 3000 BCE'],
    max: [3000, 'Founding year cannot be after 3000 CE']
  },
  
  // Demographic information
  population: {
    type: Number,
    min: [0, 'Population cannot be negative']
  },
  
  elevation: {
    type: Number,
    min: [-500, 'Elevation cannot be below -500m (Dead Sea level)']
  },
  
  // Cultural information
  culture: {
    type: String,
    trim: true,
    maxlength: [100, 'Culture cannot exceed 100 characters']
  },
  
  religion: {
    type: String,
    trim: true,
    maxlength: [100, 'Religion cannot exceed 100 characters']
  },
  
  language: {
    type: String,
    trim: true,
    maxlength: [100, 'Language cannot exceed 100 characters']
  },
  
  // Economic information
  economy: {
    type: String,
    enum: ['agricultural', 'trading', 'industrial', 'military', 'religious', 'administrative', 'mixed'],
    default: 'mixed'
  },
  
  resources: [{
    type: String,
    trim: true,
    maxlength: [50, 'Resource name cannot exceed 50 characters']
  }],
  
  // Battle-specific information (for battle markers)
  battle: {
    date: Date,
    belligerents: [{
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Belligerent name cannot exceed 200 characters']
      },
      side: {
        type: String,
        enum: ['attacker', 'defender', 'neutral'],
        required: true
      },
      commander: {
        type: String,
        trim: true,
        maxlength: [200, 'Commander name cannot exceed 200 characters']
      },
      forces: {
        type: Number,
        min: [0, 'Forces cannot be negative']
      },
      casualties: {
        type: Number,
        min: [0, 'Casualties cannot be negative']
      }
    }],
    outcome: {
      type: String,
      enum: ['decisive_victory', 'victory', 'pyrrhic_victory', 'draw', 'defeat', 'decisive_defeat'],
      default: 'draw'
    },
    significance: {
      type: String,
      maxlength: [500, 'Significance cannot exceed 500 characters']
    }
  },
  
  // External references
  wikipedia: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/(en\.)?wikipedia\.org\/wiki\/.+/.test(v);
      },
      message: 'Wikipedia URL must be a valid Wikipedia link'
    }
  },
  
  sources: [{
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Source title cannot exceed 200 characters']
    },
    url: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Source URL must be valid'
      }
    },
    author: {
      type: String,
      trim: true,
      maxlength: [100, 'Author name cannot exceed 100 characters']
    },
    year: {
      type: Number,
      min: [-3000, 'Year cannot be before 3000 BCE'],
      max: [new Date().getFullYear(), 'Year cannot be in the future']
    }
  }]
}, { _id: false });

/**
 * Marker Schema
 */
const MarkerSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Marker name is required'],
    trim: true,
    maxlength: [200, 'Marker name cannot exceed 200 characters'],
    index: true
  },
  
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [-3000, 'Year cannot be before 3000 BCE'],
    max: [3000, 'Year cannot be after 3000 CE'],
    index: true
  },
  
  // Geographic coordinates
  coordinates: {
    type: CoordinatesSchema,
    required: [true, 'Coordinates are required']
  },
  
  // GeoJSON Point for geospatial queries
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]\n      index: '2dsphere'\n    }\n  },\n  \n  // Marker type and classification\n  type: {\n    type: String,\n    enum: ['city', 'town', 'village', 'battle', 'event', 'landmark', 'monument', 'fortress', 'temple', 'other'],\n    default: 'other',\n    required: true,\n    index: true\n  },\n  \n  // Importance/significance level\n  importance: {\n    type: Number,\n    min: [1, 'Importance must be between 1 and 5'],\n    max: [5, 'Importance must be between 1 and 5'],\n    default: 3,\n    index: true\n  },\n  \n  // Marker properties and metadata\n  properties: {\n    type: PropertiesSchema,\n    default: {}\n  },\n  \n  // Visual styling\n  style: {\n    color: {\n      type: String,\n      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color'],\n      default: '#FF0000'\n    },\n    size: {\n      type: Number,\n      min: [1, 'Size must be between 1 and 10'],\n      max: [10, 'Size must be between 1 and 10'],\n      default: 5\n    },\n    icon: {\n      type: String,\n      enum: ['circle', 'square', 'triangle', 'star', 'cross', 'diamond', 'custom'],\n      default: 'circle'\n    },\n    customIcon: {\n      type: String,\n      validate: {\n        validator: function(v) {\n          return !v || /^https?:\/\/.+\.(png|jpg|jpeg|svg|gif)$/i.test(v);\n        },\n        message: 'Custom icon must be a valid image URL'\n      }\n    }\n  },\n  \n  // Categorization\n  tags: [{\n    type: String,\n    trim: true,\n    lowercase: true,\n    maxlength: [50, 'Tag cannot exceed 50 characters']\n  }],\n  \n  category: {\n    type: String,\n    enum: ['political', 'military', 'religious', 'cultural', 'economic', 'geographical', 'other'],\n    default: 'other',\n    index: true\n  },\n  \n  // Content\n  description: {\n    type: String,\n    maxlength: [2000, 'Description cannot exceed 2000 characters'],\n    trim: true\n  },\n  \n  // Versioning and attribution\n  createdBy: {\n    type: Schema.Types.ObjectId,\n    ref: 'User',\n    required: [true, 'Creator is required'],\n    index: true\n  },\n  \n  lastModifiedBy: {\n    type: Schema.Types.ObjectId,\n    ref: 'User',\n    index: true\n  },\n  \n  version: {\n    type: Number,\n    default: 1,\n    min: [1, 'Version must be at least 1']\n  },\n  \n  // Status and moderation\n  status: {\n    type: String,\n    enum: ['draft', 'published', 'archived', 'flagged'],\n    default: 'published',\n    index: true\n  },\n  \n  visibility: {\n    type: String,\n    enum: ['public', 'private', 'unlisted'],\n    default: 'public',\n    index: true\n  },\n  \n  // Quality metrics\n  accuracy: {\n    type: Number,\n    min: [1, 'Accuracy rating must be between 1 and 5'],\n    max: [5, 'Accuracy rating must be between 1 and 5'],\n    default: 3\n  },\n  \n  votes: {\n    up: {\n      type: Number,\n      default: 0,\n      min: [0, 'Upvotes cannot be negative']\n    },\n    down: {\n      type: Number,\n      default: 0,\n      min: [0, 'Downvotes cannot be negative']\n    }\n  },\n  \n  // Relationships\n  relatedMarkers: [{\n    marker: {\n      type: Schema.Types.ObjectId,\n      ref: 'Marker',\n      required: true\n    },\n    relationship: {\n      type: String,\n      enum: ['successor', 'predecessor', 'contemporary', 'nearby', 'related'],\n      required: true\n    },\n    distance: {\n      type: Number,\n      min: [0, 'Distance cannot be negative']\n    }\n  }],\n  \n  // Associated areas\n  areas: [{\n    type: Schema.Types.ObjectId,\n    ref: 'Area'\n  }]\n}, {\n  timestamps: true,\n  versionKey: false,\n  toJSON: { virtuals: true },\n  toObject: { virtuals: true }\n});\n\n// Compound indexes for performance\nMarkerSchema.index({ year: 1, type: 1 });\nMarkerSchema.index({ year: 1, status: 1, visibility: 1 });\nMarkerSchema.index({ createdBy: 1, createdAt: -1 });\nMarkerSchema.index({ tags: 1 });\nMarkerSchema.index({ importance: -1, 'votes.up': -1 });\nMarkerSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });\n\n// Text index for search\nMarkerSchema.index({\n  name: 'text',\n  description: 'text',\n  'properties.founder': 'text',\n  'properties.culture': 'text'\n});\n\n// Virtual for vote score\nMarkerSchema.virtual('voteScore').get(function() {\n  return this.votes.up - this.votes.down;\n});\n\n// Virtual for display coordinates\nMarkerSchema.virtual('displayCoordinates').get(function() {\n  return {\n    lat: this.coordinates.latitude,\n    lng: this.coordinates.longitude\n  };\n});\n\n// Pre-save middleware to sync location with coordinates\nMarkerSchema.pre('save', function(next) {\n  // Update GeoJSON location from coordinates\n  if (this.isModified('coordinates')) {\n    this.location = {\n      type: 'Point',\n      coordinates: [this.coordinates.longitude, this.coordinates.latitude]\n    };\n  }\n  \n  // Update version on modification\n  if (this.isModified() && !this.isNew) {\n    this.version += 1;\n  }\n  \n  // Validate battle information for battle markers\n  if (this.type === 'battle' && this.properties.battle) {\n    if (!this.properties.battle.date) {\n      return next(new Error('Battle markers must have a battle date'));\n    }\n  }\n  \n  next();\n});\n\n// Instance methods\nMarkerSchema.methods = {\n  /**\n   * Check if marker is visible to user\n   */\n  isVisibleTo(user) {\n    if (this.visibility === 'public') return true;\n    if (!user) return false;\n    if (this.visibility === 'private') {\n      return this.createdBy.toString() === user._id.toString() || user.role === 'admin';\n    }\n    return true; // unlisted\n  },\n  \n  /**\n   * Add vote\n   */\n  async addVote(userId, type) {\n    if (type === 'up') {\n      this.votes.up += 1;\n    } else if (type === 'down') {\n      this.votes.down += 1;\n    } else {\n      throw createValidationError('Vote type must be \"up\" or \"down\"');\n    }\n    \n    return this.save();\n  },\n  \n  /**\n   * Calculate distance to another marker\n   */\n  distanceTo(otherMarker) {\n    const R = 6371; // Earth's radius in kilometers\n    const dLat = (otherMarker.coordinates.latitude - this.coordinates.latitude) * Math.PI / 180;\n    const dLon = (otherMarker.coordinates.longitude - this.coordinates.longitude) * Math.PI / 180;\n    \n    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +\n              Math.cos(this.coordinates.latitude * Math.PI / 180) *\n              Math.cos(otherMarker.coordinates.latitude * Math.PI / 180) *\n              Math.sin(dLon / 2) * Math.sin(dLon / 2);\n    \n    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));\n    return R * c; // Distance in kilometers\n  },\n  \n  /**\n   * Add related marker\n   */\n  async addRelatedMarker(markerId, relationship, distance = null) {\n    const validRelationships = ['successor', 'predecessor', 'contemporary', 'nearby', 'related'];\n    \n    if (!validRelationships.includes(relationship)) {\n      throw createValidationError('Invalid relationship type');\n    }\n    \n    // Check if relationship already exists\n    const existingRelation = this.relatedMarkers.find(\n      rel => rel.marker.toString() === markerId.toString()\n    );\n    \n    if (existingRelation) {\n      existingRelation.relationship = relationship;\n      if (distance !== null) {\n        existingRelation.distance = distance;\n      }\n    } else {\n      const relation = { marker: markerId, relationship };\n      if (distance !== null) {\n        relation.distance = distance;\n      }\n      this.relatedMarkers.push(relation);\n    }\n    \n    return this.save();\n  },\n  \n  /**\n   * Get GeoJSON representation\n   */\n  toGeoJSON() {\n    return {\n      type: 'Feature',\n      geometry: this.location,\n      properties: {\n        id: this._id,\n        name: this.name,\n        year: this.year,\n        type: this.type,\n        importance: this.importance,\n        category: this.category,\n        description: this.description,\n        style: this.style,\n        ...this.properties.toObject()\n      }\n    };\n  }\n};\n\n// Static methods\nMarkerSchema.statics = {\n  /**\n   * Get marker by ID with error handling\n   */\n  async get(id, options = {}) {\n    try {\n      let query = this.findById(id);\n      \n      if (options.populate) {\n        query = query.populate(options.populate);\n      }\n      \n      const marker = await query;\n      \n      if (!marker) {\n        throw createNotFoundError('Marker not found');\n      }\n      \n      return marker;\n    } catch (error) {\n      if (error.name === 'CastError') {\n        throw createValidationError('Invalid marker ID format');\n      }\n      throw error;\n    }\n  },\n  \n  /**\n   * Find markers by year range\n   */\n  async findByYearRange(startYear, endYear, options = {}) {\n    const {\n      type,\n      category,\n      status = 'published',\n      visibility = 'public',\n      importance,\n      limit = 100,\n      skip = 0\n    } = options;\n    \n    const query = {\n      year: { $gte: startYear, $lte: endYear },\n      status,\n      visibility\n    };\n    \n    if (type) {\n      query.type = type;\n    }\n    \n    if (category) {\n      query.category = category;\n    }\n    \n    if (importance) {\n      query.importance = { $gte: importance };\n    }\n    \n    return this.find(query)\n      .sort({ importance: -1, year: 1, name: 1 })\n      .limit(limit)\n      .skip(skip)\n      .lean();\n  },\n  \n  /**\n   * Find markers near a point\n   */\n  async findNear(longitude, latitude, maxDistance = 100000, options = {}) {\n    const {\n      year,\n      type,\n      status = 'published',\n      visibility = 'public',\n      limit = 50\n    } = options;\n    \n    const query = {\n      location: {\n        $near: {\n          $geometry: {\n            type: 'Point',\n            coordinates: [longitude, latitude]\n          },\n          $maxDistance: maxDistance // meters\n        }\n      },\n      status,\n      visibility\n    };\n    \n    if (year) {\n      query.year = year;\n    }\n    \n    if (type) {\n      query.type = type;\n    }\n    \n    return this.find(query)\n      .limit(limit)\n      .lean();\n  },\n  \n  /**\n   * Find markers within geographic bounds\n   */\n  async findWithinBounds(bounds, year = null, options = {}) {\n    const {\n      type,\n      category,\n      status = 'published',\n      visibility = 'public',\n      importance,\n      limit = 200\n    } = options;\n    \n    const query = {\n      location: {\n        $geoWithin: {\n          $geometry: {\n            type: 'Polygon',\n            coordinates: [bounds]\n          }\n        }\n      },\n      status,\n      visibility\n    };\n    \n    if (year !== null) {\n      query.year = year;\n    }\n    \n    if (type) {\n      query.type = type;\n    }\n    \n    if (category) {\n      query.category = category;\n    }\n    \n    if (importance) {\n      query.importance = { $gte: importance };\n    }\n    \n    return this.find(query)\n      .sort({ importance: -1, 'votes.up': -1 })\n      .limit(limit)\n      .lean();\n  },\n  \n  /**\n   * Search markers with text and filters\n   */\n  async search(searchTerm, options = {}) {\n    const {\n      year,\n      type,\n      category,\n      tags,\n      importance,\n      status = 'published',\n      visibility = 'public',\n      page = 1,\n      limit = 20,\n      sort = 'relevance'\n    } = options;\n    \n    const skip = (page - 1) * limit;\n    \n    // Build query\n    const query = {\n      status,\n      visibility\n    };\n    \n    if (searchTerm) {\n      query.$text = { $search: searchTerm };\n    }\n    \n    if (year) {\n      query.year = year;\n    }\n    \n    if (type) {\n      query.type = type;\n    }\n    \n    if (category) {\n      query.category = category;\n    }\n    \n    if (importance) {\n      query.importance = { $gte: importance };\n    }\n    \n    if (tags && tags.length > 0) {\n      query.tags = { $in: tags };\n    }\n    \n    // Build sort\n    let sortQuery = {};\n    if (searchTerm && sort === 'relevance') {\n      sortQuery = { score: { $meta: 'textScore' } };\n    } else if (sort === 'year') {\n      sortQuery = { year: -1 };\n    } else if (sort === 'name') {\n      sortQuery = { name: 1 };\n    } else if (sort === 'importance') {\n      sortQuery = { importance: -1 };\n    } else if (sort === 'votes') {\n      sortQuery = { 'votes.up': -1 };\n    } else {\n      sortQuery = { createdAt: -1 };\n    }\n    \n    const [markers, total] = await Promise.all([\n      this.find(query)\n        .sort(sortQuery)\n        .skip(skip)\n        .limit(limit)\n        .lean(),\n      this.countDocuments(query)\n    ]);\n    \n    return {\n      markers,\n      pagination: {\n        page,\n        limit,\n        total,\n        pages: Math.ceil(total / limit)\n      }\n    };\n  },\n  \n  /**\n   * Get markers by user\n   */\n  async getByUser(userId, options = {}) {\n    const {\n      status,\n      page = 1,\n      limit = 20\n    } = options;\n    \n    const skip = (page - 1) * limit;\n    const query = { createdBy: userId };\n    \n    if (status) {\n      query.status = status;\n    }\n    \n    const [markers, total] = await Promise.all([\n      this.find(query)\n        .sort({ createdAt: -1 })\n        .skip(skip)\n        .limit(limit)\n        .lean(),\n      this.countDocuments(query)\n    ]);\n    \n    return {\n      markers,\n      pagination: {\n        page,\n        limit,\n        total,\n        pages: Math.ceil(total / limit)\n      }\n    };\n  },\n  \n  /**\n   * Get marker statistics\n   */\n  async getStatistics() {\n    const stats = await this.aggregate([\n      {\n        $group: {\n          _id: null,\n          totalMarkers: { $sum: 1 },\n          publishedMarkers: {\n            $sum: {\n              $cond: [{ $eq: ['$status', 'published'] }, 1, 0]\n            }\n          },\n          typeCounts: {\n            $push: '$type'\n          },\n          categoryCounts: {\n            $push: '$category'\n          },\n          avgImportance: { $avg: '$importance' },\n          avgVoteScore: {\n            $avg: { $subtract: ['$votes.up', '$votes.down'] }\n          },\n          yearRange: {\n            min: { $min: '$year' },\n            max: { $max: '$year' }\n          }\n        }\n      }\n    ]);\n    \n    return stats[0] || {\n      totalMarkers: 0,\n      publishedMarkers: 0,\n      typeCounts: [],\n      categoryCounts: [],\n      avgImportance: 0,\n      avgVoteScore: 0,\n      yearRange: { min: null, max: null }\n    };\n  }\n};\n\n// Create and export model\nconst Marker = mongoose.model('Marker', MarkerSchema);\nexport default Marker;"