import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';

import {
  createInvalidationScheduler, RESOURCE_PATHS,
  FLUSH_DELAY_MS, MIN_FLUSH_INTERVAL_MS, SETTLE_MS, MAX_RETRY_DELAY_MS,
  markDirty, markDirtyDeferred, edgeInvalidationActive, flushEdgeInvalidations, useSchedulerForTests
} from '../../helpers/edge-invalidation.js';

/**
 * The per-process CloudFront invalidation scheduler, on a fake clock and a
 * fake CloudFront client.
 */

const DISTRIBUTION = 'ETEST123';
const settle = () => new Promise(resolve => setImmediate(resolve));

function fakeClock(start = 1_000_000_000) {
  let current = start;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => current,
    setTimer(fn, ms) {
      const timer = { id: nextId++, at: current + ms, fn, unrefed: false, unref() { this.unrefed = true; return this; } };
      timers.set(timer.id, timer);
      return timer;
    },
    clearTimer(timer) {
      if (timer) timers.delete(timer.id);
    },
    timers: () => [...timers.values()],
    // Runs the timers that are due by then, in order, letting the promise
    // chains they start finish before the next one.
    async advance(ms) {
      const end = current + ms;
      for (;;) {
        const due = [...timers.values()].filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        current = due.at;
        timers.delete(due.id);
        due.fn();
        await settle();
      }
      current = end;
      await settle();
    }
  };
}

function setup({ distributionId = DISTRIBUTION, fail = () => null } = {}) {
  const clock = fakeClock();
  const sent = [];
  const warnings = [];
  const send = async (input) => {
    sent.push({ at: clock.now(), input });
    const error = fail(sent.length);
    if (error) throw error;
    return { Invalidation: { Id: `I${sent.length}`, Status: 'InProgress' } };
  };
  const scheduler = createInvalidationScheduler({
    distributionId, send, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    warn: entry => warnings.push(entry)
  });
  const paths = i => sent[i].input.InvalidationBatch.Paths.Items;
  return { clock, sent, warnings, scheduler, paths };
}

