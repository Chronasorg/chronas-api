import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';

import BoundedCache from '../../helpers/bounded-cache.js';
import {
  EDGE_MAX_AGE, FRESH_MS, INACTIVE_MAX_AGE, SLOW_READ_EDGE_MAX_AGE,
  trackDataAge, dataReadAt, noteSharedLoad, cacheDataAge, edgeMaxAge, publicCacheControl
} from '../../helpers/edge-cache.js';
import { SETTLE_MS, useSchedulerForTests } from '../../helpers/edge-invalidation.js';

/**
 * Edge lifetimes of public responses: 7 days while writes invalidate the
 * edge, unless the response's data may predate a write whose invalidation
 * already ran (an older in-process cache entry, or slow reads).
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Runs fn inside a request's data-age record, as config/express.js does.
const inRequest = fn => new Promise((resolve, reject) => {
  trackDataAge({}, {}, () => Promise.resolve().then(fn).then(resolve, reject));
});

describe('## Edge lifetime of public responses', () => {
  let previous;
  let active = true;

  before(() => {
    previous = useSchedulerForTests({ active: () => active });
  });

  after(() => {
    useSchedulerForTests(previous);
  });

  it('FRESH_MS leaves room within SETTLE_MS for eventual consistency', () => {
    expect(FRESH_MS).to.equal(SETTLE_MS / 2);
    expect(EDGE_MAX_AGE).to.equal(604800);
  });

  it('7 days while edge copies are invalidated, the old lifetime otherwise', async () => {
    active = true;
    expect(edgeMaxAge(3600)).to.equal(EDGE_MAX_AGE);
    expect(await inRequest(() => edgeMaxAge(3600))).to.equal(EDGE_MAX_AGE);
    active = false;
    try {
      expect(edgeMaxAge(3600)).to.equal(3600);
      expect(await inRequest(() => edgeMaxAge(43200))).to.equal(43200);
    } finally {
      active = true;
    }
  });

  it('publicCacheControl keeps the browser max-age and adds the edge lifetime', async () => {
    expect(await inRequest(() => publicCacheControl(86400, 604800))).to.equal('public, max-age=86400, s-maxage=604800');
    expect(await inRequest(() => publicCacheControl(0, 3600))).to.equal('public, max-age=0, s-maxage=604800');
    active = false;
    try {
      expect(await inRequest(() => publicCacheControl(300, 3600))).to.equal('public, max-age=300, s-maxage=3600');
    } finally {
      active = true;
    }
  });

  it('a request whose reads took longer than FRESH_MS gets a short edge lifetime', async () => {
    const maxAge = await inRequest(() => edgeMaxAge(3600, Date.now() + FRESH_MS + 1000));
    expect(maxAge).to.equal(SLOW_READ_EDGE_MAX_AGE);
    expect(await inRequest(() => edgeMaxAge(3600, Date.now() + FRESH_MS - 1000))).to.equal(EDGE_MAX_AGE);
  });

  it('a request that joined an older shared load is as old as the load', async () => {
    const maxAge = await inRequest(() => {
      noteSharedLoad(Date.now() - FRESH_MS - 1000);
      return edgeMaxAge(3600);
    });
    expect(maxAge).to.equal(SLOW_READ_EDGE_MAX_AGE);
  });

  describe('# responses from an in-process cache', () => {
    let clock;
    let cache;

    before(() => {
      clock = Date.now();
      cache = new BoundedCache({ maxEntries: 10, maxBytes: 10000, ttlMs: HOUR, now: () => clock, ...cacheDataAge });
    });

    it('an entry records when the request that stored it started', async () => {
      const startedAt = await inRequest(() => {
        const at = dataReadAt();
        cache.set('fresh', { v: 1 });
        return at;
      });
      expect(cache.entries.get('fresh').dataAt).to.equal(startedAt);
    });

    it('an entry read moments ago keeps the 7 days', async () => {
      cache.set('young', { v: 1 });
      cache.entries.get('young').dataAt = Date.now() - 1000;
      expect(await inRequest(() => {
        cache.get('young');
        return edgeMaxAge(3600);
      })).to.equal(EDGE_MAX_AGE);
    });

    it('an older entry gets the time it has left, rounded up', async () => {
      cache.set('old', { v: 1 });
      const entry = cache.entries.get('old');
      entry.dataAt = Date.now() - (10 * MINUTE);
      entry.expiresAt = Date.now() + (50 * MINUTE) - 300;
      const maxAge = await inRequest(() => {
        expect(cache.get('old')).to.deep.equal({ v: 1 });
        return edgeMaxAge(3600);
      });
      expect(maxAge).to.equal(50 * 60);
    });

    it('the shortest entry wins, and data derived from an older entry is as old as it', async () => {
      cache.set('a', { v: 1 });
      cache.set('b', { v: 2 });
      Object.assign(cache.entries.get('a'), { dataAt: Date.now() - (20 * MINUTE), expiresAt: Date.now() + (40 * MINUTE) });
      Object.assign(cache.entries.get('b'), { dataAt: Date.now() - (50 * MINUTE), expiresAt: Date.now() + (10 * MINUTE) });
      const result = await inRequest(() => {
        cache.get('a');
        cache.get('b');
        cache.set('derived', { v: 3 });
        return { maxAge: edgeMaxAge(3600), readAt: dataReadAt() };
      });
      expect(result.maxAge).to.equal(10 * 60);
      expect(cache.entries.get('derived').dataAt).to.equal(result.readAt);
      expect(result.readAt).to.be.below(Date.now() - (49 * MINUTE));
    });

    it('never exceeds the lifetime without invalidation', async () => {
      active = false;
      try {
        cache.set('c', { v: 1 });
        Object.assign(cache.entries.get('c'), { dataAt: Date.now() - MINUTE, expiresAt: Date.now() + (2 * HOUR) });
        expect(await inRequest(() => {
          cache.get('c');
          return edgeMaxAge(3600);
        })).to.equal(3600);
      } finally {
        active = true;
      }
    });

    // Inactive: no CLOUDFRONT_DISTRIBUTION_ID (the state right after a
    // deploy), or the last invalidation failed. The bounds exist only for the
    // longer lifetimes invalidation allows.
    it('without invalidation an old entry, a slow read and a shared load keep the previous lifetime, at most one day', async () => {
      active = false;
      try {
        cache.set('aged', { v: 1 });
        Object.assign(cache.entries.get('aged'), { dataAt: Date.now() - (40 * MINUTE), expiresAt: Date.now() + (20 * MINUTE) });
        const fromOldEntry = await inRequest(() => {
          cache.get('aged');
          return [86400, 43200, 604800, 3600].map(previous => publicCacheControl(3600, previous));
        });
        expect(fromOldEntry).to.deep.equal([86400, 43200, 86400, 3600].map(previous => `public, max-age=3600, s-maxage=${previous}`));
        expect(await inRequest(() => edgeMaxAge(3600, Date.now() + FRESH_MS + 1000))).to.equal(3600);
        expect(await inRequest(() => {
          noteSharedLoad(Date.now() - FRESH_MS - 1000);
          return edgeMaxAge(86400);
        })).to.equal(86400);
        // An entry about to expire, with invalidation, would get 0.
        Object.assign(cache.entries.get('aged'), { expiresAt: Date.now() + 100 });
        expect(await inRequest(() => {
          cache.get('aged');
          return edgeMaxAge(604800);
        })).to.equal(INACTIVE_MAX_AGE);
      } finally {
        active = true;
      }
    });

    it('requests keep separate records', async () => {
      cache.set('shared', { v: 1 });
      Object.assign(cache.entries.get('shared'), { dataAt: Date.now() - (30 * MINUTE), expiresAt: Date.now() + (30 * MINUTE) });
      const [withHit, without] = await Promise.all([
        inRequest(async () => {
          cache.get('shared');
          await new Promise(resolve => setTimeout(resolve, 10));
          return edgeMaxAge(3600);
        }),
        inRequest(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return edgeMaxAge(3600);
        })
      ]);
      expect(withHit).to.equal(30 * 60);
      expect(without).to.equal(EDGE_MAX_AGE);
    });

    it('outside a request a cache hit changes nothing', () => {
      cache.set('outside', { v: 1 });
      expect(cache.get('outside')).to.deep.equal({ v: 1 });
      expect(edgeMaxAge(3600)).to.equal(EDGE_MAX_AGE);
    });
  });
});
