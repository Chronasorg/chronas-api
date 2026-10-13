import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';

import BoundedCache from '../../helpers/bounded-cache.js';
import AreaDynamo from '../../models/dynamo/area.dynamo.js';
import MetadataDynamo, { metadataCache } from '../../models/dynamo/metadata.dynamo.js';
import { cache } from '../../../config/config.js';

/**
 * In-process caches must stay bounded however many distinct URLs a client
 * requests: one client sweeping all ~3,942 area years used to fill the
 * 512 MB function until it timed out. These tests use a fake DynamoDB client,
 * so they don't touch the shared dynalite tables.
 */

function fakeDocClient(handle) {
  const calls = {};
  return {
    calls,
    send: async (command) => {
      const { name } = command.constructor;
      calls[name] = (calls[name] || 0) + 1;
      return handle(name, command.input);
    }
  };
}

describe('## Bounded in-process caches', () => {
  let savedClient;

  beforeEach(() => {
    savedClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
    metadataCache.clear();
  });

  afterEach(() => {
    globalThis.__TEST_DYNAMO_DOC_CLIENT = savedClient;
    metadataCache.clear();
  });

  describe('# BoundedCache', () => {
    it('evicts the least recently used entry beyond maxEntries', () => {
      const c = new BoundedCache({ maxEntries: 2, maxBytes: 1000, ttlMs: 1000 });
      c.set('a', 1);
      c.set('b', 2);
      c.get('a');
      c.set('c', 3);
      expect(c.get('a')).to.equal(1);
      expect(c.get('b')).to.equal(undefined);
      expect(c.get('c')).to.equal(3);
    });

    it('evicts until the total size fits maxBytes', () => {
      const c = new BoundedCache({ maxEntries: 100, maxBytes: 25, ttlMs: 1000 });
      c.set('a', 'x'.repeat(10)); // 12 bytes as JSON
      c.set('b', 'y'.repeat(10));
      c.set('c', 'z'.repeat(10));
      expect(c.size).to.equal(2);
      expect(c.bytes).to.be.at.most(25);
      expect(c.get('a')).to.equal(undefined);
    });

    it('does not store a value larger than maxEntryBytes', () => {
      const c = new BoundedCache({ maxEntries: 10, maxBytes: 1000, maxEntryBytes: 10, ttlMs: 1000 });
      expect(c.set('big', 'x'.repeat(20))).to.equal(false);
      expect(c.size).to.equal(0);
      expect(c.bytes).to.equal(0);
    });

    it('expires entries after ttlMs', () => {
      let now = 0;
      const c = new BoundedCache({ maxEntries: 10, maxBytes: 1000, ttlMs: 100, now: () => now });
      c.set('a', 1);
      now = 99;
      expect(c.get('a')).to.equal(1);
      now = 100;
      expect(c.get('a')).to.equal(undefined);
      expect(c.size).to.equal(0);
    });

    it('replacing a key keeps the byte count exact', () => {
      const c = new BoundedCache({ maxEntries: 10, maxBytes: 1000, ttlMs: 1000 });
      c.set('a', 'x'.repeat(10));
      c.set('a', 'x'.repeat(5));
      expect(c.bytes).to.equal(7);
      c.deleteWhere(key => key === 'a');
      expect(c.bytes).to.equal(0);
    });
  });

  describe('# areas', () => {
    it('5,000 distinct area reads add no cache entries and each one reads DynamoDB', async () => {
      const fake = fakeDocClient((name, input) => ({
        Item: { _id: input.Key._id, year: +input.Key._id, data: { P: ['RUL', 'cul', 'rel', 'Cap', 1] } }
      }));
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fake;
      const before = cache.size();

      for (let year = -2000; year < 3000; year += 1) await AreaDynamo.get(String(year));
      await AreaDynamo.get('1000');

      expect(fake.calls.GetCommand).to.equal(5001);
      expect(cache.size()).to.equal(before);
      expect(metadataCache.size).to.equal(0);
    });
  });

  describe('# metadata lists', () => {
    const item = i => ({ _id: `e_${i}`, type: 'e', subtype: 'ew', year: 1000, score: i, data: { title: 'x'.repeat(2000) } });

    it('a high-cardinality sweep stays within the entry and byte bounds', async function () {
      this.timeout(30000);
      const items = Array.from({ length: 30 }, (_, i) => item(i));
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fakeDocClient(() => ({ Items: items }));

      for (let year = 0; year < 2000; year += 1) {
        await MetadataDynamo.list({ type: 'e', subtype: 'ew', year, delta: 10, end: 50 });
      }

      expect(metadataCache.size).to.be.at.most(metadataCache.maxEntries);
      expect(metadataCache.bytes).to.be.at.most(metadataCache.maxBytes);
    });

    it('caches f lists of init dictionaries, but not arbitrary ids', async () => {
      const fake = fakeDocClient((name, input) => ({
        Responses: { [Object.keys(input.RequestItems)[0]]: input.RequestItems[Object.keys(input.RequestItems)[0]].Keys.map(k => ({ _id: k._id, type: 'g', data: {} })) }
      }));
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fake;

      await MetadataDynamo.list({ fList: 'ruler,culture_de' });
      await MetadataDynamo.list({ fList: 'ruler,culture_de' });
      expect(fake.calls.BatchGetCommand).to.equal(1);

      for (let i = 0; i < 100; i += 1) await MetadataDynamo.list({ fList: `ruler,e_Random_${i}` });
      expect(fake.calls.BatchGetCommand).to.equal(101);
      expect(metadataCache.size).to.equal(1);
    });

    it('a delete clears cached lists', async () => {
      globalThis.__TEST_DYNAMO_DOC_CLIENT = fakeDocClient(() => ({ Items: [item(1)] }));
      await MetadataDynamo.list({ type: 'e', subtype: 'ew', year: 1000, end: 50 });
      expect(metadataCache.size).to.equal(1);

      await new MetadataDynamo({ _id: 'e_1' }).deleteOne();
      expect(metadataCache.size).to.equal(0);
    });
  });
});
