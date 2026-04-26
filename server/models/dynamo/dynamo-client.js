import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import debug from 'debug';

const debugLog = debug('chronas-api:dynamo');

let cachedClient = null;
let cachedDocClient = null;

export function getDynamoClient() {
  if (cachedClient) return cachedClient;

  const region = process.env.AWS_REGION || process.env.region || 'eu-west-1';
  cachedClient = new DynamoDBClient({
    region,
    maxAttempts: 3
  });
  debugLog('DynamoDBClient created (region=%s)', region);
  return cachedClient;
}

export function getDocClient() {
  if (cachedDocClient) return cachedDocClient;

  cachedDocClient = DynamoDBDocumentClient.from(getDynamoClient(), {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
      convertEmptyValues: false
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
