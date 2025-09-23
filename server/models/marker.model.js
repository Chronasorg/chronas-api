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
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  
  // Marker type and classification
  type: {
    type: String,
    enum: ['city', 'town', 'village', 'battle', 'event', 'landmark', 'monument', 'fortress', 'temple', 'other'],
    default: 'other',
    required: true,
    index: true
  },
  
  // Importance/significance level
  importance: {
    type: Number,
    min: [1, 'Importance must be between 1 and 5'],
    max: [5, 'Importance must be between 1 and 5'],
    default: 3,
    index: true
  },
  
  // Marker properties and metadata
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
    size: {
      type: Number,
      min: [1, 'Size must be between 1 and 10'],
      max: [10, 'Size must be between 1 and 10'],
      default: 5
    },
    icon: {
      type: String,
      enum: ['circle', 'square', 'triangle', 'star', 'cross', 'diamond', 'custom'],
      default: 'circle'
    },
    customIcon: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/.+\.(png|jpg|jpeg|svg|gif)$/i.test(v);
        },
        message: 'Custom icon must be a valid image URL'
      }
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
    enum: ['political', 'military', 'religious', 'cultural', 'economic', 'geographical', 'other'],
    default: 'other',
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
  relatedMarkers: [{
    marker: {
      type: Schema.Types.ObjectId,
      ref: 'Marker',
      required: true
    },
    relationship: {
      type: String,
      enum: ['successor', 'predecessor', 'contemporary', 'nearby', 'related'],
      required: true
    },
    distance: {
      type: Number,
      min: [0, 'Distance cannot be negative']
    }
  }],
  
  // Associated areas
  areas: [{
    type: Schema.Types.ObjectId,
    ref: 'Area'
  }]
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for performance
MarkerSchema.index({ year: 1, type: 1 });
MarkerSchema.index({ year: 1, status: 1, visibility: 1 });
MarkerSchema.index({ createdBy: 1, createdAt: -1 });
MarkerSchema.index({ tags: 1 });
MarkerSchema.index({ importance: -1, 'votes.up': -1 });
MarkerSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Text index for search
MarkerSchema.index({
  name: 'text',
  description: 'text',
  'properties.founder': 'text',
  'properties.culture': 'text'
});

// Virtual for vote score
MarkerSchema.virtual('voteScore').get(function() {
  return this.votes.up - this.votes.down;
});

// Virtual for display coordinates
MarkerSchema.virtual('displayCoordinates').get(function() {
  return {
    lat: this.coordinates.latitude,
    lng: this.coordinates.longitude
  };
});

// Pre-save middleware to sync location with coordinates
MarkerSchema.pre('save', function(next) {
  // Update GeoJSON location from coordinates
  if (this.isModified('coordinates')) {
    this.location = {
      type: 'Point',
      coordinates: [this.coordinates.longitude, this.coordinates.latitude]
    };
  }
  
  // Update version on modification
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }
  
  // Validate battle information for battle markers
  if (this.type === 'battle' && this.properties.battle) {
    if (!this.properties.battle.date) {
      return next(new Error('Battle markers must have a battle date'));
    }
  }
  
  next();
});

// Instance methods
MarkerSchema.methods = {
  /**
   * Check if marker is visible to user
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
   * Calculate distance to another marker
   */
  distanceTo(otherMarker) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (otherMarker.coordinates.latitude - this.coordinates.latitude) * Math.PI / 180;
    const dLon = (otherMarker.coordinates.longitude - this.coordinates.longitude) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.coordinates.latitude * Math.PI / 180) *
              Math.cos(otherMarker.coordinates.latitude * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  },
  
  /**
   * Add related marker
   */
  async addRelatedMarker(markerId, relationship, distance = null) {
    const validRelationships = ['successor', 'predecessor', 'contemporary', 'nearby', 'related'];
    
    if (!validRelationships.includes(relationship)) {
      throw createValidationError('Invalid relationship type');
    }
    
    // Check if relationship already exists
    const existingRelation = this.relatedMarkers.find(
      rel => rel.marker.toString() === markerId.toString()
    );
    
    if (existingRelation) {
      existingRelation.relationship = relationship;
      if (distance !== null) {
        existingRelation.distance = distance;
      }
    } else {
      const relation = { marker: markerId, relationship };
      if (distance !== null) {
        relation.distance = distance;
      }
      this.relatedMarkers.push(relation);
    }
    
    return this.save();
  },
  
  /**
   * Get GeoJSON representation
   */
  toGeoJSON() {
    return {
      type: 'Feature',
      geometry: this.location,
      properties: {
        id: this._id,
        name: this.name,
        year: this.year,
        type: this.type,
        importance: this.importance,
        category: this.category,
        description: this.description,
        style: this.style,
        ...this.properties.toObject()
      }
    };
  }
};

