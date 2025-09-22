/**
 * Data Migration Lambda Function
 * 
 * This Lambda function handles the migration of data from the old DocumentDB cluster
 * to the new modernized DocumentDB 5.0 cluster.
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
async function createConnection(credentials, isNewCluster = false) {
  const tlsOptions = {
    tls: true,
    tlsCAFile: '/opt/rds-ca-2019-root.pem', // DocumentDB certificate
    tlsAllowInvalidHostnames: true,
    retryWrites: false
  };

  const connectionString = `mongodb://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}`;
  
  console.log(`Connecting to ${isNewCluster ? 'new' : 'old'} cluster: ${credentials.host}`);
  
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
 * Migrate a collection from old to new cluster
 */
async function migrateCollection(oldClient, newClient, dbName, collectionName, batchSize = 1000) {
  console.log(`Starting migration of collection: ${collectionName}`);
  
  const oldDb = oldClient.db(dbName);
  const newDb = newClient.db(dbName);
  
  const oldCollection = oldDb.collection(collectionName);
  const newCollection = newDb.collection(collectionName);
  
  // Get total document count
  const totalDocs = await oldCollection.countDocuments();
  console.log(`Total documents to migrate: ${totalDocs}`);
  
  let migratedCount = 0;
  let skip = 0;
  
  while (skip < totalDocs) {
    try {
      // Fetch batch from old cluster
      const documents = await oldCollection
        .find({})
        .skip(skip)
        .limit(batchSize)
        .toArray();
      
      if (documents.length === 0) break;
      
      // Insert batch into new cluster
      if (documents.length > 0) {
        await newCollection.insertMany(documents, { ordered: false });
        migratedCount += documents.length;
        
        console.log(`Migrated ${migratedCount}/${totalDocs} documents (${Math.round(migratedCount/totalDocs*100)}%)`);
      }
      
      skip += batchSize;
      
    } catch (error) {
      console.error(`Error migrating batch at skip ${skip}:`, error);
      
      // For duplicate key errors, continue (documents already exist)
      if (error.code === 11000) {
        console.log('Duplicate documents found, continuing...');
        skip += batchSize;
        continue;
      }
      
      throw error;
    }
  }
  
  // Verify migration
  const newCount = await newCollection.countDocuments();
  console.log(`Migration complete. Old: ${totalDocs}, New: ${newCount}`);
  
  return {
    collection: collectionName,
    originalCount: totalDocs,
    migratedCount: newCount,
    success: newCount >= totalDocs
  };
}

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  console.log('Starting data migration process...');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const {
    oldSecretName = process.env.OLD_DB_SECRET_NAME,
    newSecretName = process.env.NEW_DB_SECRET_NAME,
    dbName = process.env.DB_NAME || 'chronas',
    collections = event.collections || ['users', 'areas', 'markers', 'events'],
    batchSize = event.batchSize || 1000,
    dryRun = event.dryRun || false
  } = event;
  
  let oldClient, newClient;
  const results = [];
  
  try {
    // Get credentials for both clusters
    console.log('Retrieving database credentials...');
    const [oldCredentials, newCredentials] = await Promise.all([
      getDbCredentials(oldSecretName),
      getDbCredentials(newSecretName)
    ]);
    
    // Connect to both clusters
    console.log('Establishing database connections...');
    [oldClient, newClient] = await Promise.all([
      createConnection(oldCredentials, false),
      createConnection(newCredentials, true)
    ]);
    
    console.log('Connected to both clusters successfully');
    
    if (dryRun) {
      console.log('DRY RUN MODE - No data will be migrated');
      
      // Just count documents in each collection
      for (const collectionName of collections) {
        const oldDb = oldClient.db(dbName);
        const oldCollection = oldDb.collection(collectionName);
        const count = await oldCollection.countDocuments();
        
        results.push({
          collection: collectionName,
          documentCount: count,
          dryRun: true
        });
        
        console.log(`Collection ${collectionName}: ${count} documents`);
      }
    } else {
      // Perform actual migration
      for (const collectionName of collections) {
        console.log(`\n--- Migrating ${collectionName} ---`);
        
        const result = await migrateCollection(
          oldClient, 
          newClient, 
          dbName, 
          collectionName, 
          batchSize
        );
        
        results.push(result);
      }
    }
    
    // Summary
    const totalOriginal = results.reduce((sum, r) => sum + (r.originalCount || r.documentCount || 0), 0);
    const totalMigrated = results.reduce((sum, r) => sum + (r.migratedCount || 0), 0);
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total collections: ${collections.length}`);
    console.log(`Total documents: ${totalOriginal}`);
    if (!dryRun) {
      console.log(`Successfully migrated: ${totalMigrated}`);
      console.log(`Success rate: ${Math.round(totalMigrated/totalOriginal*100)}%`);
    }
    
    return {
      statusCode: 200,
      body: {
        success: true,
        dryRun,
        summary: {
          collections: collections.length,
          totalDocuments: totalOriginal,
          migratedDocuments: totalMigrated,
          successRate: dryRun ? null : Math.round(totalMigrated/totalOriginal*100)
        },
        results
      }
    };
    
  } catch (error) {
    console.error('Migration failed:', error);
    
    return {
      statusCode: 500,
      body: {
        success: false,
        error: error.message,
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