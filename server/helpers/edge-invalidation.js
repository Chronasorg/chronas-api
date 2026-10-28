/**
 * CloudFront invalidation after writes to public map data.
 *
 * Area years, marker lists and metadata are cached at the edge for up to
 * 7 days (s-maxage, server/helpers/edge-cache.js). Every successful write
 * that changes them marks its resource dirty here (the models call
 * markDirty), and this process later sends one CreateInvalidation with all
 * dirty paths. Each path is a wildcard, which CloudFront bills as one path
 * however many objects it removes (1,000 paths a month are free, then
 * $0.005 each), and which covers every query string and header variant.
 *
 * - The first write after a quiet period is flushed 15 s later. The delay
 *   coalesces bursts, and lets eventually consistent reads (DynamoDB
 *   items, GSIs) settle before the edge copies go.
 * - While writes keep coming, flushes are at least 2 minutes apart, so a
 *   long data correction costs at most one path per resource and 2 minutes
 *   in each environment that handles its writes.
 * - A path written less than 10 s before a flush stays dirty for the next
 *   one: every write is followed by an invalidation at least SETTLE_MS
 *   later, which edge-cache.js relies on.
 * - Deferred marks (votes) never schedule a flush; they go out with the
 *   next one, so a write anyone can make costs no paths of its own.
 * - A failed flush keeps its paths and retries after 2, 4, 8 … minutes
 *   (at most 15), with one console.warn per failure.
 * - web-server.js sends whatever is still due on SIGTERM.
 *
 * One scheduler per process: each Web Function environment invalidates the
 * writes it handled. Without CLOUDFRONT_DISTRIBUTION_ID (tests, local runs,
 * scripts) nothing is recorded or sent, and edge-cache.js keeps the shorter
 * edge lifetimes, as it does while the last flush has failed. Nothing here
 * throws into request handling, and the timers never keep the process
 * alive.
 */

import { randomUUID } from 'node:crypto';

export const RESOURCE_PATHS = Object.freeze({
  areas: '/v1/areas/*',
  markers: '/v1/markers*',
  metadata: '/v1/metadata*'
});

export const FLUSH_DELAY_MS = 15 * 1000;
export const MIN_FLUSH_INTERVAL_MS = 2 * 60 * 1000;
export const SETTLE_MS = 10 * 1000;
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

/**
 * @param options.distributionId CloudFront distribution; without it the scheduler does nothing
 * @param options.send (CreateInvalidation input) => Promise
 */
