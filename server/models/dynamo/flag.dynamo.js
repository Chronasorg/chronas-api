import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';
import crypto from 'node:crypto';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import QueryProxy from './query-proxy.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';

const TABLE = tableName('flags');

export default class FlagDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new DynamoQuery(FlagDynamo, filter);
  }

  static findById(id) {
    const promise = (async () => {
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { _id: String(id) }
      }));
      return Item ? new FlagDynamo(Item) : null;
    })();
    return new QueryProxy(promise);
  }

  static findOne(filter = {}) {
    const promise = (async () => {
      if (filter.fullUrl) {
        const { Items } = await getDocClient().send(new QueryCommand({
          TableName: TABLE,
          IndexName: 'GSI-FullUrl',
          KeyConditionExpression: '#f = :f',
          ExpressionAttributeNames: { '#f': 'fullUrl' },
          ExpressionAttributeValues: { ':f': filter.fullUrl },
          Limit: 1
        }));
        return Items?.[0] ? new FlagDynamo(Items[0]) : null;
      }
      const results = await new DynamoQuery(FlagDynamo, filter).limit(1).exec();
      return results[0] || null;
    })();
    return new QueryProxy(promise);
  }

  static async get(id) {
    const doc = await FlagDynamo.findById(id).exec();
    if (doc) return doc;
    throw new APIError('No such flag exists!', httpStatus.NOT_FOUND);
  }

  static async list({ start = 0, end = 50, entity, order, subentity, fixed, sort = 'timestamp' } = {}) {
    const filter = {};
    if (entity) filter.entityId = entity;
    if (subentity) filter.subEntityId = subentity;
    if (typeof fixed !== 'undefined') filter.fixed = fixed;

    const items = await new DynamoQuery(FlagDynamo, filter)
      .sort({ [sort]: order === 'desc' ? -1 : 1 })
      .skip(+start)
      .limit(end - start)
      .lean()
      .exec();

    return items.map(obj => {
      if (obj.fullUrl) obj.fullUrl = decodeURIComponent(obj.fullUrl);
      return obj;
    });
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  async save() {
    const item = this.toObject();
    if (!item._id) item._id = crypto.randomUUID();
    if (!item.timestamp) item.timestamp = new Date().toISOString();
    await getDocClient().send(new PutCommand({ TableName: TABLE, Item: item }));
    this._id = item._id;
    return this;
  }
}
