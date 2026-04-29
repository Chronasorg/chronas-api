/**
 * DynamoDB Local test helper using dynalite (pure Node.js, no Java).
 *
 * Usage in test files:
 *   import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from './helpers/dynamodb-local.js';
 *
 *   before(async function () { this.timeout(10000); await setupDynamoLocal(); });
 *   after(async () => teardownDynamoLocal());
 *
 * This starts dynalite on a random port, configures dynamo-client.js to
 * talk to it (via env var), creates all tables, and exposes seed/clear
 * helpers for loading fixture data.
 */

import dynalite from 'dynalite';
import { CreateTableCommand, DeleteTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

let server = null;
let port = null;

const TABLE_DEFS = await loadTableDefs();

export async function setupDynamoLocal() {
  server = dynalite({ createTableMs: 0, updateTableMs: 0, deleteTableMs: 0 });
  await new Promise((resolve, reject) => {
    server.listen(0, (err) => {
      if (err) return reject(err);
      port = server.address().port;
      process.env.DYNAMODB_ENDPOINT = `http://localhost:${port}`;
      process.env.AWS_ACCESS_KEY_ID = 'fakeAccessKeyId';
      process.env.AWS_SECRET_ACCESS_KEY = 'fakeSecretAccessKey';
      process.env.AWS_REGION = 'eu-west-1';
      resolve();
    });
  });

  // Force dynamo-client.js to pick up the local endpoint by clearing its cache.
  // We dynamically patch the client creation.
  await patchDynamoClient();
  await createAllTables();
}

export async function teardownDynamoLocal() {
  if (server) {
    await new Promise(resolve => server.close(resolve));
    server = null;
    delete process.env.DYNAMODB_ENDPOINT;
  }
}

async function patchDynamoClient() {
  // Re-import dynamo-client and reset cached clients so they
  // reconnect to the local endpoint.
  const mod = await import('../../models/dynamo/dynamo-client.js');

  // The module caches clients — we need to force recreation.
  // Since we can't easily reset module-level `let` vars from outside,
  // we'll create a fresh DynamoDB client pointed at dynalite and
  // replace the exported functions.
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');

  const rawClient = new DynamoDBClient({
    region: 'eu-west-1',
    endpoint: `http://localhost:${port}`,
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' }
  });

  const docClient = DynamoDBDocumentClient.from(rawClient, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
    unmarshallOptions: { wrapNumbers: false }
  });

  // Monkey-patch the module's exported functions to return our local clients.
  // This works because ESM named exports are live bindings from the module
  // namespace, but the functions close over module-level `let` vars.
  // Instead of fighting that, we'll override via a global that dynamo-client
  // can check.
  globalThis.__TEST_DYNAMO_DOC_CLIENT = docClient;
  globalThis.__TEST_DYNAMO_RAW_CLIENT = rawClient;
}

export function getTestDocClient() {
  return globalThis.__TEST_DYNAMO_DOC_CLIENT;
}

export function getTestRawClient() {
  return globalThis.__TEST_DYNAMO_RAW_CLIENT;
}

async function createAllTables() {
  const client = globalThis.__TEST_DYNAMO_RAW_CLIENT;
  for (const def of TABLE_DEFS) {
    try {
      await client.send(new CreateTableCommand(def));
    } catch (err) {
      if (err.name !== 'ResourceInUseException') throw err;
    }
  }
}

export async function clearTable(tableName) {
  const docClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
  const def = TABLE_DEFS.find(d => d.TableName === tableName);
  if (!def) return;
  const keyAttrs = def.KeySchema.map(k => k.AttributeName);
  let next;
  do {
    const params = { TableName: tableName, ProjectionExpression: keyAttrs.map((_, i) => `#k${i}`).join(', '), ExpressionAttributeNames: Object.fromEntries(keyAttrs.map((k, i) => [`#k${i}`, k])) };
    if (next) params.ExclusiveStartKey = next;
    const { ScanCommand: SC } = await import('@aws-sdk/lib-dynamodb');
    const out = await docClient.send(new SC(params));
    if (out.Items && out.Items.length > 0) {
      const chunks = [];
      for (let i = 0; i < out.Items.length; i += 25) chunks.push(out.Items.slice(i, i + 25));
      for (const chunk of chunks) {
        await docClient.send(new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map(item => ({ DeleteRequest: { Key: item } }))
          }
        }));
      }
    }
    next = out.LastEvaluatedKey;
  } while (next);
}

