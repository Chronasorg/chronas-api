/**
 * Modern User Model
 * 
 * Updated for Mongoose 8.x with improved validation,
 * security, and ES6+ features
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createNotFoundError, createValidationError } from '../middleware/errorHandler.js';

const { Schema } = mongoose;

/**
 * User Schema with modern Mongoose features
 */
const UserSchema = new Schema({
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
  }
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
  versionKey: false,
  toJSON: {
    transform: function(doc, ret) {\n      // Remove sensitive fields from JSON output\n      delete ret.password;\n      delete ret.emailVerificationToken;\n      delete ret.passwordResetToken;\n      delete ret.passwordResetExpires;\n      delete ret.twoFactorSecret;\n      return ret;\n    }\n  }\n});\n\n// Indexes for performance\nUserSchema.index({ email: 1 });\nUserSchema.index({ username: 1 });\nUserSchema.index({ createdAt: -1 });\nUserSchema.index({ lastLogin: -1 });\nUserSchema.index({ 'statistics.karma': -1 });\n\n// Virtual for full name\nUserSchema.virtual('fullName').get(function() {\n  if (this.firstName && this.lastName) {\n    return `${this.firstName} ${this.lastName}`;\n  }\n  return this.firstName || this.lastName || this.username;\n});\n\n// Virtual for display name\nUserSchema.virtual('displayName').get(function() {\n  return this.fullName || this.username;\n});\n\n// Pre-save middleware for password hashing\nUserSchema.pre('save', async function(next) {\n  // Only hash password if it's been modified\n  if (!this.isModified('password')) {\n    return next();\n  }\n  \n  try {\n    // Hash password with bcrypt\n    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;\n    this.password = await bcrypt.hash(this.password, saltRounds);\n    next();\n  } catch (error) {\n    next(error);\n  }\n});\n\n// Pre-save middleware for email verification\nUserSchema.pre('save', function(next) {\n  // If email is modified, mark as unverified\n  if (this.isModified('email') && !this.isNew) {\n    this.emailVerified = false;\n    this.emailVerificationToken = undefined;\n  }\n  next();\n});\n\n// Instance methods\nUserSchema.methods = {\n  /**\n   * Compare password with hash\n   */\n  async comparePassword(candidatePassword) {\n    if (!this.password) {\n      throw createValidationError('No password set for this user');\n    }\n    return bcrypt.compare(candidatePassword, this.password);\n  },\n  \n  /**\n   * Generate password reset token\n   */\n  generatePasswordResetToken() {\n    const crypto = require('crypto');\n    const token = crypto.randomBytes(32).toString('hex');\n    \n    this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');\n    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes\n    \n    return token;\n  },\n  \n  /**\n   * Generate email verification token\n   */\n  generateEmailVerificationToken() {\n    const crypto = require('crypto');\n    const token = crypto.randomBytes(32).toString('hex');\n    \n    this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');\n    \n    return token;\n  },\n  \n  /**\n   * Check if user has permission\n   */\n  hasPermission(permission) {\n    if (this.role === 'admin') return true;\n    return this.permissions.includes(permission) || this.permissions.includes('*');\n  },\n  \n  /**\n   * Update login information\n   */\n  updateLoginInfo() {\n    this.loginCount += 1;\n    this.lastLogin = new Date();\n    return this.save();\n  },\n  \n  /**\n   * Increment statistic\n   */\n  incrementStat(statName, amount = 1) {\n    if (this.statistics[statName] !== undefined) {\n      this.statistics[statName] += amount;\n      return this.save();\n    }\n    throw createValidationError(`Invalid statistic name: ${statName}`);\n  }\n};\n\n// Static methods\nUserSchema.statics = {\n  /**\n   * Get user by ID with error handling\n   */\n  async get(id) {\n    try {\n      const user = await this.findById(id);\n      if (!user) {\n        throw createNotFoundError('User not found');\n      }\n      return user;\n    } catch (error) {\n      if (error.name === 'CastError') {\n        throw createValidationError('Invalid user ID format');\n      }\n      throw error;\n    }\n  },\n  \n  /**\n   * Find user by email\n   */\n  async findByEmail(email) {\n    return this.findOne({ email: email.toLowerCase() });\n  },\n  \n  /**\n   * Find user by username\n   */\n  async findByUsername(username) {\n    return this.findOne({ username: username.toLowerCase() });\n  },\n  \n  /**\n   * Find user by email or username\n   */\n  async findByEmailOrUsername(identifier) {\n    const query = identifier.includes('@') ? \n      { email: identifier.toLowerCase() } : \n      { username: identifier.toLowerCase() };\n    \n    return this.findOne(query);\n  },\n  \n  /**\n   * List users with pagination and filtering\n   */\n  async list(options = {}) {\n    const {\n      page = 1,\n      limit = 20,\n      sort = 'createdAt',\n      order = 'desc',\n      filter = {},\n      search\n    } = options;\n    \n    const skip = (page - 1) * limit;\n    const sortOrder = order === 'desc' ? -1 : 1;\n    \n    // Build query\n    const query = { ...filter };\n    \n    // Add search functionality\n    if (search) {\n      query.$or = [\n        { username: { $regex: search, $options: 'i' } },\n        { firstName: { $regex: search, $options: 'i' } },\n        { lastName: { $regex: search, $options: 'i' } },\n        { email: { $regex: search, $options: 'i' } }\n      ];\n    }\n    \n    const [users, total] = await Promise.all([\n      this.find(query)\n        .sort({ [sort]: sortOrder })\n        .skip(skip)\n        .limit(limit)\n        .lean(),\n      this.countDocuments(query)\n    ]);\n    \n    return {\n      users,\n      pagination: {\n        page,\n        limit,\n        total,\n        pages: Math.ceil(total / limit)\n      }\n    };\n  },\n  \n  /**\n   * Get user statistics\n   */\n  async getStatistics() {\n    const stats = await this.aggregate([\n      {\n        $group: {\n          _id: null,\n          totalUsers: { $sum: 1 },\n          activeUsers: {\n            $sum: {\n              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]\n            }\n          },\n          verifiedUsers: {\n            $sum: {\n              $cond: ['$emailVerified', 1, 0]\n            }\n          },\n          avgKarma: { $avg: '$karma' },\n          totalContributions: {\n            $sum: {\n              $add: [\n                '$statistics.created',\n                '$statistics.updated',\n                '$statistics.voted'\n              ]\n            }\n          }\n        }\n      }\n    ]);\n    \n    return stats[0] || {\n      totalUsers: 0,\n      activeUsers: 0,\n      verifiedUsers: 0,\n      avgKarma: 0,\n      totalContributions: 0\n    };\n  }\n};\n\n// Create and export model\nconst User = mongoose.model('User', UserSchema);\nexport default User;"