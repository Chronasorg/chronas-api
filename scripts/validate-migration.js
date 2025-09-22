#!/usr/bin/env node

/**
 * Data Migration Validation Script
 * 
 * This script validates the data migration between DocumentDB clusters
 * by comparing document counts, sampling data, and checking integrity.
 */

import { MongoClient } from 'mongodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-west-1' });

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
 * Create MongoDB connection
 */
async function createConnection(credentials, clusterName) {
  const tlsOptions = {
    tls: true,
    tlsCAFile: './scripts/rds-ca-2019-root.pem',
    tlsAllowInvalidHostnames: true,
    retryWrites: false
  };

  const connectionString = `mongodb://${credentials.username}:${credentials.password}@${credentials.host}:${credentials.port}/${credentials.dbname}`;
  
  console.log(`Connecting to ${clusterName}: ${credentials.host}`);
  
  const client = new MongoClient(connectionString, {
    ...tlsOptions,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 5000,
  });

  await client.connect();
  console.log(`✅ Connected to ${clusterName}`);
  return client;
}

/**
 * Compare collection statistics
 */
async function compareCollections(oldClient, newClient, dbName, collectionName) {
  console.log(`\n📊 Analyzing collection: ${collectionName}`);
  
  const oldDb = oldClient.db(dbName);
  const newDb = newClient.db(dbName);
  
  const oldCollection = oldDb.collection(collectionName);
  const newCollection = newDb.collection(collectionName);
  
  try {
    // Get basic statistics
    const [oldCount, newCount] = await Promise.all([
      oldCollection.countDocuments(),
      newCollection.countDocuments()
    ]);
    
    console.log(`   Documents - Old: ${oldCount}, New: ${newCount}`);
    
    // Sample documents for comparison
    const [oldSample, newSample] = await Promise.all([
      oldCollection.findOne({}),
      newCollection.findOne({})
    ]);
    
    // Get index information
    const [oldIndexes, newIndexes] = await Promise.all([
      oldCollection.listIndexes().toArray(),
      newCollection.listIndexes().toArray()
    ]);
    
    console.log(`   Indexes - Old: ${oldIndexes.length}, New: ${newIndexes.length}`);
    
    const analysis = {
      collection: collectionName,
      counts: {
        old: oldCount,
        new: newCount,
        match: oldCount === newCount,
        difference: newCount - oldCount
      },
      indexes: {
        old: oldIndexes.length,
        new: newIndexes.length,
        match: oldIndexes.length === newIndexes.length
      },
      sampleData: {
        oldSample: oldSample ? Object.keys(oldSample).length : 0,
        newSample: newSample ? Object.keys(newSample).length : 0,
        structureMatch: oldSample && newSample ? 
          JSON.stringify(Object.keys(oldSample).sort()) === JSON.stringify(Object.keys(newSample).sort()) : 
          false
      },
      status: oldCount === newCount ? '✅ MATCH' : '⚠️ MISMATCH'
    };
    
    console.log(`   Status: ${analysis.status}`);
    
    return analysis;
    
  } catch (error) {
    console.error(`   ❌ Error analyzing ${collectionName}:`, error.message);
    
    return {
      collection: collectionName,
      error: error.message,
      status: '❌ ERROR'
    };
  }
}

/**
 * Main validation function
 */
async function validateMigration() {
  console.log('🔍 Starting Data Migration Validation...\n');
  
  const oldSecretName = process.env.OLD_DB_SECRET_NAME || '/chronas/docdb/password';
  const newSecretName = process.env.NEW_DB_SECRET_NAME || '/chronas/docdb/newpassword-modernized';
  const dbName = process.env.DB_NAME || 'chronas';
  
  // Default collections to validate
  const collections = [
    'users',
    'areas', 
    'markers',
    'events',
    'articles',
    'metadata'
  ];
  
  console.log('📋 Configuration:');
  console.log(`   Database: ${dbName}`);
  console.log(`   Collections: ${collections.join(', ')}`);
  console.log(`   Old Secret: ${oldSecretName}`);
  console.log(`   New Secret: ${newSecretName}\n`);
  
  let oldClient, newClient;
  const results = [];
  
  try {
    // Get credentials
    console.log('🔐 Retrieving database credentials...');
    const [oldCredentials, newCredentials] = await Promise.all([
      getDbCredentials(oldSecretName),
      getDbCredentials(newSecretName)
    ]);
    
    // Connect to both clusters
    console.log('🔗 Establishing database connections...');
    [oldClient, newClient] = await Promise.all([
      createConnection(oldCredentials, 'Old Cluster'),
      createConnection(newCredentials, 'New Cluster')
    ]);
    
    // Validate each collection
    console.log('📊 Comparing collections...');
    
    for (const collectionName of collections) {
      const analysis = await compareCollections(oldClient, newClient, dbName, collectionName);
      results.push(analysis);
    }
    
    // Generate summary report
    console.log('\n' + '='.repeat(60));
    console.log('📋 MIGRATION VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    const totalCollections = results.length;
    const successfulCollections = results.filter(r => r.status === '✅ MATCH').length;
    const errorCollections = results.filter(r => r.status === '❌ ERROR').length;
    const mismatchCollections = results.filter(r => r.status === '⚠️ MISMATCH').length;
    
    console.log(`Total Collections: ${totalCollections}`);
    console.log(`✅ Successful: ${successfulCollections}`);
    console.log(`⚠️ Mismatches: ${mismatchCollections}`);
    console.log(`❌ Errors: ${errorCollections}`);
    
    const overallSuccess = errorCollections === 0 && mismatchCollections === 0;
    console.log(`\n🎯 Overall Status: ${overallSuccess ? '✅ MIGRATION SUCCESSFUL' : '❌ MIGRATION ISSUES DETECTED'}`);
    
    if (!overallSuccess) {
      console.log('\n🔧 Issues Found:');
      results.forEach(r => {
        if (r.status !== '✅ MATCH') {
          console.log(`   ${r.collection}: ${r.status}`);
          if (r.error) console.log(`      Error: ${r.error}`);
          if (r.counts && !r.counts.match) {
            console.log(`      Count difference: ${r.counts.difference}`);
          }
        }
      });
    }
    
    // Detailed results
    console.log('\n📊 Detailed Results:');
    results.forEach(r => {
      console.log(`\n   ${r.collection}:`);
      console.log(`     Status: ${r.status}`);
      if (r.counts) {
        console.log(`     Documents: ${r.counts.old} → ${r.counts.new}`);
      }
      if (r.indexes) {
        console.log(`     Indexes: ${r.indexes.old} → ${r.indexes.new}`);
      }
    });
    
    return {
      success: overallSuccess,
      summary: {
        total: totalCollections,
        successful: successfulCollections,
        mismatches: mismatchCollections,
        errors: errorCollections
      },
      results
    };
    
  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    throw error;
    
  } finally {
    // Close connections
    if (oldClient) {
      await oldClient.close();
      console.log('\n🔌 Closed old cluster connection');
    }
    if (newClient) {
      await newClient.close();
      console.log('🔌 Closed new cluster connection');
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigration()
    .then(result => {
      console.log('\n✅ Validation completed');
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Validation failed:', error);
      process.exit(1);
    });
}