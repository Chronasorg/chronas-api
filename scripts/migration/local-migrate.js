#!/usr/bin/env node
/**
 * Local migration script — Option 2:
 * 1. Export docs from DocumentDB via Lambda /migration/export endpoint
 * 2. Transform locally
 * 3. Write to DynamoDB directly from local machine (no timeout)
 *
 * Usage:
 *   AWS_PROFILE=chronas node scripts/migration/local-migrate.js \
 *     --collection areas \
 *     --lambda-function ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-b5U4C0YDGKS5 \
 *     --batch-size 500
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { gzipSync } from 'zlib';

const REGION = 'eu-west-1';
const TABLE_PREFIX = 'chronas';

const args = parseArgs(process.argv.slice(2));
if (!args.collection || !args.lambdaFunction) {
  console.log('Usage: local-migrate.js --collection <name> --lambda-function <name> [--batch-size 500] [--dry-run]');
  process.exit(2);
}

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true, convertEmptyValues: true }, unmarshallOptions: { wrapNumbers: false } }
);
const lambdaClient = new LambdaClient({ region: REGION });

const collectionConfig = {
  areas: { table: `${TABLE_PREFIX}-areas`, transform: transformArea },
  markers: { table: `${TABLE_PREFIX}-markers`, transform: transformMarker },
  metadata: { table: `${TABLE_PREFIX}-metadata`, transform: transformMetadata },
  users: { table: `${TABLE_PREFIX}-users`, transform: transformUser },
  revisions: { table: `${TABLE_PREFIX}-revisions`, transform: transformRevision },
  flags: { table: `${TABLE_PREFIX}-flags`, transform: transformFlag },
  forums: { table: `${TABLE_PREFIX}-board`, transform: transformForum },
  discussions: { table: `${TABLE_PREFIX}-board`, transform: transformDiscussion },
  opinions: { table: `${TABLE_PREFIX}-board`, transform: transformOpinion },
};

const config = collectionConfig[args.collection];
if (!config) {
  console.error(`Unknown collection: ${args.collection}. Valid: ${Object.keys(collectionConfig).join(', ')}`);
  process.exit(2);
}

async function main() {
  console.log(`Migrating ${args.collection} → ${config.table}`);
  console.log(`Lambda: ${args.lambdaFunction}, batch: ${args.batchSize}, dryRun: ${args.dryRun}`);

  let skip = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  while (true) {
    console.log(`  Exporting skip=${skip} limit=${args.batchSize}...`);
    const docs = await exportFromLambda(args.collection, skip, args.batchSize);

    if (!docs || docs.length === 0) {
      console.log(`  No more docs at skip=${skip}. Done.`);
      break;
    }

    console.log(`  Got ${docs.length} docs. Transforming + writing...`);
    let batch = [];
    for (const doc of docs) {
      const item = config.transform(doc);
      if (!item) { totalSkipped++; continue; }
      batch.push(item);

      if (batch.length >= 25) {
        if (!args.dryRun) {
          const failed = await writeBatch(config.table, batch);
          totalFailed += failed;
        }
        totalMigrated += batch.length;
        batch = [];
      }
    }
    if (batch.length > 0) {
      if (!args.dryRun) {
        const failed = await writeBatch(config.table, batch);
        totalFailed += failed;
      }
      totalMigrated += batch.length;
    }

    console.log(`  Progress: ${totalMigrated} migrated, ${totalSkipped} skipped, ${totalFailed} failed`);

    if (docs.length < args.batchSize) break;
    skip += args.batchSize;
  }

  console.log(`\nDone: ${totalMigrated} migrated, ${totalSkipped} skipped, ${totalFailed} failed`);
}

async function exportFromLambda(collection, skip, limit) {
  const payload = JSON.stringify({
    version: '2.0', routeKey: 'GET /v1/migration/export', rawPath: '/v1/migration/export',
    rawQueryString: `collection=${collection}&skip=${skip}&limit=${limit}`,
    headers: { host: 'lambda.local' },
    queryStringParameters: { collection, skip: String(skip), limit: String(limit) },
    requestContext: { http: { method: 'GET', path: '/v1/migration/export' }, stage: '$default' },
    isBase64Encoded: false
  });

  const response = await lambdaClient.send(new InvokeCommand({
    FunctionName: args.lambdaFunction,
    Payload: new TextEncoder().encode(payload)
  }));

  const result = JSON.parse(new TextDecoder().decode(response.Payload));
  if (result.statusCode !== 200) {
    console.error(`  Lambda error: ${result.body}`);
    return [];
  }
  const body = JSON.parse(result.body);
  return body.docs || [];
}

async function writeBatch(table, items) {
  let failed = 0;
  try {
    await dynamoClient.send(new BatchWriteCommand({
      RequestItems: { [table]: items.map(item => ({ PutRequest: { Item: item } })) }
    }));
  } catch (err) {
    // Fallback to individual puts
    for (const item of items) {
      try {
        await dynamoClient.send(new PutCommand({ TableName: table, Item: item }));
      } catch (itemErr) {
        console.error(`    Failed: ${item._id || item.PK || 'unknown'}: ${itemErr.message.substring(0, 80)}`);
        failed++;
      }
    }
  }
  return failed;
}

// --- Transform functions ---

function transformArea(doc) {
  return {
    _id: String(doc._id),
    year: typeof doc.year === 'number' ? doc.year : parseInt(doc._id),
    data: doc.data || {}
  };
}

function transformMarker(doc) {
  const item = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__v' || k === '' || v === undefined) continue;
    item[k] = v;
  }
  if (item._id && typeof item._id === 'object') item._id = item._id.toString();
  if (item.year == null) item.year = 0;
  return item;
}

function transformMetadata(doc) {
  const id = String(doc._id);
  if (id === 'links') return null;
  const item = { _id: id, type: doc.type || 'g', data: stripEmptyKeys(doc.data) };
  if (doc.name) item.name = doc.name;
  if (doc.coo) item.coo = doc.coo;
  if (doc.wiki) item.wiki = doc.wiki;
  if (doc.subtype) item.subtype = doc.subtype;
  if (typeof doc.year === 'number') item.year = doc.year;
  if (typeof doc.score === 'number') item.score = doc.score;
  // Compress large data fields
  if (item.data && JSON.stringify(item.data).length > 200000) {
    item.data = gzipSync(Buffer.from(JSON.stringify(item.data), 'utf8'));
    item.dataCompressed = true;
  }
  return item;
}

function transformUser(doc) {
  const id = String(doc._id || '').trim();
  if (!id) return null;
  const item = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__v' || k === '' || v === undefined) continue;
    item[k] = v;
  }
  item._id = id.toLowerCase();
  if (item.email) item.email = String(item.email).toLowerCase();
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
  item._id = item._id ? String(item._id) : crypto.randomUUID();
  if (typeof item.nextBody === 'object') item.nextBody = JSON.stringify(item.nextBody);
  if (typeof item.prevBody === 'object') item.prevBody = JSON.stringify(item.prevBody);
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

function transformFlag(doc) {
  const item = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '__v' || k === '' || v === undefined) continue;
    item[k] = v;
  }
  if (item._id && typeof item._id === 'object') item._id = item._id.toString();
  return item;
}

function transformForum(doc) {
  const id = String(doc._id);
  return { PK: `FORUM#${id}`, SK: 'META', entityType: 'forum', _id: id, forum_slug: doc.forum_slug, forum_name: doc.forum_name };
}

function transformDiscussion(doc) {
  const id = String(doc._id);
  return {
    PK: `DISC#${id}`, SK: 'META', entityType: 'discussion', _id: id,
    forum_id: doc.forum_id ? String(doc.forum_id) : undefined,
    discussion_slug: doc.discussion_slug,
    user_id: doc.user_id || (doc.user ? String(doc.user) : undefined),
    user: doc.user_id || (doc.user ? String(doc.user) : undefined),
    date: doc.date, title: doc.title, qa_id: doc.qa_id || '!na',
    content: doc.content, favorites: doc.favorites || [], tags: doc.tags || [],
    pinned: doc.pinned || false
  };
}

function transformOpinion(doc) {
  const id = String(doc._id);
  const discId = doc.discussion_id ? String(doc.discussion_id) : (doc.discussion ? String(doc.discussion) : 'unknown');
  return {
    PK: `DISC#${discId}`, SK: `OPINION#${id}`, entityType: 'opinion', _id: id,
    forum_id: doc.forum_id ? String(doc.forum_id) : undefined,
    discussion_id: discId,
    user_id: doc.user_id || (doc.user ? String(doc.user) : undefined),
    user: doc.user_id || (doc.user ? String(doc.user) : undefined),
    date: doc.date, score: doc.score || 0, content: doc.content
  };
}

function stripEmptyKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) { if (k !== '') out[k] = v; }
  return out;
}

function parseArgs(argv) {
  const out = { batchSize: 500, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--collection') out.collection = argv[++i];
    else if (argv[i] === '--lambda-function') out.lambdaFunction = argv[++i];
    else if (argv[i] === '--batch-size') out.batchSize = parseInt(argv[++i]);
    else if (argv[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