export async function seedTable(tableName, items) {
  if (!items || items.length === 0) return;
  const docClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map(item => ({ PutRequest: { Item: item } }))
      }
    }));
  }
}

async function loadTableDefs() {
  const prefix = process.env.DYNAMODB_TABLE_PREFIX || 'chronas';
  return [
    {
      TableName: `${prefix}-areas`,
      AttributeDefinitions: [{ AttributeName: '_id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      TableName: `${prefix}-markers`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: 'type', AttributeType: 'S' },
        { AttributeName: 'year', AttributeType: 'N' },
        { AttributeName: 'partOf', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-TypeYear', KeySchema: [{ AttributeName: 'type', KeyType: 'HASH' }, { AttributeName: 'year', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
        { IndexName: 'GSI-PartOf', KeySchema: [{ AttributeName: 'partOf', KeyType: 'HASH' }, { AttributeName: 'year', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-metadata`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: 'type', AttributeType: 'S' },
        { AttributeName: 'subtype', AttributeType: 'S' },
        { AttributeName: 'year', AttributeType: 'N' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-TypeSubtype', KeySchema: [{ AttributeName: 'type', KeyType: 'HASH' }, { AttributeName: 'subtype', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
        { IndexName: 'GSI-SubtypeYear', KeySchema: [{ AttributeName: 'subtype', KeyType: 'HASH' }, { AttributeName: 'year', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-links`,
      AttributeDefinitions: [{ AttributeName: 'entityRef', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'entityRef', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST'
    },
    {
      TableName: `${prefix}-users`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: 'username', AttributeType: 'S' },
        { AttributeName: '_entity', AttributeType: 'S' },
        { AttributeName: 'karma', AttributeType: 'N' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-Username', KeySchema: [{ AttributeName: 'username', KeyType: 'HASH' }], Projection: { ProjectionType: 'ALL' } },
        { IndexName: 'GSI-Karma', KeySchema: [{ AttributeName: '_entity', KeyType: 'HASH' }, { AttributeName: 'karma', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-revisions`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: 'entityId', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'S' },
        { AttributeName: 'user', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-EntityTimestamp', KeySchema: [{ AttributeName: 'entityId', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
        { IndexName: 'GSI-UserTimestamp', KeySchema: [{ AttributeName: 'user', KeyType: 'HASH' }, { AttributeName: 'timestamp', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-flags`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: 'fullUrl', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-FullUrl', KeySchema: [{ AttributeName: 'fullUrl', KeyType: 'HASH' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-collections`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: 'owner', AttributeType: 'S' },
        { AttributeName: 'title', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-OwnerTitle', KeySchema: [{ AttributeName: 'owner', KeyType: 'HASH' }, { AttributeName: 'title', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-games`,
      AttributeDefinitions: [
        { AttributeName: '_id', AttributeType: 'S' },
        { AttributeName: '_entity', AttributeType: 'S' },
        { AttributeName: 'identified', AttributeType: 'N' }
      ],
      KeySchema: [{ AttributeName: '_id', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-Highscore', KeySchema: [{ AttributeName: '_entity', KeyType: 'HASH' }, { AttributeName: 'identified', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    },
    {
      TableName: `${prefix}-board`,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'qa_id', AttributeType: 'S' },
        { AttributeName: 'date', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
      BillingMode: 'PAY_PER_REQUEST',
      GlobalSecondaryIndexes: [
        { IndexName: 'GSI-QA', KeySchema: [{ AttributeName: 'qa_id', KeyType: 'HASH' }, { AttributeName: 'date', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } }
      ]
    }
  ];
}
