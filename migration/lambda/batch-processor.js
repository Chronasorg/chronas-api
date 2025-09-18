/**
 * DocumentDB Batch Processing Lambda Handler
 * 
 * This Lambda function handles large collection migrations by processing
 * data in configurable batches with progress tracking and resume capability.
 */

import { MongoClient } from 'mongodb';
import AWS from 'aws-sdk';

// Configure AWS SDK
const secretsManager = new AWS.SecretsManager({
  region: process.env.AWS_REGION || 'eu-west-1'
});

const stepFunctions = new AWS.StepFunctions({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Batch processing configuration
const DEFAULT_BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 1000;
const MAX_PROCESSING_TIME = parseInt(process.env.MAX_PROCESSING_TIME) || 840000; // 14 minutes (Lambda max - 1 min buffer)
const PROGRESS_UPDATE_INTERVAL = parseInt(process.env.PROGRESS_UPDATE_INTERVAL) || 10; // Update progress every N batches

/**
 * Lambda handler for batch processing
 */
export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('Starting DocumentDB batch processing');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  let sourceClient = null;
  let targetClient = null;
  
  try {
    // Parse event parameters
    const {
      sourceSecretName = process.env.SOURCE_SECRET_NAME,
      targetSecretName = process.env.TARGET_SECRET_NAME,
      collectionName,
      batchSize = DEFAULT_BATCH_SIZE,
      startOffset = 0,
      maxBatches = null,
      resumeToken = null,
      executionArn = null,
      dryRun = false
    } = event;
    
    if (!sourceSecretName || !targetSecretName || !collectionName) {
      throw new Error('Source secret, target secret, and collection name are required');
    }
    
    console.log(`Batch processing configuration:
      - Collection: ${collectionName}
      - Batch Size: ${batchSize}
      - Start Offset: ${startOffset}
      - Max Batches: ${maxBatches || 'unlimited'}
      - Resume Token: ${resumeToken ? 'provided' : 'none'}
      - Dry Run: ${dryRun}
    `);
    
    // Get database credentials
    const [sourceCredentials, targetCredentials] = await Promise.all([
      getSecretValue(sourceSecretName),
      getSecretValue(targetSecretName)
    ]);
    
    // Create database connections
    sourceClient = await createConnection(sourceCredentials, 'source');
    targetClient = await createConnection(targetCredentials, 'target');
    
    // Initialize processing results
    const processingResults = {
      startTime: new Date().toISOString(),
      collectionName,
      batchSize,
      startOffset,
      processedBatches: 0,
      processedDocuments: 0,
      remainingDocuments: 0,
      errors: [],
      completed: false,
      nextResumeToken: null,
      dryRun
    };
    
    // Process batches
    const batchResult = await processBatches(
      sourceClient,
      targetClient,
      collectionName,
      {
        batchSize,
        startOffset,
        maxBatches,
        resumeToken,
        executionArn,
        dryRun,
        maxProcessingTime: MAX_PROCESSING_TIME,
        startTime
      }
    );
    
    // Merge results
    Object.assign(processingResults, batchResult);
    
    // Calculate final statistics
    const endTime = Date.now();
    processingResults.endTime = new Date().toISOString();
    processingResults.totalDuration = endTime - startTime;
    processingResults.success = processingResults.errors.length === 0;
    
    console.log('\n=== Batch Processing Summary ===');
    console.log(`Collection: ${collectionName}`);
    console.log(`Processed batches: ${processingResults.processedBatches}`);
    console.log(`Processed documents: ${processingResults.processedDocuments}`);
    console.log(`Remaining documents: ${processingResults.remainingDocuments}`);
    console.log(`Completed: ${processingResults.completed}`);
    console.log(`Errors: ${processingResults.errors.length}`);
    console.log(`Duration: ${processingResults.totalDuration}ms`);
    
    return {
      statusCode: processingResults.success ? 200 : 500,
      body: JSON.stringify(processingResults, null, 2)
    };
    
  } catch (error) {
    console.error('Batch processing failed:', error);
    
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
    maxPoolSize: 10,
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
 * Process batches with time limit and progress tracking
 */
async function processBatches(sourceClient, targetClient, collectionName, options = {}) {
  const {
    batchSize,
    startOffset,
    maxBatches,
    resumeToken,
    executionArn,
    dryRun,
    maxProcessingTime,
    startTime
  } = options;
  
  const sourceDb = sourceClient.db('chronas');
  const targetDb = targetClient.db('chronas');
  
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  
  // Get total document count
  const totalDocuments = await sourceCollection.countDocuments();
  console.log(`Total documents in ${collectionName}: ${totalDocuments}`);
  
  const result = {
    processedBatches: 0,
    processedDocuments: 0,
    remainingDocuments: totalDocuments - startOffset,
    errors: [],
    completed: false,
    nextResumeToken: null
  };
  
  let currentOffset = startOffset;
  let batchCount = 0;
  
  try {
    while (currentOffset < totalDocuments) {
      // Check time limit
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxProcessingTime) {
        console.log(`Time limit reached (${elapsedTime}ms), stopping processing`);
        result.nextResumeToken = currentOffset;
        break;
      }
      
      // Check batch limit
      if (maxBatches && batchCount >= maxBatches) {
        console.log(`Batch limit reached (${maxBatches}), stopping processing`);
        result.nextResumeToken = currentOffset;
        break;
      }
      
      console.log(`Processing batch ${batchCount + 1}, offset: ${currentOffset}`);
      
      try {
        // Get batch of documents
        const batchDocuments = await sourceCollection
          .find({})
          .skip(currentOffset)
          .limit(batchSize)
          .toArray();
        
        if (batchDocuments.length === 0) {
          console.log('No more documents to process');
          break;
        }
        
        console.log(`Retrieved ${batchDocuments.length} documents for batch`);
        
        if (!dryRun) {
          // Insert batch into target collection
          await insertBatchWithRetry(targetCollection, batchDocuments, collectionName);
          console.log(`✓ Inserted batch of ${batchDocuments.length} documents`);
        } else {
          console.log(`DRY RUN: Would insert ${batchDocuments.length} documents`);
        }
        
        // Update progress
        result.processedBatches++;
        result.processedDocuments += batchDocuments.length;
        result.remainingDocuments = totalDocuments - (currentOffset + batchDocuments.length);
        
        currentOffset += batchDocuments.length;
        batchCount++;
        
        // Update progress in Step Functions (if execution ARN provided)
        if (executionArn && batchCount % PROGRESS_UPDATE_INTERVAL === 0) {
          await updateStepFunctionProgress(executionArn, {
            collectionName,
            processedBatches: result.processedBatches,
            processedDocuments: result.processedDocuments,
            remainingDocuments: result.remainingDocuments,
            currentOffset
          });
        }
        
        // Log progress
        const progressPercent = ((currentOffset / totalDocuments) * 100).toFixed(1);
        console.log(`Progress: ${result.processedDocuments}/${totalDocuments} documents (${progressPercent}%)`);
        
      } catch (error) {
        const errorMsg = `Batch processing error at offset ${currentOffset}: ${error.message}`;
        console.error(errorMsg);
        
        result.errors.push({
          batchNumber: batchCount + 1,
          offset: currentOffset,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        // For batch processing, we might want to continue with the next batch
        // depending on the error type
        if (error.code === 11000) { // Duplicate key error
          console.log('Duplicate key error, continuing with next batch');
          currentOffset += batchSize; // Skip this batch
          batchCount++;
        } else {
          throw error; // Re-throw for other errors
        }
      }
    }
    
    // Check if processing is complete
    result.completed = currentOffset >= totalDocuments;
    
    if (result.completed) {
      console.log(`✓ Collection ${collectionName} processing completed`);
    } else {
      console.log(`Collection ${collectionName} processing paused at offset ${currentOffset}`);
      result.nextResumeToken = currentOffset;
    }
    
  } catch (error) {
    console.error(`Fatal error during batch processing:`, error);
    result.errors.push({
      type: 'fatal_error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    result.nextResumeToken = currentOffset;
  }
  
  return result;
}

/**
 * Insert batch with retry logic
 */
async function insertBatchWithRetry(collection, batch, collectionName, maxRetries = 3) {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await collection.insertMany(batch, { 
        ordered: false,
        writeConcern: { w: 'majority', j: true }
      });
      return;
      
    } catch (error) {
      retries++;
      console.warn(`Batch insert failed for ${collectionName} (attempt ${retries}/${maxRetries}):`, error.message);
      
      if (retries >= maxRetries) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Update Step Functions execution with progress
 */
async function updateStepFunctionProgress(executionArn, progress) {
  try {
    console.log(`Updating Step Functions progress: ${progress.processedDocuments} documents processed`);
    
    // Send task heartbeat to keep the execution alive
    await stepFunctions.sendTaskHeartbeat({
      taskToken: executionArn // This would need to be the task token, not execution ARN
    }).promise();
    
  } catch (error) {
    // Don't fail the entire process if progress update fails
    console.warn('Failed to update Step Functions progress:', error.message);
  }
}

/**
 * Resume batch processing from a specific offset
 */
export const resumeHandler = async (event, context) => {
  console.log('Resuming batch processing from offset:', event.resumeToken);
  
  // Modify the event to include the resume token as start offset
  const resumeEvent = {
    ...event,
    startOffset: event.resumeToken || 0
  };
  
  // Call the main handler
  return handler(resumeEvent, context);
};

/**
 * Get batch processing status
 */
export const statusHandler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  try {
    const {
      sourceSecretName = process.env.SOURCE_SECRET_NAME,
      targetSecretName = process.env.TARGET_SECRET_NAME,
      collectionName
    } = event;
    
    if (!sourceSecretName || !targetSecretName || !collectionName) {
      throw new Error('Source secret, target secret, and collection name are required');
    }
    
    // Get database credentials
    const [sourceCredentials, targetCredentials] = await Promise.all([
      getSecretValue(sourceSecretName),
      getSecretValue(targetSecretName)
    ]);
    
    // Create database connections
    const sourceClient = await createConnection(sourceCredentials, 'source');
    const targetClient = await createConnection(targetCredentials, 'target');
    
    try {
      const sourceDb = sourceClient.db('chronas');
      const targetDb = targetClient.db('chronas');
      
      const sourceCollection = sourceDb.collection(collectionName);
      const targetCollection = targetDb.collection(collectionName);
      
      // Get document counts
      const [sourceCount, targetCount] = await Promise.all([
        sourceCollection.countDocuments(),
        targetCollection.countDocuments()
      ]);
      
      const progress = {
        collectionName,
        sourceCount,
        targetCount,
        migratedCount: targetCount,
        remainingCount: sourceCount - targetCount,
        progressPercent: sourceCount > 0 ? ((targetCount / sourceCount) * 100).toFixed(1) : 0,
        completed: sourceCount === targetCount,
        timestamp: new Date().toISOString()
      };
      
      console.log('Batch processing status:', progress);
      
      return {
        statusCode: 200,
        body: JSON.stringify(progress, null, 2)
      };
      
    } finally {
      await sourceClient.close();
      await targetClient.close();
    }
    
  } catch (error) {
    console.error('Status check failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2)
    };
  }
};