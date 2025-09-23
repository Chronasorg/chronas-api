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
  if (this.geometry && this.geometry.type === 'Polygon') {
    // This is a simplified calculation - in production you'd use a proper geospatial library
    return this.properties.area || 0;
  }
  return 0;
});

// Pre-save middleware
AreaSchema.pre('save', function(next) {
  // Update version on modification
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }
  
  // Validate year range based on category
  if (this.category === 'political' && this.year > new Date().getFullYear()) {
    return next(new Error('Political areas cannot be in the future'));
  }
  
  next();
});

// Instance methods
AreaSchema.methods = {
  /**
   * Check if area is visible to user
   */
  isVisibleTo(user) {
    if (this.visibility === 'public') return true;
    if (!user) return false;
    if (this.visibility === 'private') {
      return this.createdBy.toString() === user._id.toString() || user.role === 'admin';
    }
    return true; // unlisted
  },
  
  /**
   * Add vote
   */
  async addVote(userId, type) {
    if (type === 'up') {
      this.votes.up += 1;
    } else if (type === 'down') {
      this.votes.down += 1;
    } else {
      throw createValidationError('Vote type must be \"up\" or \"down\"');
    }
    
    return this.save();
  },
  
  /**
   * Add related area
   */
  async addRelatedArea(areaId, relationship) {
    const validRelationships = ['successor', 'predecessor', 'contemporary', 'vassal', 'overlord', 'ally', 'enemy'];
    
    if (!validRelationships.includes(relationship)) {
      throw createValidationError('Invalid relationship type');
    }
    
    // Check if relationship already exists
    const existingRelation = this.relatedAreas.find(
      rel => rel.area.toString() === areaId.toString()
    );
    
    if (existingRelation) {
      existingRelation.relationship = relationship;
    } else {
      this.relatedAreas.push({ area: areaId, relationship });
    }
    
    return this.save();
  },
  
  /**
   * Get GeoJSON representation
   */
  toGeoJSON() {
    return {
      type: 'Feature',
      geometry: this.geometry,
      properties: {
        id: this._id,
        name: this.name,
        year: this.year,
        category: this.category,
        description: this.description,
        style: this.style,
        ...this.properties.toObject()
      }
    };
  }
};

// Static methods
AreaSchema.statics = {
  /**
   * Get area by ID with error handling
   */
  async get(id, options = {}) {
    try {
      let query = this.findById(id);
      
      if (options.populate) {
        query = query.populate(options.populate);
      }
      
      const area = await query;
      
      if (!area) {
        throw createNotFoundError('Area not found');
      }
      
      return area;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createValidationError('Invalid area ID format');
      }
      throw error;
    }
  },
  
  /**
   * Find areas by year range
   */
  async findByYearRange(startYear, endYear, options = {}) {
    const {
      category,
      status = 'published',
      visibility = 'public',
      limit = 50,
      skip = 0
    } = options;
    
    const query = {
      year: { $gte: startYear, $lte: endYear },
      status,
      visibility
    };
    
    if (category) {
      query.category = category;
    }
    
    return this.find(query)
      .sort({ year: 1, name: 1 })
      .limit(limit)
      .skip(skip)
      .lean();
  },
  
  /**
   * Find areas within geographic bounds
   */
  async findWithinBounds(bounds, year = null, options = {}) {
    const {
      category,
      status = 'published',
      visibility = 'public',
      limit = 100
    } = options;
    
    const query = {
      geometry: {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [bounds]
          }
        }
      },
      status,
      visibility
    };
    
    if (year !== null) {
      query.year = year;
    }
    
    if (category) {
      query.category = category;
    }
    
    return this.find(query)
      .limit(limit)
      .lean();
  },
  
  /**
   * Search areas with text and filters
   */
  async search(searchTerm, options = {}) {
    const {
      year,
      category,
      tags,
      status = 'published',
      visibility = 'public',
      page = 1,
      limit = 20,
      sort = 'relevance'
    } = options;
    
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {
      status,
      visibility
    };
    
    if (searchTerm) {
      query.$text = { $search: searchTerm };
    }
    
    if (year) {
      query.year = year;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }
    
    // Build sort
    let sortQuery = {};
    if (searchTerm && sort === 'relevance') {
      sortQuery = { score: { $meta: 'textScore' } };
    } else if (sort === 'year') {
      sortQuery = { year: -1 };
    } else if (sort === 'name') {
      sortQuery = { name: 1 };
    } else if (sort === 'votes') {
      sortQuery = { 'votes.up': -1 };
    } else {
      sortQuery = { createdAt: -1 };
    }
    
    const [areas, total] = await Promise.all([
      this.find(query)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      areas,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },
  
  /**
   * Get areas by user
   */
  async getByUser(userId, options = {}) {
    const {
      status,
      page = 1,
      limit = 20
    } = options;
    
    const skip = (page - 1) * limit;
    const query = { createdBy: userId };
    
    if (status) {
      query.status = status;
    }
    
    const [areas, total] = await Promise.all([
      this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      areas,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },
  
  /**
   * Get area statistics
   */
  async getStatistics() {
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalAreas: { $sum: 1 },
          publishedAreas: {
            $sum: {
              $cond: [{ $eq: ['$status', 'published'] }, 1, 0]
            }
          },
          categoryCounts: {
            $push: '$category'
          },
          avgVoteScore: {
            $avg: { $subtract: ['$votes.up', '$votes.down'] }
          },
          yearRange: {
            min: { $min: '$year' },
            max: { $max: '$year' }
          }
        }
      }
    ]);
    
    return stats[0] || {
      totalAreas: 0,
      publishedAreas: 0,
      categoryCounts: [],
      avgVoteScore: 0,
      yearRange: { min: null, max: null }
    };
  }
};

// Create and export model
const Area = mongoose.model('Area', AreaSchema);
export default Area;"