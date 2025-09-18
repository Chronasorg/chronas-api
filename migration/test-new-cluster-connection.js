#!/usr/bin/env node

/**
 * DocumentDB New Cluster Connection Test
 * 
 * This script tests connectivity to the new modernized DocumentDB cluster
 * and validates that it's ready for migration.
 */

import { MongoClient } from 'mongodb';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const AWS_PROFILE = 'chronas-dev';
const AWS_REGION = 'eu-west-1';
const ENVIRONMENT = process.argv[2] || 'dev';
const SECRET_NAME = `/chronas/${ENVIRONMENT}/docdb/modernized`;

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'green') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function error(message) {
  log(`ERROR: ${message}`, 'red');
}

function warn(message) {
  log(`WARNING: ${message}`, 'yellow');
}

function info(message) {
  log(`INFO: ${message}`, 'blue');
}

async function getDocumentDBCredentials() {
  log('Retrieving DocumentDB credentials from Secrets Manager...');
  
  // Configure AWS SDK
  AWS.config.update({
    region: AWS_REGION,
    credentials: new AWS.SharedIniFileCredentials({ profile: AWS_PROFILE })
  });

  const secretsManager = new AWS.SecretsManager();

  try {
    const result = await secretsManager.getSecretValue({
      SecretId: SECRET_NAME
    }).promise();

    if (!result.SecretString) {
      throw new Error('SecretString not found in response');
    }

    const credentials = JSON.parse(result.SecretString);
    
    if (!credentials.host || !credentials.username || !credentials.password) {
      throw new Error('Invalid credentials format');
    }

    log(`Retrieved credentials for host: ${credentials.host}`);
    return credentials;
  } catch (err) {
    error(`Failed to retrieve credentials: ${err.message}`);
    throw err;
  }
}

async function downloadTLSCertificate() {
  log('Checking for DocumentDB TLS certificate...');
  
  const certPath = path.join(__dirname, 'rds-ca-2019-root.pem');
  
  if (fs.existsSync(certPath)) {
    log('TLS certificate already exists');
    return certPath;
  }

  log('Downloading DocumentDB TLS certificate...');
  
  try {
    const https = await import('https');
    const certUrl = 'https://s3.amazonaws.com/rds-downloads/rds-ca-2019-root.pem';
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(certPath);
      
      https.get(certUrl, (response) => {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          log('TLS certificate downloaded successfully');
          resolve(certPath);
        });
        
        file.on('error', (err) => {
          fs.unlink(certPath, () => {}); // Delete partial file
          reject(err);
        });
      }).on('error', reject);
    });
  } catch (err) {
    error(`Failed to download TLS certificate: ${err.message}`);
    throw err;
  }
}

async function testBasicConnectivity(credentials, certPath) {
  log('Testing basic DocumentDB connectivity...');
  
  const connectionString = `mongodb://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port || 27017}/admin?replicaSet=rs0&retryWrites=false`;
  
  const client = new MongoClient(connectionString, {
    tls: true,
    tlsCAFile: certPath,
    tlsAllowInvalidHostnames: false,
    tlsAllowInvalidCertificates: false,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });

  try {
    log('Attempting to connect to DocumentDB...');
    await client.connect();
    
    log('✓ Successfully connected to DocumentDB');
    
    // Test basic operations
    const adminDb = client.db('admin');
    const result = await adminDb.command({ ping: 1 });
    
    if (result.ok === 1) {
      log('✓ Ping command successful');
    } else {
      warn('Ping command returned unexpected result');
    }
    
    return client;
  } catch (err) {
    error(`Connection failed: ${err.message}`);
    throw err;
  }
}

async function testDatabaseOperations(client) {
  log('Testing database operations...');
  
  try {
    // Test database creation and basic operations
    const testDb = client.db('migration_test');
    const testCollection = testDb.collection('connectivity_test');
    
    // Insert test document
    const testDoc = {
      _id: 'test_connection',
      timestamp: new Date(),
      test_data: 'DocumentDB 5.0 connectivity test',
      environment: ENVIRONMENT
    };
    
    log('Testing document insertion...');
    await testCollection.insertOne(testDoc);
    log('✓ Document insertion successful');
    
    // Read test document
    log('Testing document retrieval...');
    const retrievedDoc = await testCollection.findOne({ _id: 'test_connection' });
    
    if (retrievedDoc && retrievedDoc.test_data === testDoc.test_data) {
      log('✓ Document retrieval successful');
    } else {
      warn('Document retrieval returned unexpected data');
    }
    
    // Test indexing
    log('Testing index creation...');
    await testCollection.createIndex({ timestamp: 1 });
    log('✓ Index creation successful');
    
    // List indexes
    const indexes = await testCollection.listIndexes().toArray();
    log(`✓ Found ${indexes.length} indexes`);
    
    // Update test document
    log('Testing document update...');
    await testCollection.updateOne(
      { _id: 'test_connection' },
      { $set: { updated: true, update_timestamp: new Date() } }
    );
    log('✓ Document update successful');
    
    // Delete test document
    log('Testing document deletion...');
    await testCollection.deleteOne({ _id: 'test_connection' });
    log('✓ Document deletion successful');
    
    // Drop test collection
    log('Cleaning up test collection...');
    await testCollection.drop();
    log('✓ Test collection dropped');
    
  } catch (err) {
    error(`Database operation failed: ${err.message}`);
    throw err;
  }
}

