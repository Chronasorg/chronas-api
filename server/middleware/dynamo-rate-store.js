import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import debug from 'debug';

import { getDocClient, tableName } from '../models/dynamo/dynamo-client.js';

const TABLE = tableName('rate-limits');
const debugLog = debug('chronas-api:rate-store');

/**
 * DynamoDB-backed store for express-rate-limit.
 *
 * Counter keys are scoped by both client key AND window start time, so each
 * fixed window gets its own item:
 *
 *   prefix:clientKey:windowStart
 *
 * No counter reset is ever needed (old items expire via TTL), which removes
 * the rollover race that a "Update -> if expired Delete -> Update" approach
 * has at the window boundary.
 *
 * On DynamoDB errors the store fails OPEN: we log and report a hit count of
 * 1, so a transient DDB problem can't lock real users out. This is the
 * standard tradeoff express-rate-limit recommends for an external store.
 */
export class DynamoRateLimitStore {
  constructor({ prefix = '', windowMs }) {
    if (!prefix) throw new Error('DynamoRateLimitStore: prefix is required');
    if (!windowMs) throw new Error('DynamoRateLimitStore: windowMs is required');
    this.prefix = prefix;
    this.windowMs = windowMs;
  }

  init(_options) {
    // express-rate-limit calls init(); windowMs is required at construction
    // time (we use it to bucket items by window) so nothing to do here.
  }

  _windowStart(now = Date.now()) {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  _id(clientKey, windowStart) {
    return `${this.prefix}:${clientKey}:${windowStart}`;
  }

  async increment(clientKey) {
    const now = Date.now();
    const windowStart = this._windowStart(now);
    const resetTime = new Date(windowStart + this.windowMs);
    const id = this._id(clientKey, windowStart);
    const expiresAt = Math.floor((windowStart + this.windowMs) / 1000) + 60;

    try {
      const { Attributes } = await getDocClient().send(new UpdateCommand({
        TableName: TABLE,
        Key: { _id: id },
        UpdateExpression: 'ADD #c :one SET expires_at = if_not_exists(expires_at, :exp)',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':exp': expiresAt },
        ReturnValues: 'ALL_NEW'
      }));
      return { totalHits: Attributes?.count ?? 1, resetTime };
    } catch (err) {
      debugLog('increment failed (fail-open): %s %s', err.name, err.message);
      return { totalHits: 1, resetTime };
    }
  }

  async decrement(clientKey) {
    const id = this._id(clientKey, this._windowStart());
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
      if (err.name !== 'ConditionalCheckFailedException') {
        debugLog('decrement failed (ignored): %s %s', err.name, err.message);
      }
    }
  }

  async resetKey(clientKey) {
    const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
    const id = this._id(clientKey, this._windowStart());
    try {
      await getDocClient().send(new DeleteCommand({ TableName: TABLE, Key: { _id: id } }));
    } catch (err) {
      debugLog('resetKey failed (ignored): %s %s', err.name, err.message);
    }
  }

  async get(clientKey) {
    const windowStart = this._windowStart();
    const id = this._id(clientKey, windowStart);
    try {
      const { Item } = await getDocClient().send(new GetCommand({ TableName: TABLE, Key: { _id: id } }));
      if (!Item) return undefined;
      return {
        totalHits: Item.count ?? 0,
        resetTime: new Date(windowStart + this.windowMs)
      };
    } catch (err) {
      debugLog('get failed (fail-open): %s %s', err.name, err.message);
      return undefined;
    }
  }
}
