import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import debug from 'debug';

const debugLog = debug('chronas-api:dynamo');

let cachedClient = null;
let cachedDocClient = null;

export function getDynamoClient() {
  if (globalThis.__TEST_DYNAMO_RAW_CLIENT) return globalThis.__TEST_DYNAMO_RAW_CLIENT;
  if (cachedClient) return cachedClient;

  const region = process.env.AWS_REGION || process.env.region || 'eu-west-1';
  // A call that stalls fails after 5 s and is retried: worst case about 15 s,
  // inside the Web Function's 25 s request timeout. Without
  // throwOnRequestTimeout the SDK's requestTimeout only logs a warning. A
  // Scan page is at most 1 MB, so healthy calls are far faster.
  const opts = {
    region,
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 5000, throwOnRequestTimeout: true }
  };
  if (process.env.DYNAMODB_ENDPOINT) opts.endpoint = process.env.DYNAMODB_ENDPOINT;
  cachedClient = new DynamoDBClient(opts);
  debugLog('DynamoDBClient created (region=%s, endpoint=%s)', region, opts.endpoint || 'default');
  return cachedClient;
}

export function getDocClient() {
  if (globalThis.__TEST_DYNAMO_DOC_CLIENT) return globalThis.__TEST_DYNAMO_DOC_CLIENT;
  if (cachedDocClient) return cachedDocClient;

  cachedDocClient = DynamoDBDocumentClient.from(getDynamoClient(), {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
      convertEmptyValues: true
    },
    unmarshallOptions: {
      wrapNumbers: false
    }
  });
  debugLog('DynamoDBDocumentClient created');
  return cachedDocClient;
}

export const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || 'chronas';

export function tableName(suffix) {
  return `${TABLE_PREFIX}-${suffix}`;
}

/**
 * DynamoDB rejects a partition key over 2048 bytes with a ValidationException,
 * so no item can have one: findById answers null (a 404) without the call.
 */
export function isPossibleKey(id) {
  return Buffer.byteLength(String(id)) <= 2048;
}

/**
 * BatchGetItem with automatic retry for UnprocessedKeys.
 * DynamoDB may return partial results under throttling.
 */
export async function batchGetWithRetry(params, maxRetries = 3) {
  const { BatchGetCommand } = await import('@aws-sdk/lib-dynamodb');
  const client = getDocClient();
  const allItems = {};
  let request = params.RequestItems;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await client.send(new BatchGetCommand({ RequestItems: request }));
    for (const [table, items] of Object.entries(result.Responses || {})) {
      if (!allItems[table]) allItems[table] = [];
      allItems[table].push(...items);
    }
    if (!result.UnprocessedKeys || Object.keys(result.UnprocessedKeys).length === 0) break;
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
      request = result.UnprocessedKeys;
    }
  }
  return { Responses: allItems };
}