// Static methods
MarkerSchema.statics = {
  /**
   * Get marker by ID with error handling
   */
  async get(id, options = {}) {
    try {
      let query = this.findById(id);
      
      if (options.populate) {
        query = query.populate(options.populate);
      }
      
      const marker = await query;
      
      if (!marker) {
        throw createNotFoundError('Marker not found');
      }
      
      return marker;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createValidationError('Invalid marker ID format');
      }
      throw error;
    }
  },
  
  /**
   * Find markers by year range
   */
  async findByYearRange(startYear, endYear, options = {}) {
    const {
      type,
      category,
      status = 'published',
      visibility = 'public',
      importance,
      limit = 100,
      skip = 0
    } = options;
    
    const query = {
      year: { $gte: startYear, $lte: endYear },
      status,
      visibility
    };
    
    if (type) {
      query.type = type;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (importance) {
      query.importance = { $gte: importance };
    }
    
    return this.find(query)
      .sort({ importance: -1, year: 1, name: 1 })
      .limit(limit)
      .skip(skip)
      .lean();
  },
  
  /**
   * Find markers near a point
   */
  async findNear(longitude, latitude, maxDistance = 100000, options = {}) {
    const {
      year,
      type,
      status = 'published',
      visibility = 'public',
      limit = 50
    } = options;
    
    const query = {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistance // meters
        }
      },
      status,
      visibility
    };
    
    if (year) {
      query.year = year;
    }
    
    if (type) {
      query.type = type;
    }
    
    return this.find(query)
      .limit(limit)
      .lean();
  },
  
  /**
   * Find markers within geographic bounds
   */
  async findWithinBounds(bounds, year = null, options = {}) {
    const {
      type,
      category,
      status = 'published',
      visibility = 'public',
      importance,
      limit = 200
    } = options;
    
    const query = {
      location: {
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
    
    if (type) {
      query.type = type;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (importance) {
      query.importance = { $gte: importance };
    }
    
    return this.find(query)
      .sort({ importance: -1, 'votes.up': -1 })
      .limit(limit)
      .lean();
  },
  
  /**
   * Search markers with text and filters
   */
  async search(searchTerm, options = {}) {
    const {
      year,
      type,
      category,
      tags,
      importance,
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
    
    if (type) {
      query.type = type;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (importance) {
      query.importance = { $gte: importance };
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
    } else if (sort === 'importance') {
      sortQuery = { importance: -1 };
    } else if (sort === 'votes') {
      sortQuery = { 'votes.up': -1 };
    } else {
      sortQuery = { createdAt: -1 };
    }
    
    const [markers, total] = await Promise.all([
      this.find(query)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      markers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },
  
  /**
   * Get markers by user
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
    
    const [markers, total] = await Promise.all([
      this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      markers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },
  
  /**
   * Get marker statistics
   */
  async getStatistics() {
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalMarkers: { $sum: 1 },
          publishedMarkers: {
            $sum: {
              $cond: [{ $eq: ['$status', 'published'] }, 1, 0]
            }
          },
          typeCounts: {
            $push: '$type'
          },
          categoryCounts: {
            $push: '$category'
          },
          avgImportance: { $avg: '$importance' },
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
      totalMarkers: 0,
      publishedMarkers: 0,
      typeCounts: [],
      categoryCounts: [],
      avgImportance: 0,
      avgVoteScore: 0,
      yearRange: { min: null, max: null }
    };
  }
};

// Create and export model
const Marker = mongoose.model('Marker', MarkerSchema);
export default Marker;"