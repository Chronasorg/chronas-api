/**
 * Modern Validation Middleware
 * 
 * Provides comprehensive request validation using Joi schemas
 * with proper error handling and sanitization.
 */

import Joi from 'joi';
import { ValidationError } from './errorHandler.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Common validation schemas
 */
export const commonSchemas = {
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid ObjectId format'),
  email: Joi.string().email().lowercase().trim(),
  password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).message('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  username: Joi.string().alphanum().min(3).max(30).lowercase().trim(),
  url: Joi.string().uri(),
  coordinates: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required()
  }),
  dateRange: Joi.object({
    start: Joi.date().iso(),
    end: Joi.date().iso().min(Joi.ref('start'))
  }),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('asc', 'desc', '1', '-1').default('desc'),
    sortBy: Joi.string().default('createdAt')
  })
};

/**
 * Area validation schemas
 */
export const areaSchemas = {
  create: Joi.object({
    name: Joi.string().required().trim().max(200),
    year: Joi.number().integer().min(-3000).max(3000).required(),
    geometry: Joi.object().required(),
    properties: Joi.object().default({}),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#FF0000'),
    opacity: Joi.number().min(0).max(1).default(0.7),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    description: Joi.string().max(1000).allow('').default('')
  }),
  
  update: Joi.object({
    name: Joi.string().trim().max(200),
    year: Joi.number().integer().min(-3000).max(3000),
    geometry: Joi.object(),
    properties: Joi.object(),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    opacity: Joi.number().min(0).max(1),
    tags: Joi.array().items(Joi.string().trim()),
    description: Joi.string().max(1000).allow('')
  }).min(1),
  
  query: Joi.object({
    year: Joi.number().integer().min(-3000).max(3000),
    name: Joi.string().trim(),
    tags: Joi.alternatives().try(
      Joi.string().trim(),
      Joi.array().items(Joi.string().trim())
    ),
    bbox: Joi.string().pattern(/^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$/),
    ...commonSchemas.pagination
  })
};

/**
 * Marker validation schemas
 */
export const markerSchemas = {
  create: Joi.object({
    name: Joi.string().required().trim().max(200),
    year: Joi.number().integer().min(-3000).max(3000).required(),
    coordinates: commonSchemas.coordinates.required(),
    type: Joi.string().valid('city', 'battle', 'event', 'landmark', 'other').default('other'),
    description: Joi.string().max(2000).allow('').default(''),
    population: Joi.number().integer().min(0),
    importance: Joi.number().integer().min(1).max(5).default(3),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    metadata: Joi.object().default({})
  }),
  
  update: Joi.object({
    name: Joi.string().trim().max(200),
    year: Joi.number().integer().min(-3000).max(3000),
    coordinates: commonSchemas.coordinates,
    type: Joi.string().valid('city', 'battle', 'event', 'landmark', 'other'),
    description: Joi.string().max(2000).allow(''),
    population: Joi.number().integer().min(0),
    importance: Joi.number().integer().min(1).max(5),
    tags: Joi.array().items(Joi.string().trim()),
    metadata: Joi.object()
  }).min(1),
  
  query: Joi.object({
    year: Joi.number().integer().min(-3000).max(3000),
    name: Joi.string().trim(),
    type: Joi.string().valid('city', 'battle', 'event', 'landmark', 'other'),
    tags: Joi.alternatives().try(
      Joi.string().trim(),
      Joi.array().items(Joi.string().trim())
    ),
    bbox: Joi.string().pattern(/^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$/),
    importance: Joi.number().integer().min(1).max(5),
    ...commonSchemas.pagination
  })
};

/**
 * User validation schemas
 */
export const userSchemas = {
  register: Joi.object({
    username: commonSchemas.username.required(),
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Passwords do not match'
    }),
    firstName: Joi.string().trim().max(50),
    lastName: Joi.string().trim().max(50),
    acceptTerms: Joi.boolean().valid(true).required().messages({
      'any.only': 'You must accept the terms and conditions'
    })
  }),
  
  login: Joi.object({
    username: Joi.alternatives().try(
      commonSchemas.username,
      commonSchemas.email
    ).required(),
    password: Joi.string().required()
  }),
  
  update: Joi.object({
    firstName: Joi.string().trim().max(50).allow(''),
    lastName: Joi.string().trim().max(50).allow(''),
    email: commonSchemas.email,
    bio: Joi.string().max(500).allow(''),
    website: commonSchemas.url.allow(''),
    location: Joi.string().max(100).allow(''),
    preferences: Joi.object({
      theme: Joi.string().valid('light', 'dark', 'auto').default('auto'),
      language: Joi.string().valid('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh').default('en'),
      notifications: Joi.object({
        email: Joi.boolean().default(true),
        push: Joi.boolean().default(false)
      }).default({})
    }).default({})
  }).min(1),
  
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'Passwords do not match'
    })
  })
};

