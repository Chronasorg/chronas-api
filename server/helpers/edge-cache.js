/**
 * Edge lifetime (s-maxage) of the public map-data responses.
 *
 * CloudFront may keep these responses for up to 7 days, because every write
 * invalidates them (edge-invalidation.js). Without invalidation (no
 * CLOUDFRONT_DISTRIBUTION_ID, or the last invalidation failed) each
 * response gets exactly the edge lifetime it had before edge invalidation
 * existed, which its handler passes, and none of the bounds below: they
 * only matter for lifetimes longer than that.
 *
 * With invalidation, 7 days only holds for responses built from data newer
 * than any write whose invalidation may already have run. Two kinds of
 * response aren't:
 *
 * - Responses served from an in-process cache (area years, metadata
 *   lists). Each Web Function environment has its own caches, and a write
 *   only clears the cache of the environment that handled it, so another
 *   environment can serve its older copy after the invalidation. Such a
 *   response gets an s-maxage that ends when its cache entry expires, never
 *   later.
 * - Responses whose reads took longer than FRESH_MS. A write during the
 *   read could be invalidated before the response reaches the edge, so they
 *   get SLOW_READ_EDGE_MAX_AGE.
 *
 * The scheduler sends a path's invalidation at least SETTLE_MS after the
 * last write to it (votes wait for the next write's invalidation), and
 * FRESH_MS = SETTLE_MS / 2 leaves the rest for eventually consistent reads
 * and the transfer to the edge.
 *
 * Each request carries its own record (AsyncLocalStorage, started by
 * trackDataAge in config/express.js), so concurrent requests never share
 * one.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import { SETTLE_MS, edgeInvalidationActive } from './edge-invalidation.js';

export const EDGE_MAX_AGE = 7 * 24 * 60 * 60;
export const FRESH_MS = SETTLE_MS / 2;
export const SLOW_READ_EDGE_MAX_AGE = 60;

const requests = new AsyncLocalStorage();

/** Express middleware: start the data-age record of this request. */
export function trackDataAge(req, res, next) {
  requests.run({ startedAt: Date.now(), cachedDataAt: Infinity, cachedExpiresAt: Infinity }, next);
}

/** When the oldest data the current request holds was read. */
export function dataReadAt() {
  const record = requests.getStore();
  return record ? Math.min(record.startedAt, record.cachedDataAt) : Date.now();
}

/**
 * The current request uses a cache entry: its data was read at `dataAt`,
 * and the entry expires at `expiresAt`.
 */
export function noteCachedRead({ dataAt, expiresAt }) {
  const record = requests.getStore();
  if (!record) return;
  record.cachedDataAt = Math.min(record.cachedDataAt, dataAt);
  record.cachedExpiresAt = Math.min(record.cachedExpiresAt, expiresAt);
}

/** The current request joined a load another request started at `startedAt`. */
export function noteSharedLoad(startedAt) {
  const record = requests.getStore();
  if (record) record.startedAt = Math.min(record.startedAt, startedAt);
}

/** BoundedCache options that record and report the age of cached data. */
export const cacheDataAge = Object.freeze({ dataAt: dataReadAt, onHit: noteCachedRead });

/**
 * s-maxage, in seconds, for a public response of the current request.
 * @param withoutInvalidation the s-maxage while edge copies aren't invalidated
 */
export function edgeMaxAge(withoutInvalidation = 0, now = Date.now()) {
  if (!edgeInvalidationActive()) return withoutInvalidation;
  let maxAge = EDGE_MAX_AGE;
  const record = requests.getStore();
  if (!record) return maxAge;
  if (now - record.startedAt > FRESH_MS) maxAge = Math.min(maxAge, SLOW_READ_EDGE_MAX_AGE);
  if (now - record.cachedDataAt > FRESH_MS) {
    maxAge = Math.min(maxAge, Math.max(0, Math.ceil((record.cachedExpiresAt - now) / 1000)));
  }
  return maxAge;
}

/**
 * Cache-Control of a public map-data response.
 * @param maxAge browser lifetime in seconds
 * @param withoutInvalidation edge lifetime in seconds while edge copies aren't invalidated
 */
export function publicCacheControl(maxAge, withoutInvalidation) {
  return `public, max-age=${maxAge}, s-maxage=${edgeMaxAge(withoutInvalidation)}`;
}
