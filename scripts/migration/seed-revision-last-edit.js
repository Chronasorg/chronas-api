#!/usr/bin/env node
/**
 * One-time seed of the revisions summary item (`_id: '__stats__'`), which
 * `/v1/welcome` reads as `lastDataEdit`. Every revision the API saves keeps it
 * current; this sets the starting value from the newest existing revision.
 *
 * Scans the whole revisions table once (read units for its full size; a
 * projection does not lower them). Dry run unless called with --apply.
 *
 * Usage:
 *   AWS_PROFILE=chronas-prod node scripts/migration/seed-revision-last-edit.js
 *   AWS_PROFILE=chronas-prod node scripts/migration/seed-revision-last-edit.js --apply
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'eu-west-1';
const TABLE = 'chronas-revisions';
const STATS_ID = '__stats__';
const APPLY = process.argv.includes('--apply');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  let newest = null;
  let scanned = 0;
  let next;
  do {
    const out = await dynamo.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: '#id, #ts',
      ExpressionAttributeNames: { '#id': '_id', '#ts': 'timestamp' },
      ExclusiveStartKey: next
    }));
    for (const item of out.Items || []) {
      if (item._id === STATS_ID) continue;
      scanned++;
      if (typeof item.timestamp === 'string' && (newest === null || item.timestamp > newest)) newest = item.timestamp;
    }
    next = out.LastEvaluatedKey;
  } while (next);

  console.log(`Scanned ${scanned} revisions; newest timestamp: ${newest ?? 'none'}`);
  if (!newest) return;
  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to write it.');
    return;
  }
  try {
    await dynamo.send(new UpdateCommand({
      TableName: TABLE,
      Key: { _id: STATS_ID },
      UpdateExpression: 'SET lastEdit = :ts',
      ConditionExpression: 'attribute_not_exists(lastEdit) OR lastEdit < :ts',
      ExpressionAttributeValues: { ':ts': newest }
    }));
    console.log(`Wrote ${STATS_ID}.lastEdit = ${newest}`);
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
    console.log(`${STATS_ID}.lastEdit is already newer; left unchanged.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
