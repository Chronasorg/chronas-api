/**
 * Modern Area Model
 * 
 * Updated for Mongoose 8.x with GeoJSON support,
 * improved validation, and modern features
 */

import mongoose from 'mongoose';
import { createNotFoundError, createValidationError } from '../middleware/errorHandler.js';

const { Schema } = mongoose;

/**
 * GeoJSON Geometry Schema
 */
const GeometrySchema = new Schema({
  type: {
    type: String,
    enum: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'],
    required: [true, 'Geometry type is required']
  },
  coordinates: {
    type: Schema.Types.Mixed,
    required: [true, 'Coordinates are required'],
    validate: {
      validator: function(coordinates) {
        // Basic coordinate validation - could be enhanced
        return Array.isArray(coordinates) && coordinates.length > 0;
      },
      message: 'Invalid coordinates format'
    }
  }
}, { _id: false });

/**
 * Area Properties Schema
 */
const PropertiesSchema = new Schema({
  // Historical information
  ruler: {
    type: String,
    trim: true,
    maxlength: [200, 'Ruler name cannot exceed 200 characters']
  },
  
  dynasty: {
    type: String,
    trim: true,
    maxlength: [200, 'Dynasty name cannot exceed 200 characters']
  },
  
  capital: {
    type: String,
    trim: true,
    maxlength: [200, 'Capital name cannot exceed 200 characters']
  },
  
  population: {
    type: Number,
    min: [0, 'Population cannot be negative']
  },
  
  area: {
    type: Number,
    min: [0, 'Area cannot be negative']
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
    enum: ['agricultural', 'pastoral', 'trading', 'industrial', 'mixed'],
    default: 'mixed'
  },
  
  resources: [{
    type: String,
    trim: true,
    maxlength: [50, 'Resource name cannot exceed 50 characters']
  }],
  
  // Political information
  governmentType: {
    type: String,
    enum: ['monarchy', 'republic', 'empire', 'city-state', 'tribal', 'theocracy', 'other'],
    default: 'other'
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
 * Area Schema
 */
const AreaSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Area name is required'],
    trim: true,
    maxlength: [200, 'Area name cannot exceed 200 characters'],
    index: true
  },
  
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [-3000, 'Year cannot be before 3000 BCE'],
    max: [3000, 'Year cannot be after 3000 CE'],
    index: true
  },
  
  // GeoJSON geometry
  geometry: {
    type: GeometrySchema,
    required: [true, 'Geometry is required'],
    index: '2dsphere' // Enable geospatial queries
  },
  
  // Area properties and metadata
  properties: {
    type: PropertiesSchema,
    default: {}
  },
  
  // Visual styling
  style: {
    color: {
      type: String,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color'],
      default: '#FF0000'
    },
    opacity: {
      type: Number,
      min: [0, 'Opacity must be between 0 and 1'],
      max: [1, 'Opacity must be between 0 and 1'],
      default: 0.7
    },
    strokeColor: {
      type: String,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Stroke color must be a valid hex color'],
      default: '#000000'
    },
    strokeWidth: {
      type: Number,
      min: [0, 'Stroke width cannot be negative'],
      max: [10, 'Stroke width cannot exceed 10'],
      default: 1
    }
  },
  
  // Categorization
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  
  category: {
    type: String,
    enum: ['political', 'cultural', 'religious', 'economic', 'military', 'geographical', 'other'],
    default: 'political',
    index: true
  },
  
  // Content
  description: {
    type: String,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
    trim: true
  },
  
  // Versioning and attribution
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required'],
    index: true
  },
  
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  version: {
    type: Number,
    default: 1,
    min: [1, 'Version must be at least 1']
  },
  
  // Status and moderation
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'flagged'],
    default: 'published',
    index: true
  },
  
  visibility: {
    type: String,
    enum: ['public', 'private', 'unlisted'],
    default: 'public',
    index: true
  },
  
  // Quality metrics
  accuracy: {
    type: Number,
    min: [1, 'Accuracy rating must be between 1 and 5'],
    max: [5, 'Accuracy rating must be between 1 and 5'],
    default: 3
  },
  
  votes: {
    up: {
      type: Number,
      default: 0,
      min: [0, 'Upvotes cannot be negative']
    },
    down: {
      type: Number,
      default: 0,
      min: [0, 'Downvotes cannot be negative']
    }
  },
  
  // Relationships
  parentArea: {
    type: Schema.Types.ObjectId,
    ref: 'Area'
  },
  
  childAreas: [{
    type: Schema.Types.ObjectId,
    ref: 'Area'
  }],
  
  relatedAreas: [{
    area: {
      type: Schema.Types.ObjectId,
      ref: 'Area',
      required: true
    },
    relationship: {
      type: String,
      enum: ['successor', 'predecessor', 'contemporary', 'vassal', 'overlord', 'ally', 'enemy'],
      required: true
    }
  }]
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for performance
AreaSchema.index({ year: 1, category: 1 });
AreaSchema.index({ year: 1, status: 1, visibility: 1 });
AreaSchema.index({ createdBy: 1, createdAt: -1 });
AreaSchema.index({ tags: 1 });
AreaSchema.index({ 'votes.up': -1 });

