/**
 * DocumentDB Data Migration Lambda Handler
 * 
 * This Lambda function handles the migration of data from the old DocumentDB cluster
 * to the new modernized cluster with comprehensive validation and error handling.
 */

import { MongoClient } from 'mongodb';
import AWS from 'aws-sdk';

// Configure AWS SDK
const secretsManager = new AWS.SecretsManager({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Migration configuration
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 1000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY) || 1000;

// Collections to migrate in order (dependencies first)
const MIGRATION_ORDER = [
  'users',        // Independent collection
  'metadata',     // Referenced by other collections
  'areas',        // Historical data
  'markers',      // References metadata
  'collections',  // User-created content
  'revisions',    // Version history
  'flags',        // Content flags
  'games'         // Game data
];

/**
 * Lambda handler for data migration
 */
export const handler = async (event, context) => {
  // Prevent Lambda from waiting for empty event loop
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('Starting DocumentDB migration process');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  let sourceClient = null;
  let targetClient = null;
  
  try {
    // Parse event parameters
    const {
      sourceSecretName = process.env.SOURCE_SECRET_NAME,
      targetSecretName = process.env.TARGET_SECRET_NAME,
      collections = MIGRATION_ORDER,
      dryRun = false,
      skipValidation = false,
      continueOnError = false
    } = event;
    
    if (!sourceSecretName || !targetSecretName) {
      throw new Error('Source and target secret names are required');
    }
    
    console.log(`Migration configuration:
      - Source Secret: ${sourceSecretName}
      - Target Secret: ${targetSecretName}
      - Collections: ${collections.join(', ')}
      - Dry Run: ${dryRun}
      - Skip Validation: ${skipValidation}
      - Continue on Error: ${continueOnError}
    `);
    
    // Get database credentials
    const [sourceCredentials, targetCredentials] = await Promise.all([
      getSecretValue(sourceSecretName),
      getSecretValue(targetSecretName)
    ]);
    
    // Create database connections
    sourceClient = await createConnection(sourceCredentials, 'source');
    targetClient = await createConnection(targetCredentials, 'target');
    
    // Validate connections
    await validateConnections(sourceClient, targetClient);
    
    // Initialize migration results
    const migrationResults = {
      startTime: new Date().toISOString(),
      collections: {},
      totalDocuments: 0,
      totalMigrated: 0,
      errors: [],
      warnings: [],
      dryRun
    };
    
    // Migrate each collection
    for (const collectionName of collections) {
      console.log(`\n=== Migrating collection: ${collectionName} ===`);
      
      try {
        const result = await migrateCollection(
          sourceClient,
          targetClient,
          collectionName,
          { dryRun, skipValidation, continueOnError }
        );
        
        migrationResults.collections[collectionName] = result;
        migrationResults.totalDocuments += result.sourceCount;
        migrationResults.totalMigrated += result.migratedCount;
        
        console.log(`Collection ${collectionName} migration completed:
          - Source documents: ${result.sourceCount}
          - Migrated documents: ${result.migratedCount}
          - Indexes migrated: ${result.indexesMigrated}
          - Duration: ${result.duration}ms
        `);
        
      } catch (error) {
        const errorMsg = `Failed to migrate collection ${collectionName}: ${error.message}`;
        console.error(errorMsg);
        
        migrationResults.errors.push({
          collection: collectionName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        if (!continueOnError) {
          throw new Error(errorMsg);
        }
      }
    }
    
    // Final validation if not skipped
    if (!skipValidation && !dryRun) {
      console.log('\n=== Running final validation ===');
      const validationResults = await validateMigration(sourceClient, targetClient, collections);
      migrationResults.validation = validationResults;
      
      if (!validationResults.success) {
        migrationResults.warnings.push('Migration validation found discrepancies');
      }
    }
    
    // Calculate final statistics
    const endTime = Date.now();
    migrationResults.endTime = new Date().toISOString();
    migrationResults.totalDuration = endTime - startTime;
    migrationResults.success = migrationResults.errors.length === 0;
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total collections: ${collections.length}`);
    console.log(`Total documents: ${migrationResults.totalDocuments}`);
    console.log(`Total migrated: ${migrationResults.totalMigrated}`);
    console.log(`Errors: ${migrationResults.errors.length}`);
    console.log(`Warnings: ${migrationResults.warnings.length}`);
    console.log(`Duration: ${migrationResults.totalDuration}ms`);
    console.log(`Success: ${migrationResults.success}`);
    
    return {
      statusCode: migrationResults.success ? 200 : 500,
      body: JSON.stringify(migrationResults, null, 2)
    };
    
  } catch (error) {
    console.error('Migration failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }, null, 2)
    };
    
  } finally {
    // Clean up connections
    if (sourceClient) {
      try {
        await sourceClient.close();
        console.log('Source connection closed');
      } catch (error) {
        console.error('Error closing source connection:', error);
      }
    }
    
    if (targetClient) {
      try {
        await targetClient.close();
        console.log('Target connection closed');
      } catch (error) {
        console.error('Error closing target connection:', error);
      }
    }
  }
};

/**
 * Get secret value from AWS Secrets Manager
 */
async function getSecretValue(secretName) {
  console.log(`Retrieving secret: ${secretName}`);
  
  try {
    const result = await secretsManager.getSecretValue({
      SecretId: secretName
    }).promise();
    
    if (!result.SecretString) {
      throw new Error('SecretString not found');
    }
    
    const credentials = JSON.parse(result.SecretString);
    
    if (!credentials.host || !credentials.username || !credentials.password) {
      throw new Error('Invalid credentials format');
    }
    
    console.log(`Retrieved credentials for host: ${credentials.host}`);
    return credentials;
    
  } catch (error) {
    console.error(`Failed to retrieve secret ${secretName}:`, error);
    throw error;
  }
}

/**
 * Create MongoDB connection
 */
async function createConnection(credentials, label) {
  console.log(`Creating ${label} connection to ${credentials.host}:${credentials.port || 27017}`);
  
  const connectionString = `mongodb://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port || 27017}/chronas?replicaSet=rs0&retryWrites=false`;
  
  // Determine if TLS is needed based on credentials or environment
  const useTLS = credentials.tls !== false && credentials.host.includes('docdb');
  
  const options = {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    heartbeatFrequencyMS: 10000,
  };
  
  if (useTLS) {
    options.tls = true;
    options.tlsCAFile = '/opt/rds-ca-2019-root.pem';
    options.tlsAllowInvalidHostnames = false;
    options.tlsAllowInvalidCertificates = false;
  }
  
  const client = new MongoClient(connectionString, options);
  
  try {
    await client.connect();
    console.log(`✓ ${label} connection established`);
    return client;
  } catch (error) {
    console.error(`Failed to connect to ${label} database:`, error);
    throw error;
  }
}

/**
 * Validate database connections
 */
async function validateConnections(sourceClient, targetClient) {
  console.log('Validating database connections...');
  
  try {
    // Test source connection
    const sourceDb = sourceClient.db('chronas');
    await sourceDb.command({ ping: 1 });
    console.log('✓ Source database connection validated');
    
    // Test target connection
    const targetDb = targetClient.db('chronas');
    await targetDb.command({ ping: 1 });
    console.log('✓ Target database connection validated');
    
  } catch (error) {
    console.error('Connection validation failed:', error);
    throw error;
  }
}

/**
 * Migrate a single collection
 */
async function migrateCollection(sourceClient, targetClient, collectionName, options = {}) {
  const { dryRun = false, skipValidation = false } = options;
  const startTime = Date.now();
  
  console.log(`Starting migration of collection: ${collectionName}`);
  
  const sourceDb = sourceClient.db('chronas');
  const targetDb = targetClient.db('chronas');
  
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  
  // Get source collection stats
  const sourceCount = await sourceCollection.countDocuments();
  console.log(`Source collection ${collectionName} has ${sourceCount} documents`);
  
  if (sourceCount === 0) {
    console.log(`Collection ${collectionName} is empty, skipping data migration`);
    
    // Still migrate indexes for empty collections
    const indexesMigrated = await migrateIndexes(sourceCollection, targetCollection, dryRun);
    
    return {
      sourceCount: 0,
      migratedCount: 0,
      indexesMigrated,
      duration: Date.now() - startTime,
      batches: 0
    };
  }
  
  let migratedCount = 0;
  let batchCount = 0;
  
  if (!dryRun) {
    // Migrate data in batches
    const cursor = sourceCollection.find({});
    let batch = [];
    
    for await (const document of cursor) {
      batch.push(document);
      
      if (batch.length >= BATCH_SIZE) {
        await insertBatchWithRetry(targetCollection, batch, collectionName);
        migratedCount += batch.length;
        batchCount++;
        
        console.log(`Migrated batch ${batchCount} for ${collectionName}: ${migratedCount}/${sourceCount} documents`);
        batch = [];
      }
    }
    
    // Insert remaining documents
    if (batch.length > 0) {
      await insertBatchWithRetry(targetCollection, batch, collectionName);
      migratedCount += batch.length;
      batchCount++;
      console.log(`Migrated final batch for ${collectionName}: ${migratedCount}/${sourceCount} documents`);
    }
  } else {
    console.log(`DRY RUN: Would migrate ${sourceCount} documents from ${collectionName}`);
    migratedCount = sourceCount; // For reporting purposes
  }
  
  // Migrate indexes
  const indexesMigrated = await migrateIndexes(sourceCollection, targetCollection, dryRun);
  
  // Validate migration if not skipped
  if (!skipValidation && !dryRun) {
    const targetCount = await targetCollection.countDocuments();
    if (targetCount !== sourceCount) {
      throw new Error(`Document count mismatch: source=${sourceCount}, target=${targetCount}`);
    }
    console.log(`✓ Document count validation passed for ${collectionName}`);
  }
  
  const duration = Date.now() - startTime;
  console.log(`Collection ${collectionName} migration completed in ${duration}ms`);
  
  return {
    sourceCount,
    migratedCount,
    indexesMigrated,
    duration,
    batches: batchCount
  };
}

/**
 * Insert batch with retry logic
 */
async function insertBatchWithRetry(collection, batch, collectionName) {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      await collection.insertMany(batch, { 
        ordered: false,
        writeConcern: { w: 'majority', j: true }
      });
      return;
      
    } catch (error) {
      retries++;
      console.warn(`Batch insert failed for ${collectionName} (attempt ${retries}/${MAX_RETRIES}):`, error.message);
      
      if (retries >= MAX_RETRIES) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
    }
  }
}

/**
 * Migrate indexes from source to target collection
 */
async function migrateIndexes(sourceCollection, targetCollection, dryRun = false) {
  console.log(`Migrating indexes for collection: ${sourceCollection.collectionName}`);
  
  try {
    const indexes = await sourceCollection.listIndexes().toArray();
    let migratedCount = 0;
    
    for (const index of indexes) {
      // Skip the default _id index
      if (index.name === '_id_') {
        continue;
      }
      
      console.log(`Migrating index: ${index.name}`);
      
      if (!dryRun) {
        try {
          const indexSpec = index.key;
          const options = {
            name: index.name,
            background: true,
          };
          
          // Copy index options
          if (index.unique) options.unique = true;
          if (index.sparse) options.sparse = true;
          if (index.partialFilterExpression) options.partialFilterExpression = index.partialFilterExpression;
          if (index.expireAfterSeconds !== undefined) options.expireAfterSeconds = index.expireAfterSeconds;
          
          await targetCollection.createIndex(indexSpec, options);
          console.log(`✓ Created index: ${index.name}`);
          migratedCount++;
          
        } catch (error) {
          if (error.code === 85) { // Index already exists
            console.log(`Index ${index.name} already exists, skipping`);
            migratedCount++;
          } else {
            console.error(`Failed to create index ${index.name}:`, error.message);
            throw error;
          }
        }
      } else {
        console.log(`DRY RUN: Would create index ${index.name}`);
        migratedCount++;
      }
    }
    
    console.log(`✓ Migrated ${migratedCount} indexes for ${sourceCollection.collectionName}`);
    return migratedCount;
    
  } catch (error) {
    console.error(`Failed to migrate indexes for ${sourceCollection.collectionName}:`, error);
    throw error;
  }
}

/**
 * Validate migration results
 */
async function validateMigration(sourceClient, targetClient, collections) {
  console.log('Validating migration results...');
  
  const sourceDb = sourceClient.db('chronas');
  const targetDb = targetClient.db('chronas');
  
  const results = {
    success: true,
    collections: {},
    totalSourceDocs: 0,
    totalTargetDocs: 0
  };
  
  for (const collectionName of collections) {
    try {
      const sourceCollection = sourceDb.collection(collectionName);
      const targetCollection = targetDb.collection(collectionName);
      
      const sourceCount = await sourceCollection.countDocuments();
      const targetCount = await targetCollection.countDocuments();
      
      const collectionResult = {
        sourceCount,
        targetCount,
        match: sourceCount === targetCount
      };
      
      if (!collectionResult.match) {
        results.success = false;
        console.error(`Validation failed for ${collectionName}: source=${sourceCount}, target=${targetCount}`);
      } else {
        console.log(`✓ Validation passed for ${collectionName}: ${sourceCount} documents`);
      }
      
      results.collections[collectionName] = collectionResult;
      results.totalSourceDocs += sourceCount;
      results.totalTargetDocs += targetCount;
      
    } catch (error) {
      console.error(`Validation error for ${collectionName}:`, error);
      results.success = false;
      results.collections[collectionName] = {
        error: error.message
      };
    }
  }
  
  console.log(`Migration validation: ${results.success ? 'PASSED' : 'FAILED'}`);
  console.log(`Total documents - Source: ${results.totalSourceDocs}, Target: ${results.totalTargetDocs}`);
  
  return results;
}