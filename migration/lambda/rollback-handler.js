/**
 * DocumentDB Rollback Lambda Handler
 * 
 * This Lambda function handles rollback operations to restore the system
 * to the previous state in case of migration failures or issues.
 */

import { MongoClient } from 'mongodb';
import AWS from 'aws-sdk';

// Configure AWS SDK
const secretsManager = new AWS.SecretsManager({
  region: process.env.AWS_REGION || 'eu-west-1'
});

const docdb = new AWS.DocDB({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Rollback configuration
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 1000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;

/**
 * Lambda handler for rollback operations
 */
export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('Starting DocumentDB rollback process');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  let sourceClient = null;
  let targetClient = null;
  
  try {
    // Parse event parameters
    const {
      rollbackType = 'connection_switch', // connection_switch, data_restore, cluster_restore
      sourceSecretName = process.env.SOURCE_SECRET_NAME, // Original cluster
      targetSecretName = process.env.TARGET_SECRET_NAME, // New cluster (to rollback from)
      backupSnapshotId = null,
      collections = ['areas', 'markers', 'users', 'metadata', 'collections', 'revisions', 'flags', 'games'],
      validateRollback = true,
      cleanupTarget = false
    } = event;
    
    console.log(`Rollback configuration:
      - Type: ${rollbackType}
      - Source Secret: ${sourceSecretName}
      - Target Secret: ${targetSecretName}
      - Backup Snapshot: ${backupSnapshotId || 'none'}
      - Collections: ${collections.join(', ')}
      - Validate: ${validateRollback}
      - Cleanup Target: ${cleanupTarget}
    `);
    
    // Initialize rollback results
    const rollbackResults = {
      startTime: new Date().toISOString(),
      rollbackType,
      collections: {},
      steps: [],
      errors: [],
      warnings: []
    };
    
    // Execute rollback based on type
    switch (rollbackType) {
      case 'connection_switch':
        await performConnectionSwitch(rollbackResults, sourceSecretName, targetSecretName);
        break;
        
      case 'data_restore':
        sourceClient = await createConnection(await getSecretValue(sourceSecretName), 'source');
        targetClient = await createConnection(await getSecretValue(targetSecretName), 'target');
        await performDataRestore(rollbackResults, sourceClient, targetClient, collections);
        break;
        
      case 'cluster_restore':
        await performClusterRestore(rollbackResults, backupSnapshotId, targetSecretName);
        break;
        
      default:
        throw new Error(`Unknown rollback type: ${rollbackType}`);
    }
    
    // Validate rollback if requested
    if (validateRollback && (rollbackType === 'data_restore' || rollbackType === 'cluster_restore')) {
      console.log('Validating rollback results...');
      const validationResult = await validateRollbackState(sourceClient, targetClient, collections);
      rollbackResults.validation = validationResult;
      
      if (!validationResult.success) {
        rollbackResults.warnings.push('Rollback validation found issues');
      }
    }
    
    // Cleanup target cluster if requested
    if (cleanupTarget && rollbackType !== 'cluster_restore') {
      console.log('Cleaning up target cluster...');
      await cleanupTargetCluster(targetClient, collections);
      rollbackResults.steps.push({
        step: 'cleanup_target',
        status: 'completed',
        timestamp: new Date().toISOString()
      });
    }
    
    // Calculate final statistics
    const endTime = Date.now();
    rollbackResults.endTime = new Date().toISOString();
    rollbackResults.totalDuration = endTime - startTime;
    rollbackResults.success = rollbackResults.errors.length === 0;
    
    console.log('\n=== Rollback Summary ===');
    console.log(`Type: ${rollbackType}`);
    console.log(`Steps completed: ${rollbackResults.steps.length}`);
    console.log(`Errors: ${rollbackResults.errors.length}`);
    console.log(`Warnings: ${rollbackResults.warnings.length}`);
    console.log(`Duration: ${rollbackResults.totalDuration}ms`);
    console.log(`Success: ${rollbackResults.success}`);
    
    return {
      statusCode: rollbackResults.success ? 200 : 500,
      body: JSON.stringify(rollbackResults, null, 2)
    };
    
  } catch (error) {
    console.error('Rollback failed:', error);
    
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
  
  const useTLS = credentials.tls !== false && credentials.host.includes('docdb');
  
  const options = {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    maxPoolSize: 5,
    minPoolSize: 1,
  };
  
  if (useTLS) {
    options.tls = true;
    options.tlsCAFile = '/opt/rds-ca-2019-root.pem';
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
 * Perform connection switch rollback (simplest rollback)
 */
async function performConnectionSwitch(rollbackResults, sourceSecretName, targetSecretName) {
  console.log('Performing connection switch rollback...');
  
  try {
    // This rollback type just documents the switch back to original cluster
    // The actual connection switch happens at the application level
    
    rollbackResults.steps.push({
      step: 'connection_switch_preparation',
      status: 'completed',
      message: 'Prepared connection switch back to original cluster',
      sourceSecret: sourceSecretName,
      targetSecret: targetSecretName,
      timestamp: new Date().toISOString()
    });
    
    // Verify original cluster is accessible
    const sourceCredentials = await getSecretValue(sourceSecretName);
    const sourceClient = await createConnection(sourceCredentials, 'original');
    
    // Test connection
    const sourceDb = sourceClient.db('chronas');
    await sourceDb.command({ ping: 1 });
    
    await sourceClient.close();
    
    rollbackResults.steps.push({
      step: 'original_cluster_verification',
      status: 'completed',
      message: 'Original cluster is accessible and ready',
      timestamp: new Date().toISOString()
    });
    
    console.log('✓ Connection switch rollback prepared');
    
  } catch (error) {
    rollbackResults.errors.push({
      step: 'connection_switch',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Perform data restore rollback
 */
async function performDataRestore(rollbackResults, sourceClient, targetClient, collections) {
  console.log('Performing data restore rollback...');
  
  try {
    const sourceDb = sourceClient.db('chronas');
    const targetDb = targetClient.db('chronas');
    
    // Clear target collections first
    for (const collectionName of collections) {
      console.log(`Clearing target collection: ${collectionName}`);
      
      try {
        const targetCollection = targetDb.collection(collectionName);
        await targetCollection.deleteMany({});
        
        rollbackResults.steps.push({
          step: `clear_${collectionName}`,
          status: 'completed',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`Failed to clear collection ${collectionName}:`, error);
        rollbackResults.errors.push({
          step: `clear_${collectionName}`,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Restore data from source to target
    for (const collectionName of collections) {
      console.log(`Restoring collection: ${collectionName}`);
      
      try {
        const result = await restoreCollection(sourceClient, targetClient, collectionName);
        rollbackResults.collections[collectionName] = result;
        
        rollbackResults.steps.push({
          step: `restore_${collectionName}`,
          status: 'completed',
          documentsRestored: result.restoredCount,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`Failed to restore collection ${collectionName}:`, error);
        rollbackResults.errors.push({
          step: `restore_${collectionName}`,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    console.log('✓ Data restore rollback completed');
    
  } catch (error) {
    rollbackResults.errors.push({
      step: 'data_restore',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Perform cluster restore rollback
 */
async function performClusterRestore(rollbackResults, backupSnapshotId, targetSecretName) {
  console.log('Performing cluster restore rollback...');
  
  if (!backupSnapshotId) {
    throw new Error('Backup snapshot ID is required for cluster restore');
  }
  
  try {
    // Get target cluster identifier from secret
    const targetCredentials = await getSecretValue(targetSecretName);
    
    // Find the cluster identifier
    const clusters = await docdb.describeDBClusters().promise();
    const targetCluster = clusters.DBClusters.find(cluster => 
      cluster.Endpoint === targetCredentials.host
    );
    
    if (!targetCluster) {
      throw new Error('Target cluster not found');
    }
    
    console.log(`Restoring cluster ${targetCluster.DBClusterIdentifier} from snapshot ${backupSnapshotId}`);
    
    // Create a new cluster from the snapshot
    const restoreParams = {
      DBClusterIdentifier: `${targetCluster.DBClusterIdentifier}-restored-${Date.now()}`,
      SnapshotIdentifier: backupSnapshotId,
      Engine: 'docdb',
      EngineVersion: targetCluster.EngineVersion,
      DBSubnetGroupName: targetCluster.DBSubnetGroup,
      VpcSecurityGroupIds: targetCluster.VpcSecurityGroups.map(sg => sg.VpcSecurityGroupId)
    };
    
    const restoreResult = await docdb.restoreDBClusterFromSnapshot(restoreParams).promise();
    
    rollbackResults.steps.push({
      step: 'cluster_restore_initiated',
      status: 'in_progress',
      newClusterIdentifier: restoreParams.DBClusterIdentifier,
      snapshotId: backupSnapshotId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✓ Cluster restore initiated: ${restoreParams.DBClusterIdentifier}`);
    
    // Note: Cluster restore is asynchronous and takes time
    // The actual completion would need to be monitored separately
    
  } catch (error) {
    rollbackResults.errors.push({
      step: 'cluster_restore',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Restore a single collection
 */
async function restoreCollection(sourceClient, targetClient, collectionName) {
  const sourceDb = sourceClient.db('chronas');
  const targetDb = targetClient.db('chronas');
  
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  
  // Get source document count
  const sourceCount = await sourceCollection.countDocuments();
  console.log(`Restoring ${sourceCount} documents from ${collectionName}`);
  
  let restoredCount = 0;
  
  if (sourceCount > 0) {
    // Restore data in batches
    const cursor = sourceCollection.find({});
    let batch = [];
    
    for await (const document of cursor) {
      batch.push(document);
      
      if (batch.length >= BATCH_SIZE) {
        await insertBatchWithRetry(targetCollection, batch, collectionName);
        restoredCount += batch.length;
        console.log(`Restored ${restoredCount}/${sourceCount} documents for ${collectionName}`);
        batch = [];
      }
    }
    
    // Insert remaining documents
    if (batch.length > 0) {
      await insertBatchWithRetry(targetCollection, batch, collectionName);
      restoredCount += batch.length;
    }
    
    // Restore indexes
    const indexes = await sourceCollection.listIndexes().toArray();
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          await targetCollection.createIndex(index.key, {
            name: index.name,
            background: true
          });
        } catch (error) {
          if (error.code !== 85) { // Index already exists
            console.warn(`Failed to restore index ${index.name}:`, error.message);
          }
        }
      }
    }
  }
  
  return {
    sourceCount,
    restoredCount,
    success: restoredCount === sourceCount
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
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
}

/**
 * Validate rollback state
 */
async function validateRollbackState(sourceClient, targetClient, collections) {
  console.log('Validating rollback state...');
  
  const validation = {
    success: true,
    collections: {},
    totalSourceDocs: 0,
    totalTargetDocs: 0
  };
  
  const sourceDb = sourceClient.db('chronas');
  const targetDb = targetClient.db('chronas');
  
  for (const collectionName of collections) {
    try {
      const sourceCollection = sourceDb.collection(collectionName);
      const targetCollection = targetDb.collection(collectionName);
      
      const sourceCount = await sourceCollection.countDocuments();
      const targetCount = await targetCollection.countDocuments();
      
      const match = sourceCount === targetCount;
      
      validation.collections[collectionName] = {
        sourceCount,
        targetCount,
        match
      };
      
      validation.totalSourceDocs += sourceCount;
      validation.totalTargetDocs += targetCount;
      
      if (!match) {
        validation.success = false;
        console.error(`Rollback validation failed for ${collectionName}: source=${sourceCount}, target=${targetCount}`);
      }
      
    } catch (error) {
      validation.success = false;
      validation.collections[collectionName] = {
        error: error.message
      };
    }
  }
  
  console.log(`Rollback validation: ${validation.success ? 'PASSED' : 'FAILED'}`);
  return validation;
}

/**
 * Cleanup target cluster
 */
async function cleanupTargetCluster(targetClient, collections) {
  console.log('Cleaning up target cluster...');
  
  const targetDb = targetClient.db('chronas');
  
  for (const collectionName of collections) {
    try {
      const collection = targetDb.collection(collectionName);
      await collection.drop();
      console.log(`✓ Dropped collection: ${collectionName}`);
    } catch (error) {
      if (error.code !== 26) { // Collection doesn't exist
        console.warn(`Failed to drop collection ${collectionName}:`, error.message);
      }
    }
  }
  
  console.log('✓ Target cluster cleanup completed');
}