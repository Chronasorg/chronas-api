import { GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';

import DynamoDocument from '../../../models/dynamo/dynamo-document.js';
import { getDocClient, tableName } from '../../../models/dynamo/dynamo-client.js';

const TABLE = tableName('board');

export default class OpinionDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new OpinionQuery(filter);
  }

  static async findOne(filter = {}) {
    if (filter._id) {
      return OpinionDynamo.findById(filter._id);
    }
    const items = await scanOpinions(filter);
    return items[0] || null;
  }

  static async findById(id) {
    const items = await scanOpinions({ _id: id });
    return items[0] || null;
  }

  static aggregate(pipeline) {
    const promise = (async () => {
      if (!Array.isArray(pipeline) || !pipeline[0]?.$group) {
        throw new Error('OpinionDynamo.aggregate: only [{$group}] supported');
      }
      const field = typeof pipeline[0].$group._id === 'string'
        ? pipeline[0].$group._id.replace('$', '') : null;
      const items = await scanAllOpinions();
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
    if (!item._id) item._id = crypto.randomUUID();
    if (!item.date) item.date = new Date().toISOString();
    const discPk = item.discussion_id ? `DISC#${item.discussion_id}` : 'DISC#unknown';
    await getDocClient().send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: discPk, SK: `OPINION#${item._id}`, entityType: 'opinion',
        ...item,
        user_username: item.user_username,
        user_avatar: item.user_avatar
      }
    }));
    this._id = item._id;
    return this;
  }

  async deleteOne() {
    const items = await scanOpinions({ _id: this._id });
    if (items.length > 0) {
      const raw = items[0];
      await getDocClient().send(new DeleteCommand({
        TableName: TABLE,
        Key: { PK: raw._PK, SK: raw._SK }
      }));
    }
    return this;
  }

  static async deleteOne(filter = {}) {
    if (filter._id) {
      const items = await scanOpinions({ _id: filter._id });
      if (items.length > 0) {
        const raw = items[0];
        await getDocClient().send(new DeleteCommand({
          TableName: TABLE,
          Key: { PK: raw._PK, SK: raw._SK }
        }));
      }
    }
  }
}

class OpinionQuery {
  constructor(filter) { this._filter = filter; this._sort = null; this._popUser = false; }
  sort(s) { this._sort = s; return this; }
  populate(field) { if (field === 'user') this._popUser = true; return this; }
  lean() { return this; }
  skip(n) { return this; }
  limit(n) { return this; }
  async exec() {
    let items = await scanOpinions(this._filter);
    if (this._sort) {
      const entries = Object.entries(this._sort);
      items.sort((a, b) => {
        for (const [key, dir] of entries) {
          const av = a[key]; const bv = b[key];
          if (av === bv) continue;
          if (av == null) return 1;
          if (bv == null) return -1;
          return av < bv ? -(dir) : dir;
        }
        return 0;
      });
    }
    if (this._popUser) {
      for (const item of items) {
        item.user = { _id: item.user_id || item.user, username: item.user_username, avatar: item.user_avatar };
      }
    }
    return items;
  }
  then(ok, fail) { return this.exec().then(ok, fail); }
  catch(fn) { return this.exec().catch(fn); }
}

async function scanOpinions(filter = {}) {
  const client = getDocClient();
  const items = [];
  let next;
  do {
    const params = {
      TableName: TABLE,
      FilterExpression: '#et = :et',
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: { ':et': 'opinion' }
    };
    if (next) params.ExclusiveStartKey = next;
    const out = await client.send(new ScanCommand(params));
    if (out.Items) items.push(...out.Items.map(toOpinion));
    next = out.LastEvaluatedKey;
  } while (next);
  return items.filter(o => {
    if (filter._id && o._id !== filter._id) return false;
    if (filter.discussion_id && String(o.discussion_id) !== String(filter.discussion_id)) return false;
    return true;
  });
}

const scanAllOpinions = scanOpinions;

function toOpinion(item) {
  return {
    _id: item._id || item.SK?.replace('OPINION#', ''),
    _PK: item.PK,
    _SK: item.SK,
    forum_id: item.forum_id,
    discussion_id: item.discussion_id || item.PK?.replace('DISC#', ''),
    user_id: item.user_id,
    user: item.user || item.user_id,
    user_username: item.user_username,
    user_avatar: item.user_avatar,
    date: item.date,
    score: item.score || 0,
    content: item.content
  };
}
