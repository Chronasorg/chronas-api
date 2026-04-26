import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

import DynamoDocument from '../../../models/dynamo/dynamo-document.js';
import { getDocClient, tableName } from '../../../models/dynamo/dynamo-client.js';

const TABLE = tableName('board');

export default class ForumDynamo extends DynamoDocument {
  static tableName = TABLE;

  static find(filter = {}) {
    return new ForumQuery(filter);
  }

  static async findOne(filter = {}) {
    if (filter.forum_slug) {
      const items = await scanForums();
      return items.find(f => f.forum_slug === filter.forum_slug) || null;
    }
    if (filter._id) {
      return ForumDynamo.findById(filter._id);
    }
    return null;
  }

  static async findById(id) {
    const { Item } = await getDocClient().send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `FORUM#${id}`, SK: 'META' }
    }));
    return Item ? toForum(Item) : null;
  }

  async save() {
    const item = this.toObject();
    const pk = `FORUM#${item._id}`;
    await getDocClient().send(new PutCommand({
      TableName: TABLE,
      Item: { PK: pk, SK: 'META', entityType: 'forum', ...item }
    }));
    return this;
  }
}

class ForumQuery {
  constructor(filter) { this._filter = filter; }
  exec() { return scanForums(); }
  then(ok, fail) { return this.exec().then(ok, fail); }
  catch(fn) { return this.exec().catch(fn); }
}

async function scanForums() {
  const client = getDocClient();
  const items = [];
  let next;
  do {
    const params = {
      TableName: TABLE,
      FilterExpression: '#et = :et',
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: { ':et': 'forum' }
    };
    if (next) params.ExclusiveStartKey = next;
    const out = await client.send(new ScanCommand(params));
    if (out.Items) items.push(...out.Items.map(toForum));
    next = out.LastEvaluatedKey;
  } while (next);
  return items;
}

function toForum(item) {
  const f = new ForumDynamo({
    _id: item._id || item.PK?.replace('FORUM#', ''),
    forum_slug: item.forum_slug,
    forum_name: item.forum_name
  });
  return f;
}