// Text index for search
AreaSchema.index({
  name: 'text',
  description: 'text',
  'properties.ruler': 'text',
  'properties.dynasty': 'text',
  'properties.capital': 'text'
});

// Virtual for vote score
AreaSchema.virtual('voteScore').get(function() {
  return this.votes.up - this.votes.down;
});

// Virtual for area calculation (approximate)
AreaSchema.virtual('calculatedArea').get(function() {
  if (this.geometry && this.geometry.type === 'Polygon') {\n    // This is a simplified calculation - in production you'd use a proper geospatial library\n    return this.properties.area || 0;\n  }\n  return 0;\n});\n\n// Pre-save middleware\nAreaSchema.pre('save', function(next) {\n  // Update version on modification\n  if (this.isModified() && !this.isNew) {\n    this.version += 1;\n  }\n  \n  // Validate year range based on category\n  if (this.category === 'political' && this.year > new Date().getFullYear()) {\n    return next(new Error('Political areas cannot be in the future'));\n  }\n  \n  next();\n});\n\n// Instance methods\nAreaSchema.methods = {\n  /**\n   * Check if area is visible to user\n   */\n  isVisibleTo(user) {\n    if (this.visibility === 'public') return true;\n    if (!user) return false;\n    if (this.visibility === 'private') {\n      return this.createdBy.toString() === user._id.toString() || user.role === 'admin';\n    }\n    return true; // unlisted\n  },\n  \n  /**\n   * Add vote\n   */\n  async addVote(userId, type) {\n    if (type === 'up') {\n      this.votes.up += 1;\n    } else if (type === 'down') {\n      this.votes.down += 1;\n    } else {\n      throw createValidationError('Vote type must be \"up\" or \"down\"');\n    }\n    \n    return this.save();\n  },\n  \n  /**\n   * Add related area\n   */\n  async addRelatedArea(areaId, relationship) {\n    const validRelationships = ['successor', 'predecessor', 'contemporary', 'vassal', 'overlord', 'ally', 'enemy'];\n    \n    if (!validRelationships.includes(relationship)) {\n      throw createValidationError('Invalid relationship type');\n    }\n    \n    // Check if relationship already exists\n    const existingRelation = this.relatedAreas.find(\n      rel => rel.area.toString() === areaId.toString()\n    );\n    \n    if (existingRelation) {\n      existingRelation.relationship = relationship;\n    } else {\n      this.relatedAreas.push({ area: areaId, relationship });\n    }\n    \n    return this.save();\n  },\n  \n  /**\n   * Get GeoJSON representation\n   */\n  toGeoJSON() {\n    return {\n      type: 'Feature',\n      geometry: this.geometry,\n      properties: {\n        id: this._id,\n        name: this.name,\n        year: this.year,\n        category: this.category,\n        description: this.description,\n        style: this.style,\n        ...this.properties.toObject()\n      }\n    };\n  }\n};\n\n// Static methods\nAreaSchema.statics = {\n  /**\n   * Get area by ID with error handling\n   */\n  async get(id, options = {}) {\n    try {\n      let query = this.findById(id);\n      \n      if (options.populate) {\n        query = query.populate(options.populate);\n      }\n      \n      const area = await query;\n      \n      if (!area) {\n        throw createNotFoundError('Area not found');\n      }\n      \n      return area;\n    } catch (error) {\n      if (error.name === 'CastError') {\n        throw createValidationError('Invalid area ID format');\n      }\n      throw error;\n    }\n  },\n  \n  /**\n   * Find areas by year range\n   */\n  async findByYearRange(startYear, endYear, options = {}) {\n    const {\n      category,\n      status = 'published',\n      visibility = 'public',\n      limit = 50,\n      skip = 0\n    } = options;\n    \n    const query = {\n      year: { $gte: startYear, $lte: endYear },\n      status,\n      visibility\n    };\n    \n    if (category) {\n      query.category = category;\n    }\n    \n    return this.find(query)\n      .sort({ year: 1, name: 1 })\n      .limit(limit)\n      .skip(skip)\n      .lean();\n  },\n  \n  /**\n   * Find areas within geographic bounds\n   */\n  async findWithinBounds(bounds, year = null, options = {}) {\n    const {\n      category,\n      status = 'published',\n      visibility = 'public',\n      limit = 100\n    } = options;\n    \n    const query = {\n      geometry: {\n        $geoWithin: {\n          $geometry: {\n            type: 'Polygon',\n            coordinates: [bounds]\n          }\n        }\n      },\n      status,\n      visibility\n    };\n    \n    if (year !== null) {\n      query.year = year;\n    }\n    \n    if (category) {\n      query.category = category;\n    }\n    \n    return this.find(query)\n      .limit(limit)\n      .lean();\n  },\n  \n  /**\n   * Search areas with text and filters\n   */\n  async search(searchTerm, options = {}) {\n    const {\n      year,\n      category,\n      tags,\n      status = 'published',\n      visibility = 'public',\n      page = 1,\n      limit = 20,\n      sort = 'relevance'\n    } = options;\n    \n    const skip = (page - 1) * limit;\n    \n    // Build query\n    const query = {\n      status,\n      visibility\n    };\n    \n    if (searchTerm) {\n      query.$text = { $search: searchTerm };\n    }\n    \n    if (year) {\n      query.year = year;\n    }\n    \n    if (category) {\n      query.category = category;\n    }\n    \n    if (tags && tags.length > 0) {\n      query.tags = { $in: tags };\n    }\n    \n    // Build sort\n    let sortQuery = {};\n    if (searchTerm && sort === 'relevance') {\n      sortQuery = { score: { $meta: 'textScore' } };\n    } else if (sort === 'year') {\n      sortQuery = { year: -1 };\n    } else if (sort === 'name') {\n      sortQuery = { name: 1 };\n    } else if (sort === 'votes') {\n      sortQuery = { 'votes.up': -1 };\n    } else {\n      sortQuery = { createdAt: -1 };\n    }\n    \n    const [areas, total] = await Promise.all([\n      this.find(query)\n        .sort(sortQuery)\n        .skip(skip)\n        .limit(limit)\n        .lean(),\n      this.countDocuments(query)\n    ]);\n    \n    return {\n      areas,\n      pagination: {\n        page,\n        limit,\n        total,\n        pages: Math.ceil(total / limit)\n      }\n    };\n  },\n  \n  /**\n   * Get areas by user\n   */\n  async getByUser(userId, options = {}) {\n    const {\n      status,\n      page = 1,\n      limit = 20\n    } = options;\n    \n    const skip = (page - 1) * limit;\n    const query = { createdBy: userId };\n    \n    if (status) {\n      query.status = status;\n    }\n    \n    const [areas, total] = await Promise.all([\n      this.find(query)\n        .sort({ createdAt: -1 })\n        .skip(skip)\n        .limit(limit)\n        .lean(),\n      this.countDocuments(query)\n    ]);\n    \n    return {\n      areas,\n      pagination: {\n        page,\n        limit,\n        total,\n        pages: Math.ceil(total / limit)\n      }\n    };\n  },\n  \n  /**\n   * Get area statistics\n   */\n  async getStatistics() {\n    const stats = await this.aggregate([\n      {\n        $group: {\n          _id: null,\n          totalAreas: { $sum: 1 },\n          publishedAreas: {\n            $sum: {\n              $cond: [{ $eq: ['$status', 'published'] }, 1, 0]\n            }\n          },\n          categoryCounts: {\n            $push: '$category'\n          },\n          avgVoteScore: {\n            $avg: { $subtract: ['$votes.up', '$votes.down'] }\n          },\n          yearRange: {\n            min: { $min: '$year' },\n            max: { $max: '$year' }\n          }\n        }\n      }\n    ]);\n    \n    return stats[0] || {\n      totalAreas: 0,\n      publishedAreas: 0,\n      categoryCounts: [],\n      avgVoteScore: 0,\n      yearRange: { min: null, max: null }\n    };\n  }\n};\n\n// Create and export model\nconst Area = mongoose.model('Area', AreaSchema);\nexport default Area;"