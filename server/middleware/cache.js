/**
 * Cache Middleware
 *
 * Uses memory-cache (already in dependencies) for in-memory caching.
 * Lambda restarts clear the cache, which is acceptable for this use case.
 */

import memoryCache from 'memory-cache';

/**
 * Cache interface wrapping memory-cache
 */
class CacheManager {
  async get(key) {
    return memoryCache.get(key) || null;
  }

  async set(key, value, ttl = 300) {
    memoryCache.put(key, value, ttl * 1000); // memory-cache uses ms
    return true;
  }

  async del(key) {
    memoryCache.del(key);
  }

  async flush() {
    memoryCache.clear();
  }

  async exists(key) {
    return memoryCache.get(key) !== null;
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
    ttl = 300,
    prefix = 'api',
    includeUser = false,
    includeQuery = true,
    condition = null,
    keyGenerator = null
  } = options;

  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    if (req.user && !includeUser) {
      return next();
    }

    try {
      const cacheKey = keyGenerator
        ? keyGenerator(req)
        : generateCacheKey(req, { prefix, includeUser, includeQuery });

      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        res.set({
          'X-Cache': 'HIT',
          'Cache-Control': `public, max-age=${ttl}`
        });
        return res.status(cachedResponse.status).json(cachedResponse.data);
      }

      const originalJson = res.json;

      res.json = function (data) {
        if (condition && !condition(req, res, data)) {
          return originalJson.call(this, data);
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(cacheKey, { status: res.statusCode, data }, ttl).catch(() => {});

          res.set({
            'X-Cache': 'MISS',
            'Cache-Control': `public, max-age=${ttl}`
          });
        }

        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      next();
    }
  };
};

/**
 * Cache invalidation middleware
 */
export const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    const originalJson = res.json;

    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
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
            // Ignore invalidation errors
          }
        })).catch(() => {});
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Default cache middleware with sensible defaults
 */
const cacheMiddleware = cacheResponse({
  ttl: 300,
  includeQuery: true,
  condition: (req, res, data) => {
    if (res.statusCode >= 400) return false;
    if (!data || (Array.isArray(data) && data.length === 0)) return false;
    return true;
  }
});

/**
 * Cache utilities
 */
export const cacheUtils = {
  getCache: () => cache,
  get: (key) => cache.get(key),
  set: (key, value, ttl) => cache.set(key, value, ttl),
  del: (key) => cache.del(key),
  flush: () => cache.flush(),
  exists: (key) => cache.exists(key),
  generateKey: generateCacheKey,
  getStats: () => ({ keys: memoryCache.keys().length, hits: 0, misses: 0 }),
  isRedisConnected: () => false
};

export default cacheMiddleware;
