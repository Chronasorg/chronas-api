import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

import { getDocClient } from './dynamo-client.js';

/**
 * Chainable Mongoose-style query builder for DynamoDB.
 *
 * Supported chain:
 *   Model.find(filter).sort(...).skip(n).limit(n).lean().exec()
 *
 * Execution strategy (simple, no planner): if the caller sets an index +
 * key conditions via .onIndex(), we run a Query; otherwise Scan with a
 * FilterExpression. Controllers that need richer behavior call the
 * model's explicit methods (e.g. `.list()`) which talk to the doc client
 * directly — this builder only covers shapes already used by the code.
 *
 * Filtered counts (`.find(filter).countDocuments()`) are NOT served via
 * DescribeTable.ItemCount — those are for unfiltered counts. Here we
 * always honor the filter with Scan+Select=COUNT. Two call sites in scope:
 *   - Flag.find(filter).countDocuments()        (~222 calls/week)
 *   - Discussion.countDocuments(searchObj)      (~563 calls/week)
 * Both target small tables so the scan cost is acceptable; do not try to
 * DescribeTable-optimize filtered counts.
 */
export default class DynamoQuery {
  constructor(Model, filter = {}) {
    this.Model = Model;
    this.filter = filter;
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._lean = false;
    this._index = null;
    this._keyCondition = null;
  }

  onIndex(indexName, keyCondition) {
    this._index = indexName;
    this._keyCondition = keyCondition;
    return this;
  }

  sort(spec) {
    this._sort = spec;
    return this;
  }

  skip(n) {
    this._skip = n;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    const items = await this._runQuery();
    const sorted = this._applySort(items);
    const page = this._applyPaging(sorted);

    if (this._lean) return page;
    return page.map(item => new this.Model(item));
  }

  then(onFulfilled, onRejected) {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.exec().catch(onRejected);
  }

  countDocuments() {
    const self = this;
    const promise = (async () => {
      const params = self._buildParams({ select: 'COUNT' });
      const Command = self._index ? QueryCommand : ScanCommand;
      let count = 0;
      let next;
      do {
        if (next) params.ExclusiveStartKey = next;
        const out = await getDocClient().send(new Command(params));
        count += out.Count || 0;
        next = out.LastEvaluatedKey;
      } while (next);
      return count;
    })();
    return {
      exec: () => promise,
      then: (ok, fail) => promise.then(ok, fail),
      catch: (fn) => promise.catch(fn)
    };
  }

  async _runQuery() {
    const params = this._buildParams({ select: 'ALL' });
    const Command = this._index ? QueryCommand : ScanCommand;
    const items = [];
    let next;
    do {
      if (next) params.ExclusiveStartKey = next;
      const out = await getDocClient().send(new Command(params));
      if (out.Items) items.push(...out.Items);
      next = out.LastEvaluatedKey;
      if (this._limit && items.length >= this._limit + this._skip) break;
    } while (next);
    return items;
  }

  _buildParams({ select }) {
    const table = this.Model.tableName;
    if (!table) throw new Error(`${this.Model.name} has no tableName`);

    const params = { TableName: table };
    if (this._index) {
      params.IndexName = this._index;
      // Caller must provide KeyConditionExpression + ExpressionAttributeValues via onIndex().
      Object.assign(params, this._keyCondition);
    }

    const filterSpec = buildFilterExpression(this.filter, params.ExpressionAttributeValues || {}, params.ExpressionAttributeNames || {});
    if (filterSpec.expression) {
      params.FilterExpression = filterSpec.expression;
      params.ExpressionAttributeValues = filterSpec.values;
      if (Object.keys(filterSpec.names).length) params.ExpressionAttributeNames = filterSpec.names;
    }
    if (select === 'COUNT') params.Select = 'COUNT';
    return params;
  }

  _applySort(items) {
    if (!this._sort) return items;
    const entries = Array.isArray(this._sort)
      ? this._sort
      : Object.entries(this._sort);
    return [...items].sort((a, b) => {
      for (const [key, dir] of entries) {
        const av = a[key];
        const bv = b[key];
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return dir === -1 || dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  _applyPaging(items) {
    const start = this._skip || 0;
    const end = this._limit !== null && this._limit !== undefined ? start + this._limit : undefined;
    return items.slice(start, end);
  }
}

/**
 * Convert a Mongoose-flavored filter object into a DynamoDB FilterExpression.
 * Supports the small subset used by in-scope controllers: equality, $in,
 * $regex (translated to contains), $gte/$lte/$gt/$lt on numbers, and $or at
 * the top level. Anything unsupported throws — fail loud, don't silently
 * return wrong results.
 */
function buildFilterExpression(filter, valuesIn = {}, namesIn = {}) {
  const ctx = {
    values: { ...valuesIn },
    names: { ...namesIn },
    counter: 0
  };
  const expression = buildExpressionInner(filter || {}, ctx);
  return { expression, values: ctx.values, names: ctx.names };
}

function buildExpressionInner(filter, ctx) {
  const parts = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or') {
      if (!Array.isArray(value)) throw new Error('$or must be an array');
      const orParts = value
        .map(sub => buildExpressionInner(sub, ctx))
        .filter(Boolean)
        .map(exp => `(${exp})`);
      if (orParts.length) parts.push(`(${orParts.join(' OR ')})`);
      continue;
    }
    if (key.startsWith('$')) {
      throw new Error(`DynamoQuery: unsupported top-level operator ${key}`);
    }
    parts.push(...handleCondition(key, value, ctx));
  }
  return parts.join(' AND ');
}

function handleCondition(field, condition, ctx) {
  const name = registerName(field, ctx);
  if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
    const v = registerValue(condition, ctx);
    return [`${name} = ${v}`];
  }
  const parts = [];
  for (const [op, rhs] of Object.entries(condition)) {
    switch (op) {
    case '$eq': parts.push(`${name} = ${registerValue(rhs, ctx)}`); break;
    case '$ne': parts.push(`${name} <> ${registerValue(rhs, ctx)}`); break;
    case '$gt': parts.push(`${name} > ${registerValue(rhs, ctx)}`); break;
    case '$gte': parts.push(`${name} >= ${registerValue(rhs, ctx)}`); break;
    case '$lt': parts.push(`${name} < ${registerValue(rhs, ctx)}`); break;
    case '$lte': parts.push(`${name} <= ${registerValue(rhs, ctx)}`); break;
    case '$in': {
      const keys = rhs.map(val => registerValue(val, ctx));
      parts.push(`${name} IN (${keys.join(', ')})`);
      break;
    }
    case '$regex':
      // Mongoose $regex → DynamoDB contains() (best-effort; anchored regexes
      // with ^$ aren't supported here — call sites in scope don't use them).
      parts.push(`contains(${name}, ${registerValue(rhs, ctx)})`);
      break;
    default:
      throw new Error(`DynamoQuery: unsupported operator ${op} on field ${field}`);
    }
  }
  return parts;
}

function registerValue(value, ctx) {
  const key = `:v${ctx.counter++}`;
  ctx.values[key] = value;
  return key;
}

function registerName(field, ctx) {
  const safe = `#${field.replace(/[^a-zA-Z0-9]/g, '_')}`;
  ctx.names[safe] = field;
  return safe;
}

export { buildFilterExpression };