/**
 * Collection validation schemas
 */
export const collectionSchemas = {
  create: Joi.object({
    name: Joi.string().required().trim().max(200),
    description: Joi.string().max(1000).allow('').default(''),
    isPublic: Joi.boolean().default(false),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    items: Joi.array().items(Joi.object({
      type: Joi.string().valid('area', 'marker').required(),
      id: commonSchemas.objectId.required(),
      note: Joi.string().max(500).allow('').default('')
    })).default([])
  }),
  
  update: Joi.object({
    name: Joi.string().trim().max(200),
    description: Joi.string().max(1000).allow(''),
    isPublic: Joi.boolean(),
    tags: Joi.array().items(Joi.string().trim()),
    items: Joi.array().items(Joi.object({
      type: Joi.string().valid('area', 'marker').required(),
      id: commonSchemas.objectId.required(),
      note: Joi.string().max(500).allow('').default('')
    }))
  }).min(1),
  
  query: Joi.object({
    name: Joi.string().trim(),
    isPublic: Joi.boolean(),
    tags: Joi.alternatives().try(
      Joi.string().trim(),
      Joi.array().items(Joi.string().trim())
    ),
    userId: commonSchemas.objectId,
    ...commonSchemas.pagination
  })
};

/**
 * Create validation middleware
 */
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      let dataToValidate;
      
      switch (source) {
        case 'body':
          dataToValidate = req.body;
          break;
        case 'query':
          dataToValidate = req.query;
          break;
        case 'params':
          dataToValidate = req.params;
          break;
        case 'headers':
          dataToValidate = req.headers;
          break;
        default:
          dataToValidate = req.body;
      }
      
      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });
      
      if (error) {
        const validationError = new ValidationError('Validation failed');
        validationError.details = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        
        logger.debug('Validation failed', {
          source,
          errors: validationError.details,
          requestId: req.lambda?.context?.awsRequestId || req.id
        });
        
        return next(validationError);
      }
      
      // Replace the source data with validated and sanitized data
      switch (source) {
        case 'body':
          req.body = value;
          break;
        case 'query':
          req.query = value;
          break;
        case 'params':
          req.params = value;
          break;
      }
      
      next();
      
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Sanitize input middleware
 */
export const sanitizeInput = (req, res, next) => {
  // Remove potentially dangerous characters
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  };
  
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  
  next();
};

/**
 * Rate limiting validation
 */
export const validateRateLimit = (req, res, next) => {
  // Add rate limiting headers
  const limit = 100; // requests per window
  const window = 15 * 60 * 1000; // 15 minutes
  
  res.set({
    'X-RateLimit-Limit': limit,
    'X-RateLimit-Window': window,
    'X-RateLimit-Remaining': limit - 1 // This would be calculated based on actual usage
  });
  
  next();
};

/**
 * Main validation middleware that applies common validations
 */
export const validationMiddleware = (req, res, next) => {
  // Apply sanitization
  sanitizeInput(req, res, (err) => {
    if (err) return next(err);
    
    // Apply rate limit headers
    validateRateLimit(req, res, next);
  });
};

/**
 * Validate ObjectId parameter
 */
export const validateObjectId = (paramName = 'id') => {
  return validate(Joi.object({
    [paramName]: commonSchemas.objectId.required()
  }), 'params');
};

/**
 * Validate pagination parameters
 */
export const validatePagination = validate(commonSchemas.pagination, 'query');

/**
 * Custom validation helper
 */
export const createValidator = (schema, options = {}) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
      ...options
    });
    
    if (error) {
      const validationError = new ValidationError('Validation failed');
      validationError.details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return next(validationError);
    }
    
    req.body = value;
    next();
  };
};