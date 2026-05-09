import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import QueryProxy from './query-proxy.js';
import { BatchGetProxy } from './batch-get-proxy.js';
import { getDocClient, getDynamoClient, tableName, batchGetWithRetry } from './dynamo-client.js';
import { prepareForWrite, decodeFromRead } from './compression.js';
import { cache } from '../../../config/config.js';

const TABLE = tableName('metadata');
const CACHETTL = 1000 * 60 * 60 * 24 * 7; // 1 week

export default class MetadataDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    if (filter._id && filter._id.$in) {
      return new BatchGetProxy({
        ids: filter._id.$in,
        fetch: batchGetByIds,
        hydrate: (item, lean) => (lean ? decodeFromRead(item) : new MetadataDynamo(decodeFromRead(item)))
      });
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

  const subtypes = subtype
    ? subtype.split(',').filter(s => s && s !== 'es')
    : [];
  const yearLo = year ? year - delta : null;
  const yearHi = year ? year + delta : null;

  // GSI selection is conservative: items missing a GSI key attribute do not
  // appear in that GSI (e.g. an item without `subtype` is invisible to
  // GSI-TypeSubtype and GSI-SubtypeYear). To preserve correctness we only
  // route through a GSI when the request constrains the index's hash key —
  // i.e., subtype is provided. The hot-path bug from #154 was the
  // type+subtype+year query (~99% of the RCU spike); type-only queries fall
  // back to Scan so we never miss items lacking subtype.
  let rawItems;
  if (subtypes.length > 0 && year) {
    rawItems = await querySubtypeYearGSI(subtypes, yearLo, yearHi, { type, wiki });
  } else if (type && subtypes.length > 0) {
    rawItems = await queryTypeSubtypeGSI(type, subtypes, { yearLo: null, yearHi: null, wiki });
  } else {
    rawItems = await scanWithFilter({ year, yearLo, yearHi, wiki, type, subtypes });
  }

  let items = rawItems.map(i => decodeFromRead(i));

  if (search) {
    const lc = String(search).toLowerCase();
    items = items.filter(i =>
      (i._id && String(i._id).toLowerCase().includes(lc)) ||
      (i.name && String(i.name).toLowerCase().includes(lc))
    );
  }

  if (mustGeo) {
    items = items.filter(i => i.coo && Array.isArray(i.coo) && i.coo.length === 2);
  }

  items.sort((a, b) => {
    const av = a.score; const bv = b.score;
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return av < bv ? 1 : -1;
  });

  const paged = items.slice(+start, (+start) + (+end));

  if (search) {
    const result = paged.map(item => item._id);
    cache.put(cacheKey, result, CACHETTL);
    return result;
  }

  cache.put(cacheKey, paged, CACHETTL);
  return paged;
}

async function querySubtypeYearGSI(subtypes, yearLo, yearHi, extra) {
  const filterParts = [];
  const filterValues = {};
  const filterNames = {};
  if (extra.type) {
    filterValues[':__type'] = extra.type;
    filterNames['#__type'] = 'type';
    filterParts.push('#__type = :__type');
  }
  if (extra.wiki) {
    filterValues[':__wiki'] = extra.wiki;
    filterNames['#__wiki'] = 'wiki';
    filterParts.push('#__wiki = :__wiki');
  }

  const queries = subtypes.map(st => paginatedQuery({
    TableName: TABLE,
    IndexName: 'GSI-SubtypeYear',
    KeyConditionExpression: '#__subtype = :__subtype AND #__year BETWEEN :__yearLo AND :__yearHi',
    ExpressionAttributeNames: {
      '#__subtype': 'subtype',
      '#__year': 'year',
      ...filterNames
    },
    ExpressionAttributeValues: {
      ':__subtype': st,
      ':__yearLo': yearLo,
      ':__yearHi': yearHi,
      ...filterValues
    },
    ...(filterParts.length ? { FilterExpression: filterParts.join(' AND ') } : {})
  }));

  const results = await Promise.all(queries);
  return dedupeById(results.flat());
}

async function queryTypeSubtypeGSI(type, subtypes, extra) {
  const queries = subtypes.map(st => paginatedQuery(buildTypeSubtypeParams(type, st, extra)));
  const results = await Promise.all(queries);
  return dedupeById(results.flat());
}

function buildTypeSubtypeParams(type, subtype, extra) {
  const filterParts = [];
  const filterValues = {};
  const filterNames = {};
  if (extra.yearLo !== null && extra.yearHi !== null) {
    filterValues[':__yearLo'] = extra.yearLo;
    filterValues[':__yearHi'] = extra.yearHi;
    filterNames['#__year'] = 'year';
    filterParts.push('#__year BETWEEN :__yearLo AND :__yearHi');
  }
  if (extra.wiki) {
    filterValues[':__wiki'] = extra.wiki;
    filterNames['#__wiki'] = 'wiki';
    filterParts.push('#__wiki = :__wiki');
  }

  const params = {
    TableName: TABLE,
    IndexName: 'GSI-TypeSubtype',
    KeyConditionExpression: '#__type = :__type AND #__subtype = :__subtype',
    ExpressionAttributeNames: { '#__type': 'type', '#__subtype': 'subtype', ...filterNames },
    ExpressionAttributeValues: { ':__type': type, ':__subtype': subtype, ...filterValues }
  };
  if (filterParts.length) params.FilterExpression = filterParts.join(' AND ');
  return params;
}

async function scanWithFilter({ year, yearLo, yearHi, wiki, type, subtypes = [] }) {
  const filterParts = [];
  const values = {};
  const names = {};
  if (year) {
    values[':__yearLo'] = yearLo;
    values[':__yearHi'] = yearHi;
    names['#__year'] = 'year';
    filterParts.push('#__year BETWEEN :__yearLo AND :__yearHi');
  }
  if (wiki) {
    values[':__wiki'] = wiki;
    names['#__wiki'] = 'wiki';
    filterParts.push('#__wiki = :__wiki');
  }
  if (type) {
    values[':__type'] = type;
    names['#__type'] = 'type';
    filterParts.push('#__type = :__type');
  }
  if (subtypes.length === 1) {
    values[':__subtype'] = subtypes[0];
    names['#__subtype'] = 'subtype';
    filterParts.push('#__subtype = :__subtype');
  } else if (subtypes.length > 1) {
    names['#__subtype'] = 'subtype';
    const placeholders = subtypes.map((s, i) => {
      const k = `:__subtype${i}`;
      values[k] = s;
      return k;
    });
    filterParts.push(`#__subtype IN (${placeholders.join(', ')})`);
  }
  const params = { TableName: TABLE };
  if (filterParts.length) {
    params.FilterExpression = filterParts.join(' AND ');
    params.ExpressionAttributeValues = values;
    params.ExpressionAttributeNames = names;
  }
  const items = [];
  let next;
  do {
    if (next) params.ExclusiveStartKey = next;
    const out = await getDocClient().send(new ScanCommand(params));
    if (out.Items) items.push(...out.Items);
    next = out.LastEvaluatedKey;
  } while (next);
  return items;
}

async function paginatedQuery(baseParams) {
  const items = [];
  let next;
  do {
    const params = next ? { ...baseParams, ExclusiveStartKey: next } : baseParams;
    const out = await getDocClient().send(new QueryCommand(params));
    if (out.Items) items.push(...out.Items);
    next = out.LastEvaluatedKey;
  } while (next);
  return items;
}

function dedupeById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const id = item?._id;
    if (id === undefined) { out.push(item); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
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
