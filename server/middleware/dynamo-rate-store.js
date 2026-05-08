import { UpdateCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { getDocClient, tableName } from '../models/dynamo/dynamo-client.js';

const TABLE = tableName('rate-limits');

export class DynamoRateLimitStore {
  constructor({ prefix = '', windowMs }) {
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.localKeys = new Map();
  }

  init(options) {
    if (!this.windowMs) this.windowMs = options.windowMs;
  }

  _id(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    const id = this._id(key);
    const now = Date.now();
    const expiresAt = Math.floor((now + this.windowMs) / 1000);

    const { Attributes } = await getDocClient().send(new UpdateCommand({
      TableName: TABLE,
      Key: { _id: id },
      UpdateExpression: 'ADD #c :one SET expires_at = if_not_exists(expires_at, :exp), reset_at = if_not_exists(reset_at, :reset)',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':exp': expiresAt, ':reset': now + this.windowMs },
      ReturnValues: 'ALL_NEW'
    }));

    let totalHits = Attributes?.count ?? 1;
    let resetAt = Attributes?.reset_at ?? (now + this.windowMs);

    if (now >= resetAt) {
      await getDocClient().send(new DeleteCommand({ TableName: TABLE, Key: { _id: id } }));
      const fresh = await getDocClient().send(new UpdateCommand({
        TableName: TABLE,
        Key: { _id: id },
        UpdateExpression: 'SET #c = :one, expires_at = :exp, reset_at = :reset',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':exp': expiresAt, ':reset': now + this.windowMs },
        ReturnValues: 'ALL_NEW'
      }));
      totalHits = fresh.Attributes?.count ?? 1;
      resetAt = fresh.Attributes?.reset_at ?? (now + this.windowMs);
    }

    return { totalHits, resetTime: new Date(resetAt) };
  }

  async decrement(key) {
    const id = this._id(key);
    try {
      await getDocClient().send(new UpdateCommand({
        TableName: TABLE,
        Key: { _id: id },
        UpdateExpression: 'ADD #c :neg',
        ConditionExpression: 'attribute_exists(#c) AND #c > :zero',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':neg': -1, ':zero': 0 }
      }));
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    }
  }

  async resetKey(key) {
    await getDocClient().send(new DeleteCommand({ TableName: TABLE, Key: { _id: this._id(key) } }));
  }

  async get(key) {
    const { Item } = await getDocClient().send(new GetCommand({
      TableName: TABLE,
      Key: { _id: this._id(key) }
    }));
    if (!Item) return undefined;
    return { totalHits: Item.count ?? 0, resetTime: new Date(Item.reset_at ?? Date.now()) };
  }
}
