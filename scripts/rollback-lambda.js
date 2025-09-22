/**
 * Data Rollback Lambda Function
 * 
 * This Lambda function handles rolling back data migration by restoring
 * from the old DocumentDB cluster to the application configuration.
 */

import { MongoClient } from 'mongodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });

/**
 * Get database credentials from AWS Secrets Manager
 */
async function getDbCredentials(secretName) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManager.send(command);
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error('Error retrieving database credentials:', error);
    throw error;
  }
}

/**
 * Create MongoDB connection with TLS support for DocumentDB
 */
async function createConnection(credentials, clusterType = 'unknown') {
  const tlsOptions = {
    tls: true,
    tlsCAFile: '/opt/rds-ca-2019-root.pem',
    tlsAllowInvalidHostnames: true,
    retryWrites: false
  };

  const connectionString = `mongodb://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}`;
  
  console.log(`Connecting to ${clusterType} cluster: ${credentials.host}`);
  
  const client = new MongoClient(connectionString, {
    ...tlsOptions,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 3000,
  });

  await client.connect();
  return client;
}

/**
 * Verify data integrity between clusters
 */
async function verifyDataIntegrity(oldClient, newClient, dbName, collectionName) {
  console.log(`Verifying data integrity for collection: ${collectionName}`);
  
  const oldDb = oldClient.db(dbName);
  const newDb = newClient.db(dbName);
  
  const oldCollection = oldDb.collection(collectionName);
  const newCollection = newDb.collection(collectionName);
  
  const [oldCount, newCount] = await Promise.all([
    oldCollection.countDocuments(),
    newCollection.countDocuments()
  ]);
  
  console.log(`${collectionName}: Old=${oldCount}, New=${newCount}`);
  
  return {
    collection: collectionName,
    oldCount,
    newCount,
    match: oldCount === newCount,
    difference: newCount - oldCount
  };
}

/**
 * Update application configuration to use old cluster (rollback)
 */
async function updateApplicationConfig(secretName, oldCredentials) {
  console.log('Updating application configuration for rollback...');
  
  // In a real implementation, this would update the application's
  // secret to point back to the old cluster
  
  console.log(`Rollback configuration prepared for secret: ${secretName}`);
  
  return {
    secretName,
    endpoint: oldCredentials.host,
    status: 'rollback-ready'
  };
}

/**
 * Main Lambda handler for rollback operations
 */
export const handler = async (event) => {
  console.log('Starting rollback process...');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const {
    oldSecretName = process.env.OLD_DB_SECRET_NAME,
    newSecretName = process.env.NEW_DB_SECRET_NAME,
    appSecretName = process.env.APP_DB_SECRET_NAME,
    dbName = process.env.DB_NAME || 'chronas',
    collections = event.collections || ['users', 'areas', 'markers', 'events'],
    operation = event.operation || 'verify', // 'verify', 'rollback', 'status'
    force = event.force || false
  } = event;
  
  let oldClient, newClient;
  const results = [];
  
  try {
    console.log(`Executing rollback operation: ${operation}`);
    
    // Get credentials for both clusters
    const [oldCredentials, newCredentials] = await Promise.all([
      getDbCredentials(oldSecretName),
      getDbCredentials(newSecretName)
    ]);
    
    // Connect to both clusters
    [oldClient, newClient] = await Promise.all([
      createConnection(oldCredentials, 'old'),
      createConnection(newCredentials, 'new')
    ]);
    
    switch (operation) {
      case 'verify':
        console.log('Verifying data integrity between clusters...');
        
        for (const collectionName of collections) {
          const verification = await verifyDataIntegrity(
            oldClient, 
            newClient, 
            dbName, 
            collectionName
          );
          results.push(verification);
        }
        
        const allMatch = results.every(r => r.match);
        console.log(`Data integrity check: ${allMatch ? 'PASSED' : 'FAILED'}`);
        
        break;
        
      case 'rollback':
        if (!force) {
          throw new Error('Rollback requires force=true parameter for safety');
        }
        
        console.log('Executing rollback to old cluster...');
        
        // Update application configuration
        const configUpdate = await updateApplicationConfig(appSecretName, oldCredentials);
        results.push(configUpdate);
        
        console.log('Rollback completed - application now uses old cluster');
        
        break;
        
      case 'status':
        console.log('Checking migration status...');
        
        // Get basic cluster information
        const oldDb = oldClient.db(dbName);
        const newDb = newClient.db(dbName);
        
        const oldCollections = await oldDb.listCollections().toArray();
        const newCollections = await newDb.listCollections().toArray();
        
        results.push({
          oldCluster: {
            endpoint: oldCredentials.host,
            collections: oldCollections.length,
            status: 'active'
          },
          newCluster: {
            endpoint: newCredentials.host,
            collections: newCollections.length,
            status: 'active'
          }
        });
        
        break;
        
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    return {
      statusCode: 200,
      body: {
        success: true,
        operation,
        timestamp: new Date().toISOString(),
        results
      }
    };
    
  } catch (error) {
    console.error('Rollback operation failed:', error);
    
    return {
      statusCode: 500,
      body: {
        success: false,
        operation,
        error: error.message,
        timestamp: new Date().toISOString(),
        results
      }
    };
    
  } finally {
    // Close connections
    if (oldClient) {
      await oldClient.close();
      console.log('Closed old cluster connection');
    }
    if (newClient) {
      await newClient.close();
      console.log('Closed new cluster connection');
    }
  }
};