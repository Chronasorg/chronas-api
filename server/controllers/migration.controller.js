import mongoose from 'mongoose';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { gzipSync } from 'zlib';

import { getDocClient, tableName } from '../models/dynamo/dynamo-client.js';
import { prepareForWrite } from '../models/dynamo/compression.js';

const BATCH_SIZE = 25;

async function migrateCollection(req, res) {
  const collection = req.query.collection;
  const dryRun = req.query.dryRun === 'true';
  const limit = parseInt(req.query.limit) || 0;
  const skip = parseInt(req.query.skip) || 0;

  if (!collection) {
    return res.status(400).json({ error: 'collection query param required' });
  }

  const collectionMap = {
    areas: { mongoCollection: 'areas', dynamoTable: tableName('areas'), transform: transformArea },
    markers: { mongoCollection: 'markers', dynamoTable: tableName('markers'), transform: transformDefault },
    metadata: { mongoCollection: 'metadatas', dynamoTable: tableName('metadata'), transform: transformMetadata },
    users: { mongoCollection: 'users', dynamoTable: tableName('users'), transform: transformUser },
    revisions: { mongoCollection: 'revisions', dynamoTable: tableName('revisions'), transform: transformRevision },
    flags: { mongoCollection: 'flags', dynamoTable: tableName('flags'), transform: transformDefault },
    discussions: { mongoCollection: 'discussions', dynamoTable: tableName('board'), transform: transformDiscussion },
    opinions: { mongoCollection: 'opinions', dynamoTable: tableName('board'), transform: transformOpinion },
    forums: { mongoCollection: 'forums', dynamoTable: tableName('board'), transform: transformForum },
    links: { mongoCollection: 'metadatas', dynamoTable: tableName('links'), transform: null, custom: migrateLinks }
  };

  const config = collectionMap[collection];
  if (!config) {
    return res.status(400).json({ error: `unknown collection: ${collection}`, valid: Object.keys(collectionMap) });
  }

  try {
    if (config.custom) {
      const result = await config.custom(dryRun);
      return res.json(result);
    }

    const db = mongoose.connection.db;
    const cursor = db.collection(config.mongoCollection).find({});
    if (skip > 0) cursor.skip(skip);
    if (limit > 0) cursor.limit(limit);

    let count = 0;
    let skipped = 0;
    let batch = [];
    const docClient = getDocClient();

    for await (const doc of cursor) {
      const item = config.transform(doc);
      if (!item) { skipped++; continue; }
      batch.push(item);
      count++;

      if (batch.length >= BATCH_SIZE) {
        if (!dryRun) {
          await writeBatch(docClient, config.dynamoTable, batch);
        }
        batch = [];
      }
    }

    if (batch.length > 0 && !dryRun) {
      await writeBatch(docClient, config.dynamoTable, batch);
    }

    res.json({ collection, table: config.dynamoTable, migratedCount: count, skipped, dryRun });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function writeBatch(docClient, table, items) {
  try {
    const requests = items.map(item => ({ PutRequest: { Item: item } }));
    await docClient.send(new BatchWriteCommand({
      RequestItems: { [table]: requests }
    }));
  } catch (err) {
    // Batch failed — fall back to individual puts so one oversized item doesn't block 24 others
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    for (const item of items) {
      try {
        await docClient.send(new PutCommand({ TableName: table, Item: item }));
      } catch (itemErr) {
        console.error(`Failed to write item ${item._id || item.PK || 'unknown'}: ${itemErr.message}`);
      }
    }
  }
}

function transformDefault(doc) {
  const item = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__v') continue;
    if (k === '' || v === undefined) continue;
    item[k] = v;
  }
  if (item._id && typeof item._id === 'object') item._id = item._id.toString();
  if (item.year == null) item.year = 0;
  return item;
}

function transformArea(doc) {
  return {
    _id: String(doc._id),
    year: typeof doc.year === 'number' ? doc.year : parseInt(doc._id),
    data: doc.data || {}
  };
}

function transformMetadata(doc) {
  const id = String(doc._id);
  // Skip the monolithic links document — it's decomposed into chronas-links table
  if (id === 'links') return null;

  const item = {
    _id: id,
    type: doc.type || 'g',
    data: stripEmptyKeys(doc.data)
  };
  if (doc.name) item.name = doc.name;
  if (doc.coo) item.coo = doc.coo;
  if (doc.wiki) item.wiki = doc.wiki;
  if (doc.subtype) item.subtype = doc.subtype;
  if (typeof doc.year === 'number') item.year = doc.year;
  if (typeof doc.score === 'number') item.score = doc.score;
  return prepareForWrite(item);
}

function stripEmptyKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '') continue;
    out[k] = v;
  }
  return out;
}