export function createInvalidationScheduler({
  distributionId,
  send,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  warn = console.warn,
  delayMs = FLUSH_DELAY_MS,
  minIntervalMs = MIN_FLUSH_INTERVAL_MS,
  settleMs = SETTLE_MS,
  maxRetryDelayMs = MAX_RETRY_DELAY_MS,
  callerReference = () => `chronas-api-${now()}-${randomUUID()}`
} = {}) {
  const enabled = Boolean(distributionId);
  // Kept paths are flushed again no earlier than this after a flush, which
  // is what gives every write SETTLE_MS before its invalidation.
  const gapMs = Math.max(minIntervalMs, settleMs);
  const dirty = new Map(); // path -> { markedAt, deferred }
  let timer = null;
  let inFlight = null;
  let lastFlushAt = -Infinity;
  let failures = 0;

  const due = () => [...dirty.values()].some(entry => !entry.deferred);

  function schedule(at) {
    if (timer || inFlight) return;
    timer = setTimer(() => {
      timer = null;
      flush();
    }, Math.max(0, at - now()));
    timer?.unref?.();
  }

  function mark(resources, deferred) {
    if (!enabled) return;
    const at = now();
    let scheduled = false;
    for (const resource of resources) {
      const path = RESOURCE_PATHS[resource];
      if (!path) {
        warn({ msg: 'edgeInvalidationUnknownResource', resource: String(resource) });
        continue;
      }
      const previous = dirty.get(path);
      dirty.set(path, { markedAt: at, deferred: deferred && (!previous || previous.deferred) });
      if (!deferred) scheduled = true;
    }
    if (scheduled) schedule(Math.max(at + delayMs, lastFlushAt + gapMs));
  }

  /**
   * Send every dirty path now. `force` (shutdown) also clears paths written
   * moments ago. Nothing is sent while only deferred paths are dirty.
   * Resolves when done; never rejects.
   */
  function flush({ force = false } = {}) {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    if (inFlight) return force ? inFlight.then(() => flush({ force })) : inFlight;
    if (!due()) return Promise.resolve();

    const startedAt = now();
    const sent = new Map(dirty);
    const paths = [...sent.keys()].sort();
    const input = {
      DistributionId: distributionId,
      InvalidationBatch: { CallerReference: callerReference(), Paths: { Quantity: paths.length, Items: paths } }
    };

    inFlight = Promise.resolve()
      .then(() => send(input))
      .then(() => {
        failures = 0;
        lastFlushAt = startedAt;
        for (const [path, entry] of sent) {
          // Marked again while the request ran, or less than SETTLE_MS before
          // it: the next flush covers that write.
          if (dirty.get(path)?.markedAt !== entry.markedAt) continue;
          if (force || entry.markedAt <= startedAt - settleMs) dirty.delete(path);
        }
      }, (error) => {
        failures += 1;
        warn({
          msg: 'edgeInvalidationFailed',
          name: error?.name,
          message: error?.message ?? String(error),
          code: error?.Code ?? error?.code,
          paths,
          failures
        });
      })
      .finally(() => {
        inFlight = null;
        if (!due()) return;
        const retryDelay = Math.min(maxRetryDelayMs, minIntervalMs * (2 ** (failures - 1)));
        schedule(failures ? now() + retryDelay : Math.max(now(), lastFlushAt + gapMs));
      })
      .catch(() => {});
    return inFlight;
  }

  return {
    markDirty: (...resources) => mark(resources, false),
    markDirtyDeferred: (...resources) => mark(resources, true),
    flush,
    // Edge copies are being invalidated: configured, and the last flush worked.
    active: () => enabled && failures === 0,
    pendingPaths: () => [...dirty.keys()].sort(),
    isScheduled: () => Boolean(timer)
  };
}

// The CloudFront SDK is loaded on the first flush, so environments that
// handle no writes never load it.
let cloudFront = null;

function sendWithCloudFront(input) {
  cloudFront ||= import('@aws-sdk/client-cloudfront')
    .then(({ CloudFrontClient, CreateInvalidationCommand }) => ({
      // CloudFront's API is global (us-east-1). A stalled call fails after
      // 5 s and is retried: at most about 18 s. Without throwOnRequestTimeout
      // the SDK's requestTimeout only logs a warning.
      client: new CloudFrontClient({
        region: 'us-east-1',
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 1000, requestTimeout: 5000, throwOnRequestTimeout: true }
      }),
      CreateInvalidationCommand
    }))
    .catch((error) => {
      cloudFront = null;
      throw error;
    });
  return cloudFront.then(({ client, CreateInvalidationCommand }) => client.send(new CreateInvalidationCommand(input)));
}

let scheduler = createInvalidationScheduler({
  distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
  send: sendWithCloudFront
});

function safely(fn) {
  try {
    return fn();
  } catch (error) {
    console.warn({ msg: 'edgeInvalidationFailed', name: error?.name, message: error?.message ?? String(error) });
    return undefined;
  }
}

/** After a successful write: invalidate these resources ('areas', 'markers', 'metadata') soon. */
export function markDirty(...resources) {
  safely(() => scheduler.markDirty(...resources));
}

/** After a write anyone may make (votes): invalidate with the next flush, never on its own. */
export function markDirtyDeferred(...resources) {
  safely(() => scheduler.markDirtyDeferred(...resources));
}

/** Whether this process invalidates edge copies after writes (edge-cache.js). */
export function edgeInvalidationActive() {
  return Boolean(safely(() => scheduler.active?.()));
}

/** Shutdown: send what is due now. Resolves when done; never rejects. */
export function flushEdgeInvalidations() {
  return Promise.resolve(safely(() => scheduler.flush?.({ force: true })));
}

/** Tests: replace this process's scheduler; returns the previous one. */
export function useSchedulerForTests(next) {
  const previous = scheduler;
  scheduler = next;
  return previous;
}
