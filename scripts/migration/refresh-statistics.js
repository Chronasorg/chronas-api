#!/usr/bin/env node
/**
 * Compute statistics from DynamoDB and upload to S3.
 * Run locally after data migrations or on a schedule.
 *
 * Usage:
 *   AWS_PROFILE=chronas node scripts/migration/refresh-statistics.js
 *   AWS_PROFILE=chronas node scripts/migration/refresh-statistics.js --bucket chronas-csv
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync } from 'fs';

const REGION = 'eu-west-1';
const TABLE_PREFIX = 'chronas';

const args = parseArgs(process.argv.slice(2));
const BUCKET = args.bucket || process.env.STATISTICS_S3_BUCKET || 'chronas-csv';
const S3_KEY = args.key || process.env.STATISTICS_S3_KEY || 'api/statistics.json';

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { unmarshallOptions: { wrapNumbers: false } }
);
const s3 = new S3Client({ region: REGION });

async function main() {
  console.log(`Computing statistics from DynamoDB (${TABLE_PREFIX}-*) ...`);

  const [marker, metadata, metaI, user, revision] = await Promise.all([
    groupBy(`${TABLE_PREFIX}-markers`, 'type'),
    groupBy(`${TABLE_PREFIX}-metadata`, 'type'),
    groupBy(`${TABLE_PREFIX}-metadata`, 'subtype'),
    groupBy(`${TABLE_PREFIX}-users`, 'authType'),
    groupBy(`${TABLE_PREFIX}-revisions`, 'type')
  ]);
  console.log(`  markers: ${marker.reduce((a, e) => a + e.count, 0)}, metadata: ${metadata.reduce((a, e) => a + e.count, 0)}, users: ${user.reduce((a, e) => a + e.count, 0)}, revisions: ${revision.reduce((a, e) => a + e.count, 0)}`);

  const [threads, comments] = await Promise.all([
    boardGroup('discussion', 'forum_id'),
    boardGroup('opinion', 'forum_id')
  ]);
  console.log(`  threads: ${threads.reduce((a, e) => a + e.count, 0)}, comments: ${comments.reduce((a, e) => a + e.count, 0)}`);

  // Entity metadata count
  const entityIds = ['ruler', 'culture', 'religion', 'religionGeneral'];
  const { Responses } = await dynamo.send(new BatchGetCommand({
    RequestItems: { [`${TABLE_PREFIX}-metadata`]: { Keys: entityIds.map(_id => ({ _id })) } }
  }));
  const entityItems = Responses?.[`${TABLE_PREFIX}-metadata`] || [];
  let entityCount = 0;
  for (const item of entityItems) {
    if (item.data && typeof item.data === 'object' && !Buffer.isBuffer(item.data) && !(item.data instanceof Uint8Array)) {
      entityCount += Object.keys(item.data).length;
    }
  }
  console.log(`  entityMetadataCount: ${entityCount}`);

  const stats = {
    area: { provinces: 2479, areaDatapoints: 49580000 },
    marker, markerTotal: marker.reduce((a, e) => a + e.count, 0),
    metadata, metadataTotal: metadata.reduce((a, e) => a + e.count, 0),
    metadataI: metaI,
    user, userTotal: user.reduce((a, e) => a + e.count, 0),
    revision, revisionTotal: revision.reduce((a, e) => a + e.count, 0),
    threads, threadsTotal: threads.reduce((a, e) => a + e.count, 0),
    comments, commentsTotal: comments.reduce((a, e) => a + e.count, 0),
    metadataEntityCount: entityCount,
    _updatedAt: new Date().toISOString()
  };

  // Save locally
  writeFileSync('/tmp/statistics.json', JSON.stringify(stats, null, 2));
  console.log(`  Written to /tmp/statistics.json`);

  // Upload to S3
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: S3_KEY,
    Body: JSON.stringify(stats),
    ContentType: 'application/json'
  }));
  console.log(`  Uploaded to s3://${BUCKET}/${S3_KEY}`);
  console.log(`Done.`);
}

async function groupBy(table, field) {
  const counts = {};
  let next;
  do {
    const p = { TableName: table };
    if (next) p.ExclusiveStartKey = next;
    const o = await dynamo.send(new ScanCommand(p));
    for (const i of o.Items || []) {
      const k = i[field] ?? null;
      counts[k] = (counts[k] || 0) + 1;
    }
    next = o.LastEvaluatedKey;
  } while (next);
  return Object.entries(counts).map(([k, v]) => ({ _id: k === 'null' ? null : k, count: v }));
}

async function boardGroup(entityType, field) {
  const counts = {};
  let next;
  do {
    const p = {
      TableName: `${TABLE_PREFIX}-board`,
      FilterExpression: '#et = :et',
      ExpressionAttributeNames: { '#et': 'entityType' },
      ExpressionAttributeValues: { ':et': entityType }
    };
    if (next) p.ExclusiveStartKey = next;
    const o = await dynamo.send(new ScanCommand(p));
    for (const i of o.Items || []) {
      const k = i[field] ?? null;
      counts[k] = (counts[k] || 0) + 1;
    }
    next = o.LastEvaluatedKey;
  } while (next);
  return Object.entries(counts).map(([k, v]) => ({ _id: k === 'null' ? null : k, count: v }));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bucket') out.bucket = argv[++i];
    else if (argv[i] === '--key') out.key = argv[++i];
  }
  return out;
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
