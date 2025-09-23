/**
 * Error Handler Middleware
 * 
 * Provides utility functions for creating standardized errors
 */

import APIError from '../helpers/APIError.js';
import httpStatus from 'http-status';

/**
 * Create a not found error
 * @param {string} message - Error message
 * @returns {APIError} - Standardized API error
 */
export function createNotFoundError(message = 'Resource not found') {
  return new APIError(message, httpStatus.NOT_FOUND, true);
}

/**
 * Create a validation error
 * @param {string} message - Error message
 * @returns {APIError} - Standardized API error
 */
export function createValidationError(message = 'Validation failed') {
  return new APIError(message, httpStatus.BAD_REQUEST, true);
}

/**
 * Create a server error
 * @param {string} message - Error message
 * @returns {APIError} - Standardized API error
 */
export function createServerError(message = 'Internal server error') {
  return new APIError(message, httpStatus.INTERNAL_SERVER_ERROR, true);
}

/**
 * Create an unauthorized error
 * @param {string} message - Error message
 * @returns {APIError} - Standardized API error
 */
export function createUnauthorizedError(message = 'Unauthorized') {
  return new APIError(message, httpStatus.UNAUTHORIZED, true);
}

/**
 * Create a forbidden error
 * @param {string} message - Error message
 * @returns {APIError} - Standardized API error
 */
export function createForbiddenError(message = 'Forbidden') {
  return new APIError(message, httpStatus.FORBIDDEN, true);
}

export default {
  createNotFoundError,
  createValidationError,
  createServerError,
  createUnauthorizedError,
  createForbiddenError
};