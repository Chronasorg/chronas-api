import { GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import crypto from 'node:crypto';

import DynamoDocument from '../../../models/dynamo/dynamo-document.js';
import QueryProxy from '../../../models/dynamo/query-proxy.js';
import DynamoQuery from '../../../models/dynamo/dynamo-query.js';
import { getDocClient, getDynamoClient, tableName } from '../../../models/dynamo/dynamo-client.js';

const TABLE = tableName('board');

export default class DiscussionDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new DiscussionQuery(filter);
  }

  static findById(id) {
    const promise = (async () => {
      const { Item } = await getDocClient().send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `DISC#${id}`, SK: 'META' }
      }));
      return Item ? new DiscussionDynamo(toDiscussion(Item)) : null;
    })();
    return new QueryProxy(promise);
  }

  static countDocuments(filter = {}) {
    const promise = (async () => {
      const items = await queryDiscussions(filter);
      return items.length;
    })();
    return { exec: () => promise, then: (ok, fail) => promise.then(ok, fail), catch: fn => promise.catch(fn) };
  }

  static async estimatedDocumentCount() {
    const items = [];
    let next;
    do {
      const params = {
        TableName: TABLE, Select: 'COUNT',
        FilterExpression: '#et = :et',
        ExpressionAttributeNames: { '#et': 'entityType' },
        ExpressionAttributeValues: { ':et': 'discussion' }
      };
      if (next) params.ExclusiveStartKey = next;
      const out = await getDocClient().send(new ScanCommand(params));
      items.push(out.Count || 0);
      next = out.LastEvaluatedKey;
    } while (next);
    return items.reduce((a, b) => a + b, 0);
  }

  static aggregate(pipeline) {
    const promise = (async () => {
      if (!Array.isArray(pipeline) || !pipeline[0]?.$group) {
        throw new Error('DiscussionDynamo.aggregate: only [{$group}] supported');
      }
      const field = typeof pipeline[0].$group._id === 'string'
        ? pipeline[0].$group._id.replace('$', '') : null;
      const items = await scanDiscussions();
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
    const pk = `DISC#${item._id}`;
    await getDocClient().send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: pk, SK: 'META', entityType: 'discussion',
        qa_id: item.qa_id || '!na',
        date: item.date,
        ...item,
        user_username: item.user_username,
        user_avatar: item.user_avatar
      }
    }));
    this._id = item._id;
    return this;
  }

  async deleteOne() {
    await getDocClient().send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `DISC#${this._id}`, SK: 'META' }
    }));
    return this;
  }
}

class DiscussionQuery {
  constructor(filter) { this._filter = filter; this._sort = null; this._skip = 0; this._limit = null; this._lean = false; this._popForum = false; this._popUser = false; }
  sort(s) { this._sort = s; return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = n; return this; }
  lean() { this._lean = true; return this; }
  populate(field) {
    if (field === 'forum') this._popForum = true;
    if (field === 'user') this._popUser = true;
    return this;
  }
  async exec() {
    let items = await queryDiscussions(this._filter);
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
    if (this._skip) items = items.slice(this._skip);
    if (this._limit) items = items.slice(0, this._limit);
    if (this._popUser) {
      for (const item of items) {
        item.user = { _id: item.user_id || item.user, username: item.user_username, avatar: item.user_avatar };
      }
    }
    if (this._popForum) {
      for (const item of items) {
        item.forum = { _id: item.forum_id, forum_slug: item.forum_slug, forum_name: item.forum_name };
      }
    }
    return items;
  }
  then(ok, fail) { return this.exec().then(ok, fail); }
  catch(fn) { return this.exec().catch(fn); }
}

async function queryDiscussions(filter) {
  if (filter.qa_id) {
    const { Items } = await getDocClient().send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI-QA',
      KeyConditionExpression: '#q = :q',
      ExpressionAttributeNames: { '#q': 'qa_id' },
      ExpressionAttributeValues: { ':q': filter.qa_id }
    }));
    return (Items || []).filter(i => i.entityType === 'discussion').map(toDiscussion);
  }
  const items = await scanDiscussions();
  return items.filter(d => {
    if (filter.forum_id && String(d.forum_id) !== String(filter.forum_id)) return false;
    if (typeof filter.pinned !== 'undefined' && d.pinned !== filter.pinned) return false;
    return true;
  });
}

async function scanDiscussions() {
  const client = getDocClient();
  const items = [];
  let next;
  do {
    const params = {
      TableName: TABLE,
      FilterExpression: '#et = :et',
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: { ':et': 'discussion' }
    };
    if (next) params.ExclusiveStartKey = next;
    const out = await client.send(new ScanCommand(params));
    if (out.Items) items.push(...out.Items.map(toDiscussion));
    next = out.LastEvaluatedKey;
  } while (next);
  return items;
}

function toDiscussion(item) {
  return {
    _id: item._id || item.PK?.replace('DISC#', ''),
    forum_id: item.forum_id,
    discussion_slug: item.discussion_slug,
    user_id: item.user_id,
    user: item.user || item.user_id,
    user_username: item.user_username,
    user_avatar: item.user_avatar,
    date: item.date,
    title: item.title,
    qa_id: item.qa_id,
    content: item.content,
    favorites: item.favorites || [],
    tags: item.tags || [],
    pinned: item.pinned || false,
    forum_slug: item.forum_slug,
    forum_name: item.forum_name
  };
}