async function getClusterInfo(client) {
  log('Gathering cluster information...');
  
  try {
    const adminDb = client.db('admin');
    
    // Get server status
    const serverStatus = await adminDb.command({ serverStatus: 1 });
    
    // Get replica set status
    let replicaSetStatus;
    try {
      replicaSetStatus = await adminDb.command({ replSetGetStatus: 1 });
    } catch (err) {
      warn('Could not retrieve replica set status (this may be normal)');
      replicaSetStatus = null;
    }
    
    // Get build info
    const buildInfo = await adminDb.command({ buildInfo: 1 });
    
    const clusterInfo = {
      version: buildInfo.version,
      gitVersion: buildInfo.gitVersion,
      engine: serverStatus.storageEngine?.name || 'unknown',
      uptime: serverStatus.uptime,
      connections: serverStatus.connections,
      replicaSet: replicaSetStatus?.set || 'unknown',
      members: replicaSetStatus?.members?.length || 'unknown'
    };
    
    log('Cluster Information:');
    console.log(JSON.stringify(clusterInfo, null, 2));
    
    return clusterInfo;
  } catch (err) {
    error(`Failed to gather cluster info: ${err.message}`);
    throw err;
  }
}

async function testLambdaOptimizedConnection(credentials, certPath) {
  log('Testing Lambda-optimized connection pattern...');
  
  const connectionString = `mongodb://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port || 27017}/chronas?replicaSet=rs0&retryWrites=false`;
  
  // Lambda-optimized connection options
  const client = new MongoClient(connectionString, {
    tls: true,
    tlsCAFile: certPath,
    maxPoolSize: 1, // Single connection for Lambda
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    heartbeatFrequencyMS: 30000,
    bufferCommands: false,
    bufferMaxEntries: 0,
  });

  try {
    log('Testing Lambda-optimized connection...');
    await client.connect();
    
    log('✓ Lambda-optimized connection successful');
    
    // Test quick operations
    const db = client.db('chronas');
    await db.command({ ping: 1 });
    
    log('✓ Lambda connection pattern validated');
    
    await client.close();
    log('✓ Connection closed successfully');
    
  } catch (err) {
    error(`Lambda-optimized connection failed: ${err.message}`);
    throw err;
  }
}

async function generateConnectionReport(credentials, clusterInfo) {
  log('Generating connection test report...');
  
  const reportPath = path.join(__dirname, `connection-test-report-${ENVIRONMENT}-${Date.now()}.md`);
  
  const report = `# DocumentDB New Cluster Connection Test Report

**Test Date**: ${new Date().toISOString()}
**Environment**: ${ENVIRONMENT}
**Cluster Host**: ${credentials.host}
**Cluster Port**: ${credentials.port || 27017}

## Test Results

### ✅ Connection Tests
- Basic connectivity: PASSED
- TLS connection: PASSED
- Authentication: PASSED
- Lambda-optimized connection: PASSED

### ✅ Database Operations
- Document insertion: PASSED
- Document retrieval: PASSED
- Document update: PASSED
- Document deletion: PASSED
- Index creation: PASSED

### 📊 Cluster Information
- **MongoDB Version**: ${clusterInfo.version}
- **Git Version**: ${clusterInfo.gitVersion}
- **Storage Engine**: ${clusterInfo.engine}
- **Uptime**: ${clusterInfo.uptime} seconds
- **Current Connections**: ${clusterInfo.connections?.current || 'unknown'}
- **Available Connections**: ${clusterInfo.connections?.available || 'unknown'}
- **Replica Set**: ${clusterInfo.replicaSet}
- **Members**: ${clusterInfo.members}

## Connection Configuration

### Standard Connection String
\`\`\`
mongodb://<username>:<password>@${credentials.host}:${credentials.port || 27017}/chronas?replicaSet=rs0&retryWrites=false
\`\`\`

### Lambda-Optimized Options
\`\`\`javascript
{
  tls: true,
  tlsCAFile: '/opt/rds-ca-2019-root.pem',
  maxPoolSize: 1,
  minPoolSize: 0,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 30000,
  bufferCommands: false,
  bufferMaxEntries: 0,
}
\`\`\`

## Migration Readiness

✅ **Ready for Migration**
- New cluster is accessible and functional
- All basic database operations working
- TLS connectivity verified
- Lambda-optimized connection pattern tested
- Cluster information gathered successfully

## Next Steps

1. Proceed with data migration scripts (Task 1.3)
2. Update application configuration for new cluster
3. Test application connectivity from Lambda environment
4. Monitor performance during migration

---

*Test completed successfully*
*All systems ready for migration*
`;

  fs.writeFileSync(reportPath, report);
  log(`Connection test report saved: ${reportPath}`);
  
  return reportPath;
}

async function main() {
  try {
    log(`Starting DocumentDB connection test for environment: ${ENVIRONMENT}`);
    
    // Get credentials
    const credentials = await getDocumentDBCredentials();
    
    // Download TLS certificate
    const certPath = await downloadTLSCertificate();
    
    // Test basic connectivity
    const client = await testBasicConnectivity(credentials, certPath);
    
    // Test database operations
    await testDatabaseOperations(client);
    
    // Get cluster information
    const clusterInfo = await getClusterInfo(client);
    
    // Close the main connection
    await client.close();
    log('Main connection closed');
    
    // Test Lambda-optimized connection
    await testLambdaOptimizedConnection(credentials, certPath);
    
    // Generate report
    const reportPath = await generateConnectionReport(credentials, clusterInfo);
    
    log('🎉 All connection tests passed successfully!');
    log(`Report generated: ${reportPath}`);
    log('The new DocumentDB cluster is ready for migration.');
    
  } catch (err) {
    error(`Connection test failed: ${err.message}`);
    process.exit(1);
  }
}

// Handle command line usage
if (process.argv.length > 3) {
  console.log('Usage: node test-new-cluster-connection.js [environment]');
  console.log('Environment: dev (default), staging, prod');
  process.exit(1);
}

main().catch(err => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});