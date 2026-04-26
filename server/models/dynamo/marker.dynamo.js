import { GetCommand, PutCommand, QueryCommand, BatchGetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import QueryProxy from './query-proxy.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';

const TABLE = tableName('markers');

export default class MarkerDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new DynamoQuery(MarkerDynamo, filter);
  }

  static findById(id) {
    const promise = (async () => {
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { _id: String(id) }
      }));
      return Item ? new MarkerDynamo(Item) : null;
    })();
    return new QueryProxy(promise);
  }

  static async get(id) {
    const doc = await MarkerDynamo.findById(id).exec();
    if (doc) return doc;
    throw new APIError('No such marker exists!', httpStatus.NOT_FOUND);
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  static count() {
    return { exec: () => MarkerDynamo.estimatedDocumentCount() };
  }

  static async list(options = {}) {
    const {
      start = 0, length = 2000, sort = 'name', order = 'asc',
      filter = '', year, end, delta = 10, includeMarkers = true,
      typeArray, wikiArray, search, format, migrationDelta
    } = options;

    if (!includeMarkers) return [];

    const actualDelta = migrationDelta || delta;
    let items;

    if (typeArray && Array.isArray(typeArray) && year !== false && year !== undefined) {
      items = await queryByTypeAndYear(typeArray, year, actualDelta, end);
    } else if (wikiArray && Array.isArray(wikiArray)) {
      items = await batchGetByWikis(wikiArray);
    } else {
      items = await scanAll();
    }

    if (wikiArray && !typeArray) {
      // already filtered
    } else if (wikiArray && Array.isArray(wikiArray)) {
      items = items.filter(m => wikiArray.includes(m.wiki));
    }

    if (search) {
      const lc = search.toLowerCase();
      items = items.filter(m =>
        (m.name && m.name.toLowerCase().includes(lc)) ||
        (m.wiki && m.wiki.toLowerCase().includes(lc)) ||
        (m._id && String(m._id).toLowerCase().includes(lc))
      );
    }

    if (filter) {
      const lc = filter.toLowerCase();
      items = items.filter(m => m.name && m.name.toLowerCase().includes(lc));
    }

    const dir = order === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      const av = a[sort]; const bv = b[sort];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -dir : dir;
    });

    const paged = items.slice(start, start + length);

    if (format === 'geojson') {
      return {
        type: 'FeatureCollection',
        features: paged.map(m => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: m.coo || [0, 0] },
          properties: {
            id: m._id, name: m.name, year: m.year, type: m.type,
            wiki: m.wiki, capital: m.capital, partOf: m.partOf, end: m.end
          }
        }))
      };
    }
    return paged;
  }

  static aggregate(pipeline) {
    const promise = (async () => {
      if (!Array.isArray(pipeline) || !pipeline[0]?.$group) {
        throw new Error('MarkerDynamo.aggregate: only [{$group}] supported');
      }
      const field = typeof pipeline[0].$group._id === 'string'
        ? pipeline[0].$group._id.replace('$', '') : null;
      const items = await scanAll();
      const counts = {};
      for (const item of items) {
        const key = field ? (item[field] ?? null) : null;
        counts[key] = (counts[key] || 0) + 1;
      }
      return Object.entries(counts).map(([k, v]) => ({
        _id: k === 'null' ? null : k, count: v
      }));
    })();
    return { exec: () => promise, then: (ok, fail) => promise.then(ok, fail), catch: fn => promise.catch(fn) };
  }

  async save() {
    const item = this.toObject();
    await getDocClient().send(new PutCommand({ TableName: TABLE, Item: item }));
    return this;
  }
}

async function queryByTypeAndYear(typeArray, year, delta, end) {
  const yearLo = year - delta;
  const yearHi = end !== false && end !== undefined ? end : year + delta;
  const client = getDocClient();

  const queries = typeArray.map(type => paginatedQuery(client, {
    TableName: TABLE,
    IndexName: 'GSI-TypeYear',
    KeyConditionExpression: '#t = :t AND #y BETWEEN :lo AND :hi',
    ExpressionAttributeNames: { '#t': 'type', '#y': 'year' },
    ExpressionAttributeValues: { ':t': type, ':lo': yearLo, ':hi': yearHi }
  }));

  const results = await Promise.all(queries);
  return results.flat();
}

async function paginatedQuery(client, baseParams) {
  const items = [];
  let next;
  do {
    const params = next ? { ...baseParams, ExclusiveStartKey: next } : baseParams;
    const out = await client.send(new QueryCommand(params));
    if (out.Items) items.push(...out.Items);
    next = out.LastEvaluatedKey;
  } while (next);
  return items;
}

async function batchGetByWikis(wikiArray) {
  const ids = wikiArray.map(w => decodeURIComponent(w));
  const client = getDocClient();
  const all = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { Responses } = await client.send(new BatchGetCommand({
      RequestItems: {
        [TABLE]: { Keys: chunk.map(_id => ({ _id })) }
      }
    }));
    if (Responses?.[TABLE]) all.push(...Responses[TABLE]);
  }
  return all;
}

async function scanAll() {
  const client = getDocClient();
  const items = [];
  let next;
  do {
    const params = { TableName: TABLE };
    if (next) params.ExclusiveStartKey = next;
    const out = await client.send(new ScanCommand(params));
    if (out.Items) items.push(...out.Items);
    next = out.LastEvaluatedKey;
  } while (next);
  return items;
}
