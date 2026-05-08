import { expect } from 'chai';

import { setupDynamoLocal, teardownDynamoLocal, clearTable } from '../helpers/dynamodb-local.js';

const TABLE = 'chronas-rate-limits';

let DynamoRateLimitStore;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  ({ DynamoRateLimitStore } = await import('../../middleware/dynamo-rate-store.js'));
});

after(async () => {
  await teardownDynamoLocal();
});

describe('DynamoRateLimitStore', () => {
  beforeEach(async () => {
    await clearTable(TABLE);
  });

  describe('increment()', () => {
    it('increments a fresh counter to 1', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      const result = await store.increment('1.2.3.4');
      expect(result.totalHits).to.equal(1);
      expect(result.resetTime).to.be.instanceOf(Date);
    });

    it('increments an existing counter to 2', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      await store.increment('1.2.3.4');
      const second = await store.increment('1.2.3.4');
      expect(second.totalHits).to.equal(2);
    });

    it('isolates counters by prefix', async () => {
      const auth = new DynamoRateLimitStore({ prefix: 'auth', windowMs: 60_000 });
      const contact = new DynamoRateLimitStore({ prefix: 'contact', windowMs: 60_000 });
      await auth.increment('1.2.3.4');
      await auth.increment('1.2.3.4');
      const contactResult = await contact.increment('1.2.3.4');
      expect(contactResult.totalHits).to.equal(1);
    });

    it('isolates counters by client key (per-IP)', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'auth', windowMs: 60_000 });
      await store.increment('1.2.3.4');
      await store.increment('1.2.3.4');
      const other = await store.increment('5.6.7.8');
      expect(other.totalHits).to.equal(1);
    });

    it('resetTime aligns to the next window boundary', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      const now = Date.now();
      const result = await store.increment('1.2.3.4');
      const ms = result.resetTime.getTime();
      // Window-aligned: ms should be a multiple of 60000 and within ~1 window of now
      expect(ms % 60_000).to.equal(0);
      expect(ms).to.be.greaterThan(now);
      expect(ms).to.be.at.most(now + 60_000);
    });

    it('items in different windows do not collide (no rollover race)', async () => {
      // Simulate two windows by using two stores with different windowMs perspectives.
      // Easier: build the item id manually for an old window and confirm a fresh
      // increment in the current window starts at 1.
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });

      // increment in current window
      await store.increment('1.2.3.4');
      await store.increment('1.2.3.4');

      // craft a counter for the next window manually
      const nextWindow = (Math.floor(Date.now() / 60_000) * 60_000) + 60_000;
      const { getDocClient } = await import('../../models/dynamo/dynamo-client.js');
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      await getDocClient().send(new UpdateCommand({
        TableName: TABLE,
        Key: { _id: `test:1.2.3.4:${nextWindow}` },
        UpdateExpression: 'ADD #c :one',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1 }
      }));

      // current-window counter must still report 2 (next-window item didn't pollute)
      const result = await store.increment('1.2.3.4');
      expect(result.totalHits).to.equal(3);
    });

    it('fails OPEN when DynamoDB is unavailable', async () => {
      // Point to a non-existent table by using a custom store class instance.
      // We simulate by stubbing the doc client.
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      const { getDocClient } = await import('../../models/dynamo/dynamo-client.js');
      const realClient = getDocClient();
      const originalSend = realClient.send.bind(realClient);
      realClient.send = () => Promise.reject(new Error('simulated DDB outage'));

      try {
        const result = await store.increment('1.2.3.4');
        expect(result.totalHits).to.equal(1);
        expect(result.resetTime).to.be.instanceOf(Date);
      } finally {
        realClient.send = originalSend;
      }
    });
  });

  describe('resetKey()', () => {
    it('removes the current-window counter for a single key', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      await store.increment('1.2.3.4');
      await store.increment('1.2.3.4');
      await store.resetKey('1.2.3.4');
      const result = await store.increment('1.2.3.4');
      expect(result.totalHits).to.equal(1);
    });
  });

  describe('decrement()', () => {
    it('decrements an existing counter', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      await store.increment('1.2.3.4');
      await store.increment('1.2.3.4');
      await store.decrement('1.2.3.4');
      const result = await store.increment('1.2.3.4');
      expect(result.totalHits).to.equal(2);
    });

    it('does not throw when decrementing past zero', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      // No prior increment — counter doesn't exist
      await store.decrement('1.2.3.4');
      const result = await store.increment('1.2.3.4');
      expect(result.totalHits).to.equal(1);
    });
  });

  describe('get()', () => {
    it('returns undefined for an unknown key', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      const result = await store.get('never-seen');
      expect(result).to.be.undefined;
    });

    it('returns current totalHits and resetTime', async () => {
      const store = new DynamoRateLimitStore({ prefix: 'test', windowMs: 60_000 });
      await store.increment('1.2.3.4');
      await store.increment('1.2.3.4');
      const result = await store.get('1.2.3.4');
      expect(result.totalHits).to.equal(2);
      expect(result.resetTime).to.be.instanceOf(Date);
    });
  });

  describe('constructor validation', () => {
    it('throws when prefix is missing', () => {
      expect(() => new DynamoRateLimitStore({ windowMs: 1000 })).to.throw(/prefix/);
    });

    it('throws when windowMs is missing', () => {
      expect(() => new DynamoRateLimitStore({ prefix: 'x' })).to.throw(/windowMs/);
    });
  });
});
