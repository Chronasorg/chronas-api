import { expect } from 'chai';

import DynamoDocument from '../../models/dynamo/dynamo-document.js';
import { buildFilterExpression } from '../../models/dynamo/dynamo-query.js';
import { prepareForWrite, decodeFromRead, shouldCompress } from '../../models/dynamo/compression.js';
import { NotImplementedError, notImplemented } from '../../models/dynamo/not-implemented.js';

describe('DynamoDocument (base class)', () => {
  it('is newable with props copied onto the instance', () => {
    class Foo extends DynamoDocument { static tableName = 'foo'; }
    const f = new Foo({ _id: '1', name: 'a' });
    expect(f._id).to.equal('1');
    expect(f.name).to.equal('a');
  });

  it('exposes Mongoose-shaped instance API', () => {
    class Foo extends DynamoDocument { static tableName = 'foo'; }
    const f = new Foo({ _id: '1' });
    expect(typeof f.save).to.equal('function');
    expect(typeof f.deleteOne).to.equal('function');
    expect(typeof f.markModified).to.equal('function');
    expect(typeof f.toObject).to.equal('function');
  });

  it('toObject returns own data fields only', () => {
    class Foo extends DynamoDocument { static tableName = 'foo'; }
    const f = new Foo({ _id: '1', a: 1, b: 'x' });
    expect(f.toObject()).to.deep.equal({ _id: '1', a: 1, b: 'x' });
  });
});

describe('buildFilterExpression', () => {
  it('handles equality', () => {
    const r = buildFilterExpression({ type: 'a' });
    expect(r.expression).to.equal('#type = :v0');
    expect(r.values).to.deep.equal({ ':v0': 'a' });
  });

  it('handles range comparisons', () => {
    const r = buildFilterExpression({ year: { $gte: 1000, $lte: 2000 } });
    expect(r.expression).to.equal('#year >= :v0 AND #year <= :v1');
    expect(r.values).to.deep.equal({ ':v0': 1000, ':v1': 2000 });
  });

  it('handles $in with unique placeholders', () => {
    const r = buildFilterExpression({ type: { $in: ['a', 'b', 'c'] } });
    expect(r.expression).to.equal('#type IN (:v0, :v1, :v2)');
    expect(r.values).to.deep.equal({ ':v0': 'a', ':v1': 'b', ':v2': 'c' });
  });

  it('handles $or without placeholder collision', () => {
    const r = buildFilterExpression({ $or: [{ name: 'x' }, { wiki: 'y' }] });
    expect(r.expression).to.equal('((#name = :v0) OR (#wiki = :v1))');
    expect(r.values).to.deep.equal({ ':v0': 'x', ':v1': 'y' });
  });

  it('handles combined top-level + $or without collision', () => {
    const r = buildFilterExpression({
      fixed: false,
      $or: [{ wrongWiki: 'a' }, { wrongWiki: 'b' }]
    });
    expect(r.expression).to.equal(
      '#fixed = :v0 AND ((#wrongWiki = :v1) OR (#wrongWiki = :v2))'
    );
  });

  it('rejects unsupported operators loudly', () => {
    expect(() => buildFilterExpression({ x: { $weird: 1 } })).to.throw(/unsupported operator/);
  });
});

describe('compression', () => {
  it('passes through small data unchanged', () => {
    const item = { _id: 'tiny', data: { foo: 'bar' } };
    const prepared = prepareForWrite(item);
    expect(prepared.dataCompressed).to.not.equal(true);
    expect(prepared.data).to.deep.equal({ foo: 'bar' });
  });

  it('compresses large data and roundtrips', () => {
    const big = { features: Array.from({ length: 3000 }, (_, i) => ({ id: i, name: 'x'.repeat(100) })) };
    expect(shouldCompress(big)).to.equal(true);

    const stored = prepareForWrite({ _id: 'provinces', data: big });
    expect(stored.dataCompressed).to.equal(true);
    expect(stored.data).to.be.instanceOf(Buffer);

    const decoded = decodeFromRead(stored);
    expect(decoded.dataCompressed).to.equal(undefined);
    expect(decoded.data.features).to.have.lengthOf(big.features.length);
  });
});

describe('not-implemented stubs', () => {
  it('throws a clear error when called', () => {
    const stub = notImplemented('Foo.bar', 'foo reason');
    expect(stub).to.throw(NotImplementedError, /Foo\.bar/);
  });
});
