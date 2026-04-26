import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';
import { notImplemented } from './not-implemented.js';

const TABLE = tableName('areas');

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

  static async findById(id) {
    const { Item } = await getDocClient().send(new GetCommand({
      TableName: TABLE,
      Key: { _id: String(id) }
    }));
    return Item ? new AreaDynamo(Item) : null;
  }

  static async get(id) {
    const doc = await AreaDynamo.findById(id);
    if (doc) return doc;
    throw new APIError('No such area exists!', httpStatus.NOT_FOUND);
  }

  static async findOne(filter = {}) {
    if (filter.year !== undefined) {
      return AreaDynamo.findById(filter.year);
    }
    const results = await new DynamoQuery(AreaDynamo, filter).limit(1).exec();
    return results[0] || null;
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
    return this;
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
