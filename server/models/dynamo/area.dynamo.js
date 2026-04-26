import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import { getDocClient, tableName } from './dynamo-client.js';
import { notImplemented } from './not-implemented.js';

const TABLE = tableName('areas');

class AreaDynamo extends DynamoDocument {
  static tableName = TABLE;

  static async get(id) {
    const doc = await this.findById(id);
    if (doc) return doc;
    const { createNotFoundError } = await import('../../middleware/errorHandler.js');
    throw createNotFoundError('Area not found');
  }

  static find(filter = {}) {
    return new DynamoQuery(this, filter);
  }

  static async findOne(filter = {}) {
    if (filter.year !== undefined) {
      const yearStr = String(filter.year);
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { _id: yearStr }
      }));
      return Item ? new AreaDynamo(Item) : null;
    }
    const results = await new DynamoQuery(this, filter).limit(1).exec();
    return results[0] || null;
  }

  static async findById(id) {
    const idStr = String(id);
    const { Item } = await getDocClient().send(new GetCommand({
      TableName: TABLE,
      Key: { _id: idStr }
    }));
    return Item ? new AreaDynamo(Item) : null;
  }

  static async estimatedDocumentCount() {
    const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
    const { getRawClient } = await import('./dynamo-client.js');
    const { Table } = await getRawClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  async save(options = {}) {
    const item = this.toObject();
    if (item.year !== undefined) item._id = String(item.year);
    await getDocClient().send(new (await import('@aws-sdk/lib-dynamodb')).PutCommand({
      TableName: TABLE,
      Item: item
    }));
    return this;
  }

  static aggregate = notImplemented(
    'Area.aggregate',
    'Admin aggregation paths (aggregateProvinces, aggregateDimension) are out of scope for DynamoDB migration.'
  );

  static bulkWrite = notImplemented(
    'Area.bulkWrite',
    'Used by area aggregation admin paths — out of scope.'
  );
}

export default AreaDynamo;
