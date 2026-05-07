import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import QueryProxy from './query-proxy.js';
import { getDocClient, getDynamoClient, tableName, batchGetWithRetry } from './dynamo-client.js';
import { prepareForWrite, decodeFromRead } from './compression.js';
import { cache } from '../../../config/config.js';

const TABLE = tableName('metadata');
const CACHETTL = 1000 * 60 * 60 * 24 * 7; // 1 week

export default class MetadataDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    if (filter._id && filter._id.$in) {
      return new BatchGetProxy(filter._id.$in);
    }
    return new DynamoQuery(MetadataDynamo, filter);
  }

  static findById(id) {
    const promise = (async () => {
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { _id: String(id) }
      }));
      if (!Item) return null;
      return new MetadataDynamo(decodeFromRead(Item));
    })();
    return new QueryProxy(promise);
  }

  static findOne(filter = {}) {
    if (filter._id !== undefined) return MetadataDynamo.findById(filter._id);
    const promise = (async () => {
      const results = await new DynamoQuery(MetadataDynamo, filter).limit(1).exec();
      return results[0] || null;
    })();
    return new QueryProxy(promise);
  }

  static async get(id, _method = '') {
    const doc = await MetadataDynamo.findById(id).exec();
    if (doc) return doc;
    throw new APIError('No such metadata exists!', httpStatus.NOT_FOUND);
  }

  static countDocuments(filter = {}) {
    if (Object.keys(filter).length === 0) {
      const promise = MetadataDynamo.estimatedDocumentCount();
      return { exec: () => promise, then: (ok, fail) => promise.then(ok, fail), catch: fn => promise.catch(fn) };
    }
    const wrapper = new DynamoQuery(MetadataDynamo, filter).countDocuments();
    return wrapper;
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  static async list(options = {}) {
    const {
      start = 0, end = 50, locale = '',
      fList = false, type = false, subtype = '', year = false,
      wiki = false, search = false,
      discover = false
    } = options;

    if (fList) return fListBranch(fList, type, subtype, locale);
    if (type || subtype || year || wiki || search || discover) {
      return queryBranch(options);
    }
    return defaultBranch(start, end);
  }

  static aggregate(pipeline) {
    const promise = (async () => {
      if (!Array.isArray(pipeline) || !pipeline[0]?.$group) {
        throw new Error('MetadataDynamo.aggregate: only [{$group}] is supported (for statistics)');
      }
      const groupField = pipeline[0].$group._id;
      const field = typeof groupField === 'string' ? groupField.replace('$', '') : null;

      const items = [];
      let next;
      do {
        const params = { TableName: TABLE };
        if (next) params.ExclusiveStartKey = next;
        const out = await getDocClient().send(new ScanCommand(params));
        if (out.Items) items.push(...out.Items);
        next = out.LastEvaluatedKey;
      } while (next);

      const counts = {};
      for (const item of items) {
        const key = field ? (item[field] ?? null) : null;
        counts[key] = (counts[key] || 0) + 1;
      }
      return Object.entries(counts).map(([k, v]) => ({ _id: k === 'null' ? null : k, count: v }));
    })();
    return { exec: () => promise, then: (ok, fail) => promise.then(ok, fail), catch: fn => promise.catch(fn) };
  }

  async save(_options = {}) {
    const item = prepareForWrite(this.toObject());
    await getDocClient().send(new PutCommand({ TableName: TABLE, Item: item }));
    for (const key of cache.keys()) {
      if (key.startsWith('query:') || key.startsWith('default:') || key.startsWith('init:')) {
        cache.del(key);
      }
    }
    return this;
  }
}

class BatchGetProxy {
  constructor(ids) { this._ids = ids; this._lean = false; }
  lean() { this._lean = true; return this; }
  sort() { return this; }
  skip() { return this; }
  limit() { return this; }
  async exec() {
    const items = await batchGetByIds(this._ids);
    if (this._lean) return items.map(i => decodeFromRead(i));
    return items.map(i => new MetadataDynamo(decodeFromRead(i)));
  }
  then(ok, fail) { return this.exec().then(ok, fail); }
  catch(fn) { return this.exec().catch(fn); }
}

async function batchGetByIds(ids) {
  const all = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { Responses } = await batchGetWithRetry({
      RequestItems: { [TABLE]: { Keys: chunk.map(_id => ({ _id: String(_id) })) } }
    });
    if (Responses?.[TABLE]) all.push(...Responses[TABLE]);
  }
  return all;
}

async function fListBranch(fList, type, subtype, locale) {
  const localeStr = typeof locale === 'string' ? locale : '';
  const cacheKey = `init:${fList}:${localeStr}`;
  const cachedInit = cache.get(cacheKey);
  if (cachedInit) return cachedInit;

  const resourceArray = String(fList).split(',');
  const items = await batchGetByIds(resourceArray);
  const countLength = localeStr ? localeStr.length + 1 : 0;
  const result = {};
  for (const item of items) {
    const decoded = decodeFromRead(item);
    const id = String(decoded._id);
    const key = countLength ? id.substr(0, id.length - countLength) : id;
    result[key] = decoded.data;
  }
  cache.put(cacheKey, result, CACHETTL);
  return result;
}

async function queryBranch(options) {
  const {
    start = 0, end = 50, type, subtype = '', year, delta = 10,
    wiki, search, mustGeo, discover
  } = options;

  const cacheKey = `query:${type}:${subtype}:${year}:${delta}:${start}:${end}:${wiki || ''}:${search || ''}:${mustGeo || ''}:${discover || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const filter = {};
  if (type) filter.type = type;
  if (wiki) filter.wiki = wiki;

  if (year) {
    filter.year = { $gt: year - delta, $lt: year + delta };
  }

  if (subtype) {
    const subtypes = subtype.split(',').filter(s => s !== 'es');
    if (subtypes.length === 1) filter.subtype = subtypes[0];
    else if (subtypes.length > 1) filter.subtype = { $in: subtypes };
  }

  if (search) {
    filter.$or = [
      { _id: { $regex: search } },
      { name: { $regex: search } }
    ];
  }

  if (mustGeo) {
    // coo exists check — DynamoDB doesn't have $exists, so we filter client-side
  }

  let items = await new DynamoQuery(MetadataDynamo, filter)
    .skip(+start)
    .limit(+end)
    .sort({ score: -1 })
    .lean()
    .exec();

  items = items.map(i => decodeFromRead(i));

  if (mustGeo) {
    items = items.filter(i => i.coo && Array.isArray(i.coo) && i.coo.length === 2);
  }

  if (search) {
    const result = items.map(item => item._id);
    cache.put(cacheKey, result, CACHETTL);
    return result;
  }

  cache.put(cacheKey, items, CACHETTL);
  return items;
}

async function defaultBranch(start, end) {
  const cacheKey = `default:${start}:${end}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const items = await new DynamoQuery(MetadataDynamo, {})
    .skip(+start)
    .limit(+end)
    .sort({ score: -1 })
    .lean()
    .exec();

  const result = items.map(obj => {
    const decoded = decodeFromRead(obj);
    const dataString = JSON.stringify(decoded.data).substring(0, 200);
    decoded.data = dataString + ((dataString.length === 200) ? '...' : '');
    return decoded;
  });
  cache.put(cacheKey, result, CACHETTL);
  return result;
}