function transformUser(doc) {
  const id = String(doc._id || '').trim();
  if (!id) return null;
  const item = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__v' || k === '' || v === undefined) continue;
    item[k] = v;
  }
  item._id = id;
  item._entity = 'USER';
  if (!item.karma) item.karma = 0;
  if (!item.username) item.username = id;
  return item;
}

function transformRevision(doc) {
  const item = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__v' || k === '' || v === undefined) continue;
    item[k] = v;
  }
  item._id = item._id ? item._id.toString() : crypto.randomUUID();
  if (item.timestamp instanceof Date) item.timestamp = item.timestamp.toISOString();
  if (typeof item.nextBody === 'object') item.nextBody = JSON.stringify(item.nextBody);
  if (typeof item.prevBody === 'object') item.prevBody = JSON.stringify(item.prevBody);
  // Always compress body fields >50 KB to keep total item under 400 KB
  if (typeof item.nextBody === 'string' && Buffer.byteLength(item.nextBody) > 50000) {
    item.nextBody = gzipSync(Buffer.from(item.nextBody, 'utf8'));
    item.nextBodyCompressed = true;
  }
  if (typeof item.prevBody === 'string' && Buffer.byteLength(item.prevBody) > 50000) {
    item.prevBody = gzipSync(Buffer.from(item.prevBody, 'utf8'));
    item.prevBodyCompressed = true;
  }
  return item;
}

function transformDiscussion(doc) {
  const id = doc._id.toString();
  return {
    PK: `DISC#${id}`, SK: 'META', entityType: 'discussion',
    _id: id,
    forum_id: doc.forum_id?.toString(),
    discussion_slug: doc.discussion_slug,
    user_id: doc.user_id || doc.user?.toString(),
    user: doc.user_id || doc.user?.toString(),
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    title: doc.title,
    qa_id: doc.qa_id || '!na',
    content: doc.content,
    favorites: doc.favorites || [],
    tags: doc.tags || [],
    pinned: doc.pinned || false
  };
}

function transformOpinion(doc) {
  const id = doc._id.toString();
  const discId = doc.discussion_id?.toString() || doc.discussion?.toString() || 'unknown';
  return {
    PK: `DISC#${discId}`, SK: `OPINION#${id}`, entityType: 'opinion',
    _id: id,
    forum_id: doc.forum_id?.toString(),
    discussion_id: discId,
    user_id: doc.user_id || doc.user?.toString(),
    user: doc.user_id || doc.user?.toString(),
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    score: doc.score || 0,
    content: doc.content
  };
}

function transformForum(doc) {
  const id = doc._id.toString();
  return {
    PK: `FORUM#${id}`, SK: 'META', entityType: 'forum',
    _id: id,
    forum_slug: doc.forum_slug,
    forum_name: doc.forum_name
  };
}

async function migrateLinks(dryRun) {
  const db = mongoose.connection.db;
  const linksDoc = await db.collection('metadatas').findOne({ _id: 'links' });
  if (!linksDoc || !linksDoc.data) {
    return { collection: 'links', table: tableName('links'), migratedCount: 0, note: 'no links document found' };
  }

  const data = linksDoc.data;
  const entries = Object.entries(data);
  const docClient = getDocClient();
  let count = 0;
  let batch = [];

  for (const [entityRef, linkArrays] of entries) {
    if (!Array.isArray(linkArrays) || linkArrays.length < 2) continue;
    const item = {
      entityRef,
      markers: linkArrays[0] || [],
      metadata: linkArrays[1] || []
    };
    batch.push(item);
    count++;

    if (batch.length >= BATCH_SIZE && !dryRun) {
      await writeBatch(docClient, tableName('links'), batch);
      batch = [];
    }
  }

  if (batch.length > 0 && !dryRun) {
    await writeBatch(docClient, tableName('links'), batch);
  }

  return { collection: 'links', table: tableName('links'), migratedCount: count, totalEntries: entries.length, dryRun };
}

export default { migrateCollection };
