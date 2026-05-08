import { expect } from 'chai';

import { BatchGetProxy } from '../../models/dynamo/batch-get-proxy.js';

describe('BatchGetProxy (shared)', () => {
  const fakeFetch = async (ids) => ids.map(id => ({ _id: id, name: `name-${id}` }));
  const passthrough = (item) => item;
  const hydrate = (item, lean) => (lean ? item : { ...item, hydrated: true });

  it('exec returns hydrated items', async () => {
    const proxy = new BatchGetProxy({ ids: ['a', 'b'], fetch: fakeFetch, hydrate });
    const items = await proxy.exec();
    expect(items).to.have.length(2);
    expect(items[0]).to.have.property('hydrated', true);
  });

  it('lean() returns raw items', async () => {
    const proxy = new BatchGetProxy({ ids: ['a', 'b'], fetch: fakeFetch, hydrate });
    const items = await proxy.lean().exec();
    expect(items[0]).to.not.have.property('hydrated');
    expect(items[0]._id).to.equal('a');
  });

  it('thenable: await proxy directly works', async () => {
    const proxy = new BatchGetProxy({ ids: ['x'], fetch: fakeFetch, hydrate: passthrough });
    const items = await proxy;
    expect(items).to.have.length(1);
  });

  it('countDocuments().exec() returns the fetched length', async () => {
    const proxy = new BatchGetProxy({ ids: ['a', 'b', 'c'], fetch: fakeFetch, hydrate: passthrough });
    const count = await proxy.countDocuments().exec();
    expect(count).to.equal(3);
  });

  it('empty ids resolves to empty array', async () => {
    const proxy = new BatchGetProxy({ ids: [], fetch: async () => [], hydrate: passthrough });
    const items = await proxy.exec();
    expect(items).to.deep.equal([]);
  });

  describe('rejected chain methods', () => {
    const proxy = () => new BatchGetProxy({ ids: ['a'], fetch: fakeFetch, hydrate: passthrough });

    it('.sort() throws (would silently no-op before)', () => {
      expect(() => proxy().sort({ name: 1 })).to.throw(/sort/);
    });

    it('.skip() throws', () => {
      expect(() => proxy().skip(5)).to.throw(/skip/);
    });

    it('.limit() throws', () => {
      expect(() => proxy().limit(10)).to.throw(/limit/);
    });
  });

  describe('constructor validation', () => {
    it('throws when ids is not an array', () => {
      expect(() => new BatchGetProxy({ ids: 'a', fetch: fakeFetch, hydrate: passthrough })).to.throw(/array/);
    });

    it('throws when fetch is missing', () => {
      expect(() => new BatchGetProxy({ ids: [], hydrate: passthrough })).to.throw(/fetch/);
    });

    it('throws when hydrate is missing', () => {
      expect(() => new BatchGetProxy({ ids: [], fetch: fakeFetch })).to.throw(/hydrate/);
    });
  });
});
