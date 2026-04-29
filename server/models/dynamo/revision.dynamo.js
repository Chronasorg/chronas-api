import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';
import crypto from 'node:crypto';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import QueryProxy from './query-proxy.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';
import { notImplemented } from './not-implemented.js';

const TABLE = tableName('revisions');

export default class RevisionDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new DynamoQuery(RevisionDynamo, filter);
  }

  static findById(id) {
    const promise = (async () => {
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { _id: String(id) }
      }));
      return Item ? new RevisionDynamo(Item) : null;
    })();
    return new QueryProxy(promise);
  }

  static async get(id) {
    const doc = await RevisionDynamo.findById(id).exec();
    if (doc) return doc;
    throw new APIError('No such revision exists!', httpStatus.NOT_FOUND);
  }

  static findOne(filter = {}) {
    const promise = (async () => {
    if (filter.entityId) {
      const { Items } = await getDocClient().send(new QueryCommand({
        TableName: TABLE,
        IndexName: 'GSI-EntityTimestamp',
        KeyConditionExpression: '#e = :e',
        ExpressionAttributeNames: { '#e': 'entityId' },
        ExpressionAttributeValues: { ':e': filter.entityId },
        ScanIndexForward: false,
        Limit: 1
      }));
      return Items?.[0] ? new RevisionDynamo(Items[0]) : null;
    }
    const results = await new DynamoQuery(RevisionDynamo, filter).limit(1).exec();
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

  static countDocuments(filter = {}) {
    const promise = new DynamoQuery(RevisionDynamo, filter).countDocuments();
    return { exec: () => promise };
  }

  static aggregate(pipeline) {
    const promise = (async () => {
      if (!Array.isArray(pipeline) || !pipeline[0]?.$group) {
        throw new Error('RevisionDynamo.aggregate: only [{$group}] supported');
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

  static list = notImplemented(
    'Revision.list',
    'Revision list endpoint has 0 production traffic. Only write + findById are in scope.'
  );

  async save() {
    const item = this.toObject();
    if (!item._id) item._id = crypto.randomUUID();
    if (!item.timestamp) item.timestamp = new Date().toISOString();
    if (typeof item.nextBody === 'object') item.nextBody = JSON.stringify(item.nextBody);
    if (typeof item.prevBody === 'object') item.prevBody = JSON.stringify(item.prevBody);
    await getDocClient().send(new PutCommand({ TableName: TABLE, Item: item }));
    this._id = item._id;
    return this;
  }
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
