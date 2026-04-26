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

  static async findOne(filter = {}) {
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

  static async countDocuments(filter = {}) {
    return new DynamoQuery(UserDynamo, filter).countDocuments();
  }

  static async estimatedDocumentCount() {
    const { Table } = await getDynamoClient().send(new DescribeTableCommand({
      TableName: TABLE
    }));
    return Table?.ItemCount ?? 0;
  }

  select(fields) {
    if (typeof fields === 'string' && fields.includes('+password')) {
      // password is already on the instance in DynamoDB (no select:false)
    }
    return this;
  }

  static select(fields) {
    // Static form used in chaining: User.findOne(...).select('+password')
    // DynamoDB doesn't strip fields by default, so this is a passthrough
    // that returns a thenable wrapping the pending query.
    return { select: () => this };
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
