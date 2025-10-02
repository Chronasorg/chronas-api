/**
 * Legacy User Model
 * 
 * Simplified user model compatible with existing database
 * Maintains backward compatibility with the original schema
 */

import Promise from 'bluebird';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import APIError from '../helpers/APIError.js';
import httpStatus from 'http-status';

/**
 * User Schema - Legacy Compatible
 */
const UserSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
    required: true
  },
  
  username: {
    type: String,
    trim: true,
    index: true
  },
  
  email: {
    type: String,
    trim: true,
    lowercase: true,
    index: true
  },
  
  password: {
    type: String,
    select: false // Don't include password in queries by default
  },
  
  // Profile information - flexible to handle legacy data
  name: {
    type: mongoose.Schema.Types.Mixed, // Allow both string and object for backward compatibility
    default: {}
  },
  
  avatar: {
    type: String
  },
  
  gravatar: {
    type: String
  },
  
  // Activity tracking
  karma: {
    type: Number,
    default: 1
  },
  
  loginCount: {
    type: Number,
    default: 0
  },
  
  lastLogin: {
    type: Date
  },
  
  lastUpdated: {
    type: Date
  },
  
  // Legacy privilege system
  privilege: {
    type: Number,
    default: 1
  },
  
  // Subscription
  subscription: {
    type: String,
    default: "-1"
  },
  
  // Additional legacy fields that might exist
  signup: {
    type: Boolean
  },
  
  // Flexible data field for any additional properties
  data: {
    type: mongoose.Schema.Types.Mixed
  }
}, { 
  versionKey: false,
  timestamps: false, // Don't auto-manage timestamps for legacy compatibility
  strict: false, // Allow additional fields not defined in schema
  collection: 'users' // Explicitly set collection name
});

// Indexes for performance
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ karma: -1 });

// Virtual for full name - handles both string and object formats
UserSchema.virtual('fullName').get(function() {
  // Handle legacy string format
  if (typeof this.name === 'string') {
    return this.name;
  }
  // Handle object format
  if (this.name && typeof this.name === 'object' && this.name.first && this.name.last) {
    return `${this.name.first} ${this.name.last}`;
  }
  if (this.name && typeof this.name === 'object' && this.name.first) {
    return this.name.first;
  }
  return this.username;
});

// Instance methods
UserSchema.methods = {
  /**
   * Compare password with hash - Legacy compatible
   */
  comparePassword(candidatePassword, callback) {
    if (!this.password) {
      return callback(new APIError('No password set for this user', httpStatus.BAD_REQUEST));
    }
    
    bcrypt.compare(candidatePassword, this.password, callback);
  }
};

// Static methods
UserSchema.statics = {
  /**
   * Get user by ID with error handling
   */
  get(id) {
    return this.findById(id)
      .exec()
      .then((user) => {
        if (user) {
          return user;
        }
        const err = new APIError('User not found', httpStatus.NOT_FOUND);
        return Promise.reject(err);
      });
  },
  
  /**
   * Find user by email
   */
  findByEmail(email) {
    return this.findOne({ email: email.toLowerCase() }).exec();
  },
  
  /**
   * List users with pagination and filtering
   */
  list(options = {}) {
    const {
      start = 0,
      limit = 20,
      sort = 'karma',
      order = 'desc'
    } = options;
    
    const sortQuery = {};
    sortQuery[sort] = order === 'desc' ? -1 : 1;
    
    return this.find()
      .sort(sortQuery)
      .skip(start)
      .limit(limit)
      .lean()
      .exec();
  }
};

// Create and export model
const User = mongoose.model('User', UserSchema);
export default User;