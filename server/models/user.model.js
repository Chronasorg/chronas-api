/**
 * Modern User Model
 * 
 * Updated for Mongoose 8.x with improved validation,
 * security, and ES6+ features
 */

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import APIError from '../helpers/APIError.js';
import httpStatus from 'http-status';

const { Schema } = mongoose;

/**
 * User Schema with modern Mongoose features
 */
const UserSchema = new Schema({
  _id: {
    type: Schema.Types.Mixed, // Allow both ObjectId and String for backward compatibility
    required: true
  },
  
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    index: true
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    index: true
  },
  
  password: {
    type: String,
    required: function() {
      return this.authType === 'local';
    },
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  
  // Profile information
  firstName: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  
  lastName: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  
  avatar: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar must be a valid URL'
    }
  },
  
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    trim: true
  },
  
  website: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Website must be a valid URL'
    }
  },
  
  location: {
    type: String,
    maxlength: [100, 'Location cannot exceed 100 characters'],
    trim: true
  },
  
  // Authentication and authorization
  authType: {
    type: String,
    enum: ['local', 'google', 'facebook', 'github', 'twitter'],
    default: 'local',
    required: true
  },
  
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user',
    required: true
  },
  
  permissions: [{
    type: String,
    enum: ['read', 'write', 'delete', 'moderate', 'admin']
  }],
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned', 'pending'],
    default: 'active',
    required: true
  },
  
  // Activity tracking
  karma: {
    type: Number,
    default: 1,
    min: [0, 'Karma cannot be negative']
  },
  
  loginCount: {
    type: Number,
    default: 0,
    min: [0, 'Login count cannot be negative']
  },
  
  lastLogin: {
    type: Date
  },
  
  // Contribution statistics
  statistics: {
    created: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    },
    updated: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    },
    deleted: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    },
    voted: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    },
    linked: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    },
    reverted: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    },
    mistakes: {
      type: Number,
      default: 0,
      min: [0, 'Count cannot be negative']
    }
  },
  
  // Subscription and premium features
  subscription: {
    type: {
      type: String,
      enum: ['free', 'premium', 'patron'],
      default: 'free'
    },
    expiresAt: Date,
    patreonTier: Number
  },
  
  // User preferences
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    language: {
      type: String,
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ar'],
      default: 'en'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      showEmail: {
        type: Boolean,
        default: false
      },
      showStatistics: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Security
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: {
    type: String,
    select: false
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },
  
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  
  twoFactorSecret: {
    type: String,
    select: false
  },
  
  // Legacy fields for backward compatibility
  // TODO: Remove these once controllers are updated to use new format
  privilege: {
    type: Number,
    default: 1,
    min: [1, 'Privilege must be at least 1'],
    max: [99, 'Privilege cannot exceed 99']
  }
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {
      // Remove sensitive fields from JSON output
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.twoFactorSecret;
      return ret;
    }
  }
});

// Indexes for performance
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastLogin: -1 });
UserSchema.index({ 'statistics.karma': -1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName || this.lastName || this.username;
});

// Virtual for display name
UserSchema.virtual('displayName').get(function() {
  return this.fullName || this.username;
});

// Pre-save middleware for password hashing
UserSchema.pre('save', async function(next) {
  // Only hash password if it's been modified
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    // Hash password with bcrypt
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware for email verification
UserSchema.pre('save', function(next) {
  // If email is modified, mark as unverified
  if (this.isModified('email') && !this.isNew) {
    this.emailVerified = false;
    this.emailVerificationToken = undefined;
  }
  next();
});

// Instance methods
UserSchema.methods = {
  /**
   * Compare password with hash
   */
  async comparePassword(candidatePassword) {
    if (!this.password) {
      throw new APIError('No password set for this user', httpStatus.BAD_REQUEST);
    }
    return bcrypt.compare(candidatePassword, this.password);
  },
  
  /**
   * Generate password reset token
   */
  generatePasswordResetToken() {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    return token;
  },
  
  /**
   * Generate email verification token
   */
  generateEmailVerificationToken() {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
    
    return token;
  },
  
  /**
   * Check if user has permission
   */
  hasPermission(permission) {
    if (this.role === 'admin') return true;
    return this.permissions.includes(permission) || this.permissions.includes('*');
  },
  
  /**
   * Update login information
   */
  updateLoginInfo() {
    this.loginCount += 1;
    this.lastLogin = new Date();
    return this.save();
  },
  
  /**
   * Increment statistic
   */
  incrementStat(statName, amount = 1) {
    if (this.statistics[statName] !== undefined) {
      this.statistics[statName] += amount;
      return this.save();
    }
    throw new APIError(`Invalid statistic name: ${statName}`, httpStatus.BAD_REQUEST);
  }
};

// Static methods
UserSchema.statics = {
  /**
   * Get user by ID with error handling
   */
  async get(id) {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new APIError('User not found', httpStatus.NOT_FOUND);
      }
      return user;
    } catch (error) {
      if (error.name === 'CastError') {
        throw new APIError('Invalid user ID format', httpStatus.BAD_REQUEST);
      }
      throw error;
    }
  },
  
  /**
   * Find user by email
   */
  async findByEmail(email) {
    return this.findOne({ email: email.toLowerCase() });
  },
  
  /**
   * Find user by username
   */
  async findByUsername(username) {
    return this.findOne({ username: username.toLowerCase() });
  },
  
  /**
   * Find user by email or username
   */
  async findByEmailOrUsername(identifier) {
    const query = identifier.includes('@') ? 
      { email: identifier.toLowerCase() } : 
      { username: identifier.toLowerCase() };
    
    return this.findOne(query);
  },
  
  /**
   * List users with pagination and filtering
   */
  async list(options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
      filter = {},
      search
    } = options;
    
    const skip = (page - 1) * limit;
    const sortOrder = order === 'desc' ? -1 : 1;
    
    // Build query
    const query = { ...filter };
    
    // Add search functionality
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      this.find(query)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  },
  
  /**
   * Get user statistics
   */
  async getStatistics() {
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          verifiedUsers: {
            $sum: {
              $cond: ['$emailVerified', 1, 0]
            }
          },
          avgKarma: { $avg: '$karma' },
          totalContributions: {
            $sum: {
              $add: [
                '$statistics.created',
                '$statistics.updated',
                '$statistics.voted'
              ]
            }
          }
        }
      }
    ]);
    
    return stats[0] || {
      totalUsers: 0,
      activeUsers: 0,
      verifiedUsers: 0,
      avgKarma: 0,
      totalContributions: 0
    };
  }
};

// Create and export model
const User = mongoose.model('User', UserSchema);
export default User;