describe('## Edge invalidation scheduler', () => {
  it('maps areas, markers and metadata to one wildcard path each', async () => {
    const { clock, sent, scheduler, paths } = setup();
    expect(RESOURCE_PATHS).to.deep.equal({ areas: '/v1/areas/*', markers: '/v1/markers*', metadata: '/v1/metadata*' });
    scheduler.markDirty('metadata', 'areas', 'markers', 'areas');
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/areas/*', '/v1/markers*', '/v1/metadata*']);
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.have.length(1);
    expect(sent[0].input.DistributionId).to.equal(DISTRIBUTION);
    expect(sent[0].input.InvalidationBatch.Paths).to.deep.equal({ Quantity: 3, Items: ['/v1/areas/*', '/v1/markers*', '/v1/metadata*'] });
    expect(paths(0)).to.have.length(3);
  });

  it('ignores an unknown resource with a warning', () => {
    const { scheduler, warnings } = setup();
    scheduler.markDirty('users');
    expect(scheduler.pendingPaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
    expect(warnings).to.deep.equal([{ msg: 'edgeInvalidationUnknownResource', resource: 'users' }]);
  });

  it('does nothing without a distribution id (tests, local runs)', async () => {
    const { clock, sent, scheduler } = setup({ distributionId: '' });
    scheduler.markDirty('areas');
    scheduler.markDirtyDeferred('metadata');
    expect(scheduler.pendingPaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
    expect(scheduler.active()).to.equal(false);
    await scheduler.flush({ force: true });
    await clock.advance(60 * 60 * 1000);
    expect(sent).to.have.length(0);
  });

  it('sends one invalidation 15 s after the first write, with everything written in the window', async () => {
    const { clock, sent, scheduler, paths } = setup();
    const start = clock.now();
    scheduler.markDirty('areas');
    await clock.advance(4000);
    scheduler.markDirty('metadata');
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS - 4000 - 1);
    expect(sent).to.have.length(0);
    await clock.advance(1);
    expect(sent).to.have.length(1);
    expect(sent[0].at).to.equal(start + FLUSH_DELAY_MS);
    expect(paths(0)).to.deep.equal(['/v1/areas/*', '/v1/metadata*']);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
    await clock.advance(10 * 60 * 1000);
    expect(sent).to.have.length(1);
  });

  it('keeps a path written less than 10 s before a flush for the next one', async () => {
    const { clock, sent, scheduler, paths } = setup();
    const start = clock.now();
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS - SETTLE_MS + 2000);
    scheduler.markDirty('markers');
    await clock.advance(SETTLE_MS - 2000);
    expect(sent).to.have.length(1);
    expect(paths(0)).to.deep.equal(['/v1/areas/*', '/v1/markers*']);
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/markers*']);
    await clock.advance(MIN_FLUSH_INTERVAL_MS);
    expect(sent).to.have.length(2);
    expect(sent[1].at).to.equal(start + FLUSH_DELAY_MS + MIN_FLUSH_INTERVAL_MS);
    expect(paths(1)).to.deep.equal(['/v1/markers*']);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
  });

  it('flushes at most every 2 minutes while writes continue', async () => {
    const { clock, sent, scheduler } = setup();
    const start = clock.now();
    for (let t = 0; t < 5 * 60 * 1000; t += 5000) {
      scheduler.markDirty('areas', 'metadata');
      await clock.advance(5000);
    }
    await clock.advance(5 * 60 * 1000);
    const times = sent.map(s => s.at - start);
    expect(times[0]).to.equal(FLUSH_DELAY_MS);
    for (let i = 1; i < times.length; i += 1) expect(times[i] - times[i - 1]).to.be.at.least(MIN_FLUSH_INTERVAL_MS);
    // 5 minutes of writes: a flush after 15 s, then one every 2 minutes, the
    // last one at least SETTLE_MS after the last write.
    expect(sent.length).to.equal(4);
    expect(times[times.length - 1]).to.be.at.least((5 * 60 * 1000) - 5000 + SETTLE_MS);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
  });

  it('a failure warns once, keeps the paths and retries after 2, 4, 8 … minutes', async () => {
    const accessDenied = Object.assign(new Error('not authorized'), { name: 'AccessDenied', Code: 'AccessDenied' });
    const { clock, sent, warnings, scheduler } = setup({ fail: n => (n <= 3 ? accessDenied : null) });
    const start = clock.now();
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.have.length(1);
    expect(warnings).to.deep.equal([{
      msg: 'edgeInvalidationFailed', name: 'AccessDenied', message: 'not authorized', code: 'AccessDenied', paths: ['/v1/areas/*'], failures: 1
    }]);
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/areas/*']);
    expect(scheduler.active()).to.equal(false);

    scheduler.markDirty('metadata');
    await clock.advance(60 * 60 * 1000);
    const gaps = sent.map(s => s.at - start);
    expect(gaps).to.deep.equal([
      FLUSH_DELAY_MS,
      FLUSH_DELAY_MS + MIN_FLUSH_INTERVAL_MS,
      FLUSH_DELAY_MS + (3 * MIN_FLUSH_INTERVAL_MS),
      FLUSH_DELAY_MS + (7 * MIN_FLUSH_INTERVAL_MS)
    ]);
    expect(sent[3].input.InvalidationBatch.Paths.Items).to.deep.equal(['/v1/areas/*', '/v1/metadata*']);
    expect(warnings).to.have.length(3);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
    expect(scheduler.active()).to.equal(true);
  });

  it('caps the retry delay at 15 minutes', async () => {
    const { clock, sent, scheduler } = setup({ fail: () => new Error('throttled') });
    scheduler.markDirty('areas');
    await clock.advance(6 * 60 * 60 * 1000);
    const gaps = sent.slice(1).map((s, i) => s.at - sent[i].at);
    expect(Math.max(...gaps)).to.equal(MAX_RETRY_DELAY_MS);
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/areas/*']);
  });

  it('a send that throws synchronously counts as a failure, not an exception', async () => {
    const clock = fakeClock();
    const warnings = [];
    const scheduler = createInvalidationScheduler({
      distributionId: DISTRIBUTION,
      send: () => { throw new TypeError('client exploded'); },
      now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, warn: entry => warnings.push(entry)
    });
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    expect(warnings[0]).to.include({ msg: 'edgeInvalidationFailed', name: 'TypeError', message: 'client exploded' });
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/areas/*']);
  });

  it('deferred marks (votes) never send on their own and go out with the next flush', async () => {
    const { clock, sent, scheduler, paths } = setup();
    scheduler.markDirtyDeferred('metadata');
    expect(scheduler.isScheduled()).to.equal(false);
    await clock.advance(24 * 60 * 60 * 1000);
    await scheduler.flush({ force: true });
    expect(sent).to.have.length(0);

    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.have.length(1);
    expect(paths(0)).to.deep.equal(['/v1/areas/*', '/v1/metadata*']);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
  });

  it('a normal write to a deferred path makes it due', async () => {
    const { clock, sent, scheduler } = setup();
    scheduler.markDirtyDeferred('metadata');
    scheduler.markDirty('metadata');
    scheduler.markDirtyDeferred('metadata');
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.have.length(1);
  });

  // Votes need only an account, have no rate limit and aren't deduplicated.
  // Before, a vote refreshed the time of a pending write, so one write and a
  // vote every 10 s or less sent an invalidation every 2 minutes, all day.
  [5, 9, 10, 30].forEach((seconds) => {
    it(`a write and then a vote every ${seconds} s for 24 hours: one flush, which the votes ride along with, then none`, async () => {
      const { clock, sent, scheduler, paths } = setup();
      const start = clock.now();
      scheduler.markDirty('markers', 'metadata');
      for (let t = 0; t < 24 * 60 * 60 * 1000; t += seconds * 1000) {
        await clock.advance(seconds * 1000);
        scheduler.markDirtyDeferred('metadata');
      }
      expect(sent).to.have.length(1);
      expect(sent[0].at).to.equal(start + FLUSH_DELAY_MS);
      expect(paths(0)).to.deep.equal(['/v1/markers*', '/v1/metadata*']);
      // The latest votes wait for the next write's flush; they schedule nothing.
      expect(scheduler.duePaths()).to.deep.equal([]);
      expect(scheduler.pendingPaths()).to.deep.equal(['/v1/metadata*']);
      expect(scheduler.isScheduled()).to.equal(false);
      expect(clock.timers()).to.deep.equal([]);
      await scheduler.flush({ force: true });
      expect(sent).to.have.length(1);
    });
  });

  it('a second write less than 10 s before the flush, then votes: two flushes, then none', async () => {
    const { clock, sent, scheduler, paths } = setup();
    const start = clock.now();
    scheduler.markDirty('markers', 'metadata');
    await clock.advance(FLUSH_DELAY_MS - SETTLE_MS + 3000);
    scheduler.markDirty('metadata');
    for (let t = 0; t < 60 * 60 * 1000; t += 5000) {
      scheduler.markDirtyDeferred('metadata');
      await clock.advance(5000);
    }
    expect(sent.map(s => s.at - start)).to.deep.equal([FLUSH_DELAY_MS, FLUSH_DELAY_MS + MIN_FLUSH_INTERVAL_MS]);
    expect(paths(1)).to.deep.equal(['/v1/metadata*']);
    expect(scheduler.duePaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
  });

  it('a vote less than 10 s before a flush is kept, not due, and goes out with the next write', async () => {
    const { clock, sent, scheduler, paths } = setup();
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS - 2000);
    scheduler.markDirtyDeferred('metadata');
    await clock.advance(2000);
    expect(paths(0)).to.deep.equal(['/v1/areas/*', '/v1/metadata*']);
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/metadata*']);
    expect(scheduler.duePaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);

    await clock.advance(60 * 60 * 1000);
    expect(sent).to.have.length(1);
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.have.length(2);
    expect(paths(1)).to.deep.equal(['/v1/areas/*', '/v1/metadata*']);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
  });

  it('a vote while the request runs keeps the path pending, not due', async () => {
    const clock = fakeClock();
    const sent = [];
    let release;
    const scheduler = createInvalidationScheduler({
      distributionId: DISTRIBUTION,
      send: (input) => {
        sent.push(input.InvalidationBatch.Paths.Items);
        return new Promise((resolve) => { release = resolve; });
      },
      now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, warn: () => {}
    });
    scheduler.markDirty('metadata');
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.deep.equal([['/v1/metadata*']]);
    scheduler.markDirtyDeferred('metadata');
    release({});
    await settle();
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/metadata*']);
    expect(scheduler.duePaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
    await clock.advance(60 * 60 * 1000);
    expect(sent).to.have.length(1);
  });

  it('a vote never moves the time of a pending write', async () => {
    const { clock, sent, scheduler } = setup();
    const start = clock.now();
    scheduler.markDirty('metadata');
    await clock.advance(FLUSH_DELAY_MS - SETTLE_MS - 1000);
    // The write is now more than SETTLE_MS before the flush; a vote just
    // before it must not make the flush keep the path due.
    scheduler.markDirtyDeferred('metadata');
    await clock.advance(SETTLE_MS + 1000);
    expect(sent.map(s => s.at - start)).to.deep.equal([FLUSH_DELAY_MS]);
    expect(scheduler.duePaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
  });

  it('shutdown (SIGTERM) sends at once, also paths written moments ago', async () => {
    const { clock, sent, scheduler, paths } = setup();
    scheduler.markDirty('areas');
    await clock.advance(1000);
    scheduler.markDirty('markers');
    await scheduler.flush({ force: true });
    expect(sent).to.have.length(1);
    expect(paths(0)).to.deep.equal(['/v1/areas/*', '/v1/markers*']);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
    expect(scheduler.isScheduled()).to.equal(false);
    expect(clock.timers()).to.deep.equal([]);
  });

  it('shutdown during a flush waits for it, then sends what is left', async () => {
    const clock = fakeClock();
    const sent = [];
    let release;
    const scheduler = createInvalidationScheduler({
      distributionId: DISTRIBUTION,
      send: (input) => {
        sent.push(input.InvalidationBatch.Paths.Items);
        return sent.length === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({});
      },
      now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, warn: () => {}
    });
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    expect(sent).to.deep.equal([['/v1/areas/*']]);
    scheduler.markDirty('markers');
    const done = scheduler.flush({ force: true });
    await settle();
    expect(sent).to.have.length(1);
    release({});
    await done;
    expect(sent).to.deep.equal([['/v1/areas/*'], ['/v1/markers*']]);
    expect(scheduler.pendingPaths()).to.deep.equal([]);
  });

  it('a write during a flush is sent with the next one', async () => {
    const clock = fakeClock();
    const sent = [];
    let release;
    const scheduler = createInvalidationScheduler({
      distributionId: DISTRIBUTION,
      send: (input) => {
        sent.push({ at: clock.now(), paths: input.InvalidationBatch.Paths.Items });
        return sent.length === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({});
      },
      now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, warn: () => {}
    });
    const start = clock.now();
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    scheduler.markDirty('areas');
    release({});
    await settle();
    expect(scheduler.pendingPaths()).to.deep.equal(['/v1/areas/*']);
    await clock.advance(MIN_FLUSH_INTERVAL_MS);
    expect(sent.map(s => s.at - start)).to.deep.equal([FLUSH_DELAY_MS, FLUSH_DELAY_MS + MIN_FLUSH_INTERVAL_MS]);
  });

  it('unrefs its timers, so they never keep the process alive', () => {
    const { clock, scheduler } = setup();
    scheduler.markDirty('areas');
    expect(clock.timers()).to.have.length(1);
    expect(clock.timers()[0].unrefed).to.equal(true);
  });

  it('uses a unique CallerReference for every invalidation', async () => {
    const { clock, sent, scheduler } = setup();
    scheduler.markDirty('areas');
    await clock.advance(FLUSH_DELAY_MS);
    scheduler.markDirty('areas');
    await clock.advance(MIN_FLUSH_INTERVAL_MS);
    const refs = sent.map(s => s.input.InvalidationBatch.CallerReference);
    expect(refs).to.have.length(2);
    expect(refs[0]).to.match(/^chronas-api-\d+-[0-9a-f-]{36}$/);
    expect(refs[0]).to.not.equal(refs[1]);
  });

  describe('# the process scheduler', () => {
    let previous;
    let calls;

    beforeEach(() => {
      calls = [];
    });

    const withScheduler = async (fake, fn) => {
      previous = useSchedulerForTests(fake);
      try {
        await fn();
      } finally {
        useSchedulerForTests(previous);
      }
    };

    it('is inactive in tests, where CLOUDFRONT_DISTRIBUTION_ID is unset', () => {
      expect(process.env.CLOUDFRONT_DISTRIBUTION_ID).to.equal(undefined);
      expect(edgeInvalidationActive()).to.equal(false);
      markDirty('areas');
    });

    it('markDirty, markDirtyDeferred and flushEdgeInvalidations reach it', async () => {
      await withScheduler({
        markDirty: (...r) => calls.push(['markDirty', ...r]),
        markDirtyDeferred: (...r) => calls.push(['markDirtyDeferred', ...r]),
        flush: async options => calls.push(['flush', options]),
        active: () => true
      }, async () => {
        markDirty('markers', 'metadata');
        markDirtyDeferred('metadata');
        await flushEdgeInvalidations();
        expect(edgeInvalidationActive()).to.equal(true);
      });
      expect(calls).to.deep.equal([['markDirty', 'markers', 'metadata'], ['markDirtyDeferred', 'metadata'], ['flush', { force: true }]]);
    });

    it('never throws into the caller', async () => {
      const original = console.warn;
      const warned = [];
      console.warn = entry => warned.push(entry);
      try {
        await withScheduler({ markDirty: () => { throw new Error('broken'); } }, async () => {
          expect(() => markDirty('areas')).to.not.throw();
          expect(edgeInvalidationActive()).to.equal(false);
          await flushEdgeInvalidations();
        });
      } finally {
        console.warn = original;
      }
      expect(warned).to.deep.equal([{ msg: 'edgeInvalidationFailed', name: 'Error', message: 'broken' }]);
    });
  });
});
