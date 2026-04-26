import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import httpStatus from 'http-status';
import bcrypt from 'bcryptjs';

import APIError from '../../helpers/APIError.js';
import DynamoDocument from './dynamo-document.js';
import DynamoQuery from './dynamo-query.js';
import { getDocClient, getDynamoClient, tableName } from './dynamo-client.js';

const TABLE = tableName('users');

export default class UserDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new DynamoQuery(UserDynamo, filter);
  }

  static async findById(id) {
    const { Item } = await getDocClient().send(new GetCommand({
      TableName: TABLE,
      Key: { _id: String(id) }
    }));
    return Item ? new UserDynamo(Item) : null;
  }

  static findOne(filter = {}) {
    return new UserQuery(filter);
  }

  static async get(id) {
    const doc = await UserDynamo.findById(id);
    if (doc) return doc;
    throw new APIError('User not found', httpStatus.NOT_FOUND);
  }

  static async findByEmail(email) {
    return UserDynamo.findById(email.toLowerCase());
  }

  static async list(options = {}) {
    const { start = 0, limit = 20, sort = 'karma', order = 'desc' } = options;
    const items = [];
    let next;
    do {
      const params = { TableName: TABLE };
      if (next) params.ExclusiveStartKey = next;
      const out = await getDocClient().send(new ScanCommand(params));
      if (out.Items) items.push(...out.Items);
      next = out.LastEvaluatedKey;
    } while (next);

    const dir = order === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      const av = a[sort]; const bv = b[sort];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -dir : dir;
    });

    return items.slice(start, start + limit);
  }

  static countDocuments(filter = {}) {
    const promise = new DynamoQuery(UserDynamo, filter).countDocuments();
    return { exec: () => promise };
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  static aggregate(pipeline) {
    const promise = (async () => {
      if (!Array.isArray(pipeline) || !pipeline[0]?.$group) {
        throw new Error('UserDynamo.aggregate: only [{$group}] supported');
      }
      const field = typeof pipeline[0].$group._id === 'string'
        ? pipeline[0].$group._id.replace('$', '') : null;
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
      return Object.entries(counts).map(([k, v]) => ({
        _id: k === 'null' ? null : k, count: v
      }));
    })();
    return { exec: () => promise, then: (ok, fail) => promise.then(ok, fail), catch: fn => promise.catch(fn) };
  }

  async comparePassword(candidatePassword) {
    if (!this.password) {
      throw new APIError('No password set for this user', httpStatus.BAD_REQUEST);
    }
    return bcrypt.compare(candidatePassword, this.password);
  }

  async save() {
    const item = this.toObject();
    await getDocClient().send(new PutCommand({ TableName: TABLE, Item: item }));
    return this;
  }
}

/**
 * Chainable query proxy so that User.findOne({email}).select('+password').exec()
 * works like Mongoose. DynamoDB doesn't strip fields, so select() is a no-op,
 * but the chain must not break.
 */
class UserQuery {
  constructor(filter) {
    this._filter = filter;
    this._promise = null;
  }

  select() { return this; }
  lean() { return this; }

  exec() { return this._resolve(); }
  then(ok, fail) { return this._resolve().then(ok, fail); }
  catch(fn) { return this._resolve().catch(fn); }

  async _resolve() {
    if (this._promise) return this._promise;
    this._promise = _findOneRaw(this._filter);
    return this._promise;
  }
}

async function _findOneRaw(filter) {
  if (filter.email) {
    return UserDynamo.findById(filter.email.toLowerCase());
  }
  if (filter.username) {
    const { Items } = await getDocClient().send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI-Username',
      KeyConditionExpression: '#u = :u',
      ExpressionAttributeNames: { '#u': 'username' },
      ExpressionAttributeValues: { ':u': filter.username },
      Limit: 1
    }));
    return Items?.[0] ? new UserDynamo(Items[0]) : null;
  }
  const results = await new DynamoQuery(UserDynamo, filter).limit(1).exec();
  return results[0] || null;
}
