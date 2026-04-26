import { GetCommand, PutCommand, QueryCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';
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

  static async findById(id) {
    const { Item } = await getDocClient().send(new GetCommand({
      TableName: TABLE,
      Key: { _id: String(id) }
    }));
    if (!Item) return null;
    return new MetadataDynamo(decodeFromRead(Item));
  }

  static async findOne(filter = {}) {
    if (filter._id !== undefined) return MetadataDynamo.findById(filter._id);
    const results = await new DynamoQuery(MetadataDynamo, filter).limit(1).exec();
    return results[0] || null;
  }

  static async get(id, method = '') {
    const doc = await MetadataDynamo.findById(id);
    if (doc) return doc;
    throw new APIError('No such metadata exists!', httpStatus.NOT_FOUND);
  }

  static async countDocuments(filter = {}) {
    if (Object.keys(filter).length === 0) {
      return MetadataDynamo.estimatedDocumentCount();
    }
    return new DynamoQuery(MetadataDynamo, filter).countDocuments();
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  static async list(options = {}) {
    const {
      start = 0, end = 50, sort, order, filter, locale = '',
      fList = false, type = false, subtype = '', year = false,
      mustGeo = false, delta = false, wiki = false, search = false,
      discover = false
    } = options;

    if (fList) return fListBranch(fList, type, subtype, locale);
    if (type || subtype || year || wiki || search || discover) {
      return queryBranch(options);
    }
    return defaultBranch(start, end);
  }

  static async aggregate(pipeline) {
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
  }

  async save(options = {}) {
    const item = prepareForWrite(this.toObject());
    await getDocClient().send(new PutCommand({ TableName: TABLE, Item: item }));
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
  const client = getDocClient();
  const all = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { Responses } = await client.send(new BatchGetCommand({
      RequestItems: { [TABLE]: { Keys: chunk.map(_id => ({ _id: String(_id) })) } }
    }));
    if (Responses?.[TABLE]) all.push(...Responses[TABLE]);
  }
  return all;
}

async function fListBranch(fList, type, subtype, locale) {
  const cachedInit = cache.get(`init${locale || ''}`);
  if (cachedInit) return cachedInit;

  const resourceArray = fList.split(',');
  let ids = resourceArray;
  if (locale) ids = resourceArray.map(id => `${id}_${locale}`);

  const items = await batchGetByIds(ids);
  let countLength = 0;
  if (locale) countLength = locale.length + 1;
  const result = {};
  for (const item of items) {
    const decoded = decodeFromRead(item);
    const key = decoded._id.substr(0, decoded._id.length - countLength);
    result[key] = decoded.data;
  }
  cache.put(`init${locale || ''}`, result, CACHETTL);
  return result;
}

async function queryBranch(options) {
  const {
    start = 0, end = 50, type, subtype = '', year, delta = 10,
    wiki, search, mustGeo, discover
  } = options;

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
    return items.map(item => item._id);
  }

  return items;
}

async function defaultBranch(start, end) {
  const items = await new DynamoQuery(MetadataDynamo, {})
    .skip(+start)
    .limit(+end)
    .sort({ score: -1 })
    .lean()
    .exec();

  return items.map(obj => {
    const decoded = decodeFromRead(obj);
    const dataString = JSON.stringify(decoded.data).substring(0, 200);
    decoded.data = dataString + ((dataString.length === 200) ? '...' : '');
    return decoded;
  });
}
