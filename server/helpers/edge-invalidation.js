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
 * - A path written less than 10 s before a flush stays due for the next
 *   one: every write is followed by an invalidation at least SETTLE_MS
 *   later, which edge-cache.js relies on.
 * - Deferred marks (votes) never make a path due: they never schedule a
 *   flush, never keep one going, and never move the time of a path's last
 *   write. They go out with the next flush a write schedules, so a write
 *   anyone can make costs no paths of its own, however often it comes.
 * - A failed flush keeps its paths and retries after 2, 4, 8 … minutes
 *   (at most 15), with one console.warn per failure.
 * - web-server.js sends whatever is still due on SIGTERM.
 *
 * One scheduler per process: each Web Function environment invalidates the
 * writes it handled. Without CLOUDFRONT_DISTRIBUTION_ID (tests, local runs,
 * scripts) nothing is recorded or sent, and edge-cache.js keeps each
 * response's previous edge lifetime, as it does while the last flush has
 * failed. Scripts that write through the models are short-lived processes
 * that exit before any timer here fires; they call invalidateNow() after
 * their writes instead (scripts/data-validation/edge-invalidation-cli.js).
 * Nothing here throws into request handling, and the timers never keep the
 * process alive.
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
  // path -> { markedAt, urgentAt }: the last mark of any kind, and the last
  // non-deferred one (null while the path only has deferred marks). Only
  // urgentAt makes a path due.
  const dirty = new Map();
  let timer = null;
  let inFlight = null;
  let lastFlushAt = -Infinity;
  let failures = 0;

  const due = () => [...dirty.values()].some(entry => entry.urgentAt !== null);

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
      // A deferred mark keeps the time of the last non-deferred one: a
      // stream of votes must not keep a path due once its write has been
      // invalidated.
      const urgentAt = deferred ? (dirty.get(path)?.urgentAt ?? null) : at;
      dirty.set(path, { markedAt: at, urgentAt });
      if (!deferred) scheduled = true;
    }
    if (scheduled) schedule(Math.max(at + delayMs, lastFlushAt + gapMs));
  }

  /**
   * Send every dirty path now, deferred ones included. `force` (shutdown)
   * also clears paths written moments ago. Nothing is sent while only
   * deferred paths are dirty. Resolves when done; never rejects.
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
    // Marked less than SETTLE_MS before the flush: DynamoDB reads may not
    // see that change yet, so the edge could fetch the old data again.
    const tooRecent = at => !force && at !== null && at > startedAt - settleMs;

    inFlight = Promise.resolve()
      .then(() => send(input))
      .then(() => {
        failures = 0;
        lastFlushAt = startedAt;
        for (const [path, before] of sent) {
          const entry = dirty.get(path);
          if (!entry) continue;
          // A non-deferred mark while the request ran, or less than
          // SETTLE_MS before it: still due, so the next flush covers it.
          if (entry.urgentAt !== before.urgentAt || tooRecent(entry.urgentAt)) continue;
          // Only deferred marks are that recent: they wait for the next
          // flush without making the path due, so they schedule nothing.
          if (entry.markedAt !== before.markedAt || tooRecent(entry.markedAt)) {
            dirty.set(path, { markedAt: entry.markedAt, urgentAt: null });
          } else {
            dirty.delete(path);
          }
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
    // Paths a write made due (deferred-only paths are pending, not due).
    duePaths: () => [...dirty].filter(([, entry]) => entry.urgentAt !== null).map(([path]) => path).sort(),
    isScheduled: () => Boolean(timer)
  };
}

// The CloudFront SDK is loaded on the first flush (or invalidateNow), so
// environments that handle no writes never load it.
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

/**
 * For writes this process's scheduler can't cover: admin scripts that write
 * through the models exit long before a flush. Sends one CreateInvalidation
 * for these resources now, and resolves when CloudFront has accepted it
 * (it then takes about 10–100 s to complete); rejects when it hasn't.
 * @param resources 'areas' | 'markers' | 'metadata'
 * @param options.distributionId defaults to CLOUDFRONT_DISTRIBUTION_ID
 * @returns {Promise<{ distributionId, paths, id, status }>}
 */
export async function invalidateNow(resources, {
  distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID,
  send = sendWithCloudFront,
  callerReference = `chronas-api-script-${Date.now()}-${randomUUID()}`
} = {}) {
  if (!distributionId) throw new Error('invalidateNow: no CloudFront distribution id');
  const paths = [...new Set(resources.map((resource) => {
    const path = RESOURCE_PATHS[resource];
    if (!path) throw new Error(`invalidateNow: unknown resource ${String(resource)}`);
    return path;
  }))].sort();
  if (!paths.length) throw new Error('invalidateNow: nothing to invalidate');
  const result = await send({
    DistributionId: distributionId,
    InvalidationBatch: { CallerReference: callerReference, Paths: { Quantity: paths.length, Items: paths } }
  });
  return { distributionId, paths, id: result?.Invalidation?.Id ?? null, status: result?.Invalidation?.Status ?? null };
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

/** After a write anyone may make (votes): invalidate with the next flush a write schedules, never on its own. */
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
