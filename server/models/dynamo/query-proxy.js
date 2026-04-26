/**
 * Wraps a Promise so that Mongoose-style chaining works:
 *   Model.findById(id).lean().exec().then(...)
 *   Model.findOne({email}).select('+password').exec()
 *
 * Every chain method is a no-op passthrough (DynamoDB doesn't strip
 * fields or need lean/populate), but the chain must not break.
 */
export default class QueryProxy {
  constructor(promise) {
    this._promise = promise;
  }

  exec() { return this._promise; }
  lean() { return this; }
  select() { return this; }
  populate() { return this; }
  sort() { return this; }
  skip() { return this; }
  limit() { return this; }

  then(ok, fail) { return this._promise.then(ok, fail); }
  catch(fn) { return this._promise.catch(fn); }
}
