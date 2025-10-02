/**
 * Modern Cache Middleware
 *
 * Provides intelligent caching with Redis support and memory fallback
 */

import NodeCache from 'node-cache';
import { createClient } from 'redis';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Memory cache fallback
const memoryCache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every minute
  useClones: false
});

// Redis client (optional)
let redisClient = null;
let redisConnected = false;

// Initialize Redis if available
async function initializeRedis() {
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    try {
      const redisConfig = process.env.REDIS_URL
        ? { url: process.env.REDIS_URL }
        : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB) || 0
        };

      redisClient = createClient(redisConfig);

      redisClient.on('error', (err) => {
        logger.error('Redis connection error:', err);
        redisConnected = false;
      });

      redisClient.on('connect', () => {
        logger.info('Connected to Redis');
        redisConnected = true;
      });

      redisClient.on('disconnect', () => {
        logger.warn('Disconnected from Redis');
        redisConnected = false;
      });

      await redisClient.connect();
    } catch (error) {
      logger.warn('Failed to initialize Redis, using memory cache:', error.message);
      redisClient = null;
      redisConnected = false;
    }
  }
}

// Initialize Redis on startup (non-blocking)
initializeRedis().catch(err => {
  logger.warn('Redis initialization failed:', err.message);
});

/**
 * Cache interface that abstracts Redis/Memory cache
 */
class CacheManager {
  async get(key) {
    try {
      if (redisConnected && redisClient) {
        const value = await redisClient.get(key);
        return value ? JSON.parse(value) : null;
      }
    } catch (error) {
      logger.warn('Redis get error, falling back to memory cache:', error.message);
    }

    return memoryCache.get(key) || null;
  }

  async set(key, value, ttl = 300) {
    try {
      if (redisConnected && redisClient) {
        await redisClient.setEx(key, ttl, JSON.stringify(value));
        return true;
      }
    } catch (error) {
      logger.warn('Redis set error, falling back to memory cache:', error.message);
    }

    return memoryCache.set(key, value, ttl);
  }

  async del(key) {
    try {
      if (redisConnected && redisClient) {
        await redisClient.del(key);
      }
    } catch (error) {
      logger.warn('Redis delete error:', error.message);
    }

    memoryCache.del(key);
  }

  async flush() {
    try {
      if (redisConnected && redisClient) {
        await redisClient.flushDb();
      }
    } catch (error) {
      logger.warn('Redis flush error:', error.message);
    }

    memoryCache.flushAll();
  }

  async exists(key) {
    try {
      if (redisConnected && redisClient) {
        return await redisClient.exists(key) === 1;
      }
    } catch (error) {
      logger.warn('Redis exists error:', error.message);
    }

    return memoryCache.has(key);
  }
}

const cache = new CacheManager();

/**
 * Generate cache key from request
 */
function generateCacheKey(req, options = {}) {
  const { prefix = 'api', includeUser = false, includeQuery = true } = options;

  let key = `${prefix}:${req.method}:${req.path}`;

  if (includeQuery && Object.keys(req.query).length > 0) {
    const sortedQuery = Object.keys(req.query)
      .sort()
      .map(k => `${k}=${req.query[k]}`)
      .join('&');
    key += `:${Buffer.from(sortedQuery).toString('base64')}`;
  }

  if (includeUser && req.user) {
    key += `:user:${req.user.id}`;
  }

  return key;
}

/**
 * Cache response middleware
 */
export const cacheResponse = (options = {}) => {
  const {
    ttl = 300, // 5 minutes default
    prefix = 'api',
    includeUser = false,
    includeQuery = true,
    condition = null, // Function to determine if response should be cached
    keyGenerator = null // Custom key generator function
  } = options;

  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching if user is authenticated and includeUser is false
    if (req.user && !includeUser) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator
        ? keyGenerator(req)
        : generateCacheKey(req, { prefix, includeUser, includeQuery });

      // Try to get cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug('Cache hit', { key: cacheKey, requestId: req.lambda?.context?.awsRequestId });

        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
          'Cache-Control': `public, max-age=${ttl}`
        });

        return res.status(cachedResponse.status).json(cachedResponse.data);
      }

      logger.debug('Cache miss', { key: cacheKey, requestId: req.lambda?.context?.awsRequestId });

      // Store original res.json method
      const originalJson = res.json;

      // Override res.json to cache the response
      res.json = function (data) {
        // Check if response should be cached
        if (condition && !condition(req, res, data)) {
          return originalJson.call(this, data);
        }

        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const responseToCache = {
            status: res.statusCode,
            data
          };

          // Cache the response (non-blocking)
          cache.set(cacheKey, responseToCache, ttl).catch(err => {
            logger.warn('Failed to cache response:', err.message);
          });

          // Set cache headers
          res.set({
            'X-Cache': 'MISS',
            'X-Cache-Key': cacheKey,
            'Cache-Control': `public, max-age=${ttl}`
          });
        }

        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
};

/**
 * Cache invalidation middleware
 */
export const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override response methods to invalidate cache after successful operations
    const invalidateAfterResponse = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Invalidate cache patterns (non-blocking)
        Promise.all(patterns.map(async (pattern) => {
          try {
            if (typeof pattern === 'function') {
              const keys = pattern(req, res, data);
              if (Array.isArray(keys)) {
                await Promise.all(keys.map(key => cache.del(key)));
              } else if (keys) {
                await cache.del(keys);
              }
            } else if (typeof pattern === 'string') {
              await cache.del(pattern);
            }
          } catch (error) {
            logger.warn('Cache invalidation error:', error.message);
          }
        })).catch(err => {
          logger.warn('Cache invalidation failed:', err.message);
        });
      }

      return data;
    };

    res.json = function (data) {
      invalidateAfterResponse(data);
      return originalJson.call(this, data);
    };

    res.send = function (data) {
      invalidateAfterResponse(data);
      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Cache warming middleware
 */
export const warmCache = (keys = []) => {
  return async (req, res, next) => {
    try {
      // Warm cache with predefined keys (non-blocking)
      Promise.all(keys.map(async (keyConfig) => {
        const { key, fetcher, ttl = 300 } = keyConfig;

        if (!(await cache.exists(key))) {
          try {
            const data = await fetcher();
            await cache.set(key, data, ttl);
            logger.debug('Cache warmed', { key });
          } catch (error) {
            logger.warn('Cache warming failed', { key, error: error.message });
          }
        }
      })).catch(err => {
        logger.warn('Cache warming error:', err.message);
      });
    } catch (error) {
      logger.error('Cache warming middleware error:', error);
    }

    next();
  };
};

/**
 * Main cache middleware with sensible defaults
 */
export const cacheMiddleware = cacheResponse({
  ttl: 300, // 5 minutes
  includeQuery: true,
  condition: (req, res, data) => {
    // Don't cache error responses
    if (res.statusCode >= 400) return false;

    // Don't cache empty responses
    if (!data || (Array.isArray(data) && data.length === 0)) return false;

    return true;
  }
});

/**
 * Cache utilities
 */
export const cacheUtils = {
  // Get cache instance
  getCache: () => cache,

  // Manual cache operations
  get: (key) => cache.get(key),
  set: (key, value, ttl) => cache.set(key, value, ttl),
  del: (key) => cache.del(key),
  flush: () => cache.flush(),
  exists: (key) => cache.exists(key),

  // Generate cache key
  generateKey: generateCacheKey,

  // Cache statistics (memory cache only)
  getStats: () => memoryCache.getStats(),

  // Redis status
  isRedisConnected: () => redisConnected
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
});

export default cacheMiddleware;
