import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import QueryProxy from './query-proxy.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';
import { notImplemented } from './not-implemented.js';
import BoundedCache from '../../helpers/bounded-cache.js';

const TABLE = tableName('areas');
// Recently read years, so popular years don't cost a GetItem (~17 read units
// for ~130 KB) on every edge miss. Bounded: one client sweeping all ~3,942
// years used to fill the 512 MB function when this cache had no limit.
export const areaCache = new BoundedCache({
  maxEntries: 100,
  maxBytes: 16 * 1024 * 1024,
  maxEntryBytes: 1024 * 1024,
  ttlMs: 24 * 60 * 60 * 1000
});

/**
 * Areas DynamoDB model. Simple PK-only table keyed on year (stored as a
 * string in `_id`). 13% of production traffic is a single GetItem per
 * year change, so the shape is intentionally minimal.
 *
 * Scope: `get`, `findById`, `findOne({year})`, `save`, `find()` via the
 * generic DynamoQuery (scan). `aggregate()` and `bulkWrite()` are stubbed
 * because the admin aggregation path isn't in the migration scope.
 */
export default class AreaDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new DynamoQuery(AreaDynamo, filter);
  }

  static findById(id) {
    const promise = (async () => {
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { _id: String(id) }
      }));
      if (!Item) return null;
      if (Item.data && typeof Item.data === 'object') {
        restoreEmptyStrings(Item.data);
      }
      return new AreaDynamo(Item);
    })();
    return new QueryProxy(promise);
  }

  // Only reads use the cache: a write loads the area and changes it in place.
  static async get(id, method = 'GET') {
    const cacheable = method === 'GET' || method === 'HEAD';
    const cached = cacheable ? areaCache.get(String(id)) : undefined;
    if (cached) return new AreaDynamo(cached);

    const doc = await AreaDynamo.findById(id).exec();
    if (!doc) throw new APIError('No such area exists!', httpStatus.NOT_FOUND);
    if (cacheable) areaCache.set(String(id), doc.toObject());
    return doc;
  }

  static findOne(filter = {}) {
    if (filter.year !== undefined) {
      return AreaDynamo.findById(filter.year);
    }
    const promise = (async () => {
      const results = await new DynamoQuery(AreaDynamo, filter).limit(1).exec();
      return results[0] || null;
    })();
    return new QueryProxy(promise);
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  async save() {
    const item = this.toObject();
    if (item.year !== undefined && item._id === undefined) {
      item._id = String(item.year);
    }
    await getDocClient().send(new PutCommand({
      TableName: TABLE,
      Item: item
    }));
    areaCache.delete(String(item._id));
    return this;
  }

  static list(_options = {}) {
    return new DynamoQuery(AreaDynamo, {}).exec();
  }

  static aggregate = notImplemented(
    'Area.aggregate',
    'Admin aggregation paths (aggregateProvinces, aggregateDimension) are out of scope.'
  );

  static bulkWrite = notImplemented(
    'Area.bulkWrite',
    'Used by area aggregation admin paths — out of scope.'
  );
}

function restoreEmptyStrings(data) {
  for (const key in data) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === null) arr[i] = '';
      }
    }
  }
}
