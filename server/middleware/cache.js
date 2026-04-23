import memoryCache from 'memory-cache';

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

export const cacheUtils = {
  getCache: () => cache,
  get: (key) => cache.get(key),
  set: (key, value, ttl) => cache.set(key, value, ttl),
  del: (key) => cache.del(key),
  flush: () => cache.flush(),
  exists: (key) => cache.exists(key),
  getStats: () => ({ keys: memoryCache.keys().length, hits: 0, misses: 0 }),
  isRedisConnected: () => false
};
