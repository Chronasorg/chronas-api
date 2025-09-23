/**
 * Simple validation middleware compatible with modern Joi
 */
import httpStatus from 'http-status';
import APIError from './APIError.js';

/**
 * Validation middleware factory
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validate(schema) {
  return (req, res, next) => {
    const toValidate = {};
    
    if (schema.body) {
      toValidate.body = req.body;
    }
    
    if (schema.params) {
      toValidate.params = req.params;
    }
    
    if (schema.query) {
      toValidate.query = req.query;
    }
    
    // Validate each part
    for (const [key, value] of Object.entries(toValidate)) {
      if (schema[key]) {
        const { error } = schema[key].validate(value);
        if (error) {
          const err = new APIError(error.details[0].message, httpStatus.BAD_REQUEST, true);
          return next(err);
        }
      }
    }
    
    next();
  };
}

export default validate;