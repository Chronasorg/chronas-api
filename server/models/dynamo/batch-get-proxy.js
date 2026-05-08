/**
 * Mongoose-style proxy for $in lookups on a primary-key-indexed table.
 *
 * Used by Model.find({_id: {$in: ids}}) call sites. Routes through
 * BatchGetItem (Keys-based) which sidesteps the DynamoDB
 * FilterExpression byte-size limit that bit getLinked in prod
 * (see PR #149).
 *
 * Sort / skip / limit / paging are intentionally NOT supported on this
 * shape — primary-key BatchGet has no notion of order, and historic
 * call sites in this repo only chain .lean() / .exec() / .then(). If
 * a future caller needs paging, run the query against a fixed-id list
 * yourself or switch to a GSI scan.
 */
export class BatchGetProxy {
  constructor({ ids, fetch, hydrate }) {
    if (!Array.isArray(ids)) throw new Error('BatchGetProxy: ids must be an array');
    if (typeof fetch !== 'function') throw new Error('BatchGetProxy: fetch must be a function');
    if (typeof hydrate !== 'function') throw new Error('BatchGetProxy: hydrate must be a function');
    this._ids = ids;
    this._fetch = fetch;
    this._hydrate = hydrate;
    this._lean = false;
  }

  lean() { this._lean = true; return this; }

  sort() { throw new Error('BatchGetProxy: .sort() is not supported on _id $in queries — call sort on the result array instead.'); }
  skip() { throw new Error('BatchGetProxy: .skip() is not supported on _id $in queries — slice the result array instead.'); }
  limit() { throw new Error('BatchGetProxy: .limit() is not supported on _id $in queries — slice the result array instead.'); }

  async exec() {
    const items = await this._fetch(this._ids);
    return items.map(item => this._hydrate(item, this._lean));
  }

  then(ok, fail) { return this.exec().then(ok, fail); }
  catch(fn) { return this.exec().catch(fn); }

  countDocuments() {
    const promise = (async () => (await this._fetch(this._ids)).length)();
    return {
      exec: () => promise,
      then: (ok, fail) => promise.then(ok, fail),
      catch: (fn) => promise.catch(fn)
    };
  }
}
