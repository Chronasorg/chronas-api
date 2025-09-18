/**
 * DocumentDB Migration Validation Lambda Handler
 * 
 * This Lambda function performs comprehensive validation of migrated data
 * including document counts, data integrity, and sample document verification.
 */

import { MongoClient } from 'mongodb';
import AWS from 'aws-sdk';
import crypto from 'crypto';

// Configure AWS SDK
const secretsManager = new AWS.SecretsManager({
  region: process.env.AWS_REGION || 'eu-west-1'
});

// Validation configuration
const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE) || 100;
const DEEP_VALIDATION_THRESHOLD = parseInt(process.env.DEEP_VALIDATION_THRESHOLD) || 10000;

/**
 * Lambda handler for migration validation
 */
export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('Starting DocumentDB migration validation');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  let sourceClient = null;
  let targetClient = null;
  
  try {
    // Parse event parameters
    const {
      sourceSecretName = process.env.SOURCE_SECRET_NAME,
      targetSecretName = process.env.TARGET_SECRET_NAME,
      collections = ['areas', 'markers', 'users', 'metadata', 'collections', 'revisions', 'flags', 'games'],
      deepValidation = false,
      sampleValidation = true,
      checksumValidation = false
    } = event;
    
    if (!sourceSecretName || !targetSecretName) {
      throw new Error('Source and target secret names are required');
    }
    
    console.log(`Validation configuration:
      - Source Secret: ${sourceSecretName}
      - Target Secret: ${targetSecretName}
      - Collections: ${collections.join(', ')}
      - Deep Validation: ${deepValidation}
      - Sample Validation: ${sampleValidation}
      - Checksum Validation: ${checksumValidation}
    `);
    
    // Get database credentials
    const [sourceCredentials, targetCredentials] = await Promise.all([
      getSecretValue(sourceSecretName),
      getSecretValue(targetSecretName)
    ]);
    
    // Create database connections
    sourceClient = await createConnection(sourceCredentials, 'source');
    targetClient = await createConnection(targetCredentials, 'target');
    
    // Initialize validation results
    const validationResults = {
      startTime: new Date().toISOString(),
      collections: {},
      summary: {
        totalCollections: collections.length,
        passedCollections: 0,
        failedCollections: 0,
        totalSourceDocuments: 0,
        totalTargetDocuments: 0,
        validationErrors: [],
        validationWarnings: []
      }
    };
    
    // Validate each collection
    for (const collectionName of collections) {
      console.log(`\n=== Validating collection: ${collectionName} ===`);
      
      try {
        const result = await validateCollection(
          sourceClient,
          targetClient,
          collectionName,
          { deepValidation, sampleValidation, checksumValidation }
        );
        
        validationResults.collections[collectionName] = result;
        validationResults.summary.totalSourceDocuments += result.sourceCount;
        validationResults.summary.totalTargetDocuments += result.targetCount;
        
        if (result.success) {
          validationResults.summary.passedCollections++;
          console.log(`✓ Collection ${collectionName} validation PASSED`);
        } else {
          validationResults.summary.failedCollections++;
          console.error(`✗ Collection ${collectionName} validation FAILED`);
          validationResults.summary.validationErrors.push(...result.errors);
        }
        
        if (result.warnings && result.warnings.length > 0) {
          validationResults.summary.validationWarnings.push(...result.warnings);
        }
        
      } catch (error) {
        const errorMsg = `Validation failed for collection ${collectionName}: ${error.message}`;
        console.error(errorMsg);
        
        validationResults.collections[collectionName] = {
          success: false,
          error: error.message,
          sourceCount: 0,
          targetCount: 0
        };
        
        validationResults.summary.failedCollections++;
        validationResults.summary.validationErrors.push({
          collection: collectionName,
          type: 'validation_error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Calculate final results
    const endTime = Date.now();
    validationResults.endTime = new Date().toISOString();
    validationResults.totalDuration = endTime - startTime;
    validationResults.success = validationResults.summary.failedCollections === 0;
    
    // Generate validation summary
    console.log('\n=== Validation Summary ===');
    console.log(`Total collections: ${validationResults.summary.totalCollections}`);
    console.log(`Passed: ${validationResults.summary.passedCollections}`);
    console.log(`Failed: ${validationResults.summary.failedCollections}`);
    console.log(`Total source documents: ${validationResults.summary.totalSourceDocuments}`);
    console.log(`Total target documents: ${validationResults.summary.totalTargetDocuments}`);
    console.log(`Errors: ${validationResults.summary.validationErrors.length}`);
    console.log(`Warnings: ${validationResults.summary.validationWarnings.length}`);
    console.log(`Duration: ${validationResults.totalDuration}ms`);
    console.log(`Overall result: ${validationResults.success ? 'PASSED' : 'FAILED'}`);
    
    return {
      statusCode: validationResults.success ? 200 : 500,
      body: JSON.stringify(validationResults, null, 2)
    };
    
  } catch (error) {
    console.error('Validation process failed:', error);
    
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
 * Validate a single collection
 */
async function validateCollection(sourceClient, targetClient, collectionName, options = {}) {
  const { deepValidation = false, sampleValidation = true, checksumValidation = false } = options;
  const startTime = Date.now();
  
  console.log(`Validating collection: ${collectionName}`);
  
  const sourceDb = sourceClient.db('chronas');
  const targetDb = targetClient.db('chronas');
  
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  
  const result = {
    collection: collectionName,
    success: true,
    errors: [],
    warnings: [],
    validations: {}
  };
  
  try {
    // 1. Document count validation
    console.log(`Checking document counts for ${collectionName}...`);
    const [sourceCount, targetCount] = await Promise.all([
      sourceCollection.countDocuments(),
      targetCollection.countDocuments()
    ]);
    
    result.sourceCount = sourceCount;
    result.targetCount = targetCount;
    result.validations.documentCount = {
      passed: sourceCount === targetCount,
      sourceCount,
      targetCount,
      difference: targetCount - sourceCount
    };
    
    if (sourceCount !== targetCount) {
      result.success = false;
      result.errors.push({
        type: 'document_count_mismatch',
        message: `Document count mismatch: source=${sourceCount}, target=${targetCount}`,
        severity: 'high'
      });
    } else {
      console.log(`✓ Document count matches: ${sourceCount} documents`);
    }
    
    // 2. Index validation
    console.log(`Checking indexes for ${collectionName}...`);
    const indexValidation = await validateIndexes(sourceCollection, targetCollection);
    result.validations.indexes = indexValidation;
    
    if (!indexValidation.passed) {
      result.success = false;
      result.errors.push(...indexValidation.errors);
    } else {
      console.log(`✓ Index validation passed: ${indexValidation.sourceIndexes.length} indexes`);
    }
    
    // 3. Sample document validation (if enabled and documents exist)
    if (sampleValidation && sourceCount > 0) {
      console.log(`Running sample document validation for ${collectionName}...`);
      const sampleValidationResult = await validateSampleDocuments(
        sourceCollection, 
        targetCollection, 
        Math.min(SAMPLE_SIZE, sourceCount)
      );
      result.validations.sampleDocuments = sampleValidationResult;
      
      if (!sampleValidationResult.passed) {
        result.warnings.push(...sampleValidationResult.warnings);
        if (sampleValidationResult.criticalErrors > 0) {
          result.success = false;
          result.errors.push(...sampleValidationResult.errors);
        }
      } else {
        console.log(`✓ Sample validation passed: ${sampleValidationResult.samplesValidated} documents`);
      }
    }
    
    // 4. Deep validation (if enabled and collection is small enough)
    if (deepValidation && sourceCount > 0 && sourceCount <= DEEP_VALIDATION_THRESHOLD) {
      console.log(`Running deep validation for ${collectionName}...`);
      const deepValidationResult = await validateAllDocuments(sourceCollection, targetCollection);
      result.validations.deepValidation = deepValidationResult;
      
      if (!deepValidationResult.passed) {
        result.success = false;
        result.errors.push(...deepValidationResult.errors);
      } else {
        console.log(`✓ Deep validation passed: ${deepValidationResult.documentsValidated} documents`);
      }
    } else if (deepValidation && sourceCount > DEEP_VALIDATION_THRESHOLD) {
      result.warnings.push({
        type: 'deep_validation_skipped',
        message: `Deep validation skipped: collection too large (${sourceCount} > ${DEEP_VALIDATION_THRESHOLD})`,
        severity: 'low'
      });
    }
    
    // 5. Checksum validation (if enabled)
    if (checksumValidation && sourceCount > 0) {
      console.log(`Running checksum validation for ${collectionName}...`);
      const checksumResult = await validateCollectionChecksum(sourceCollection, targetCollection);
      result.validations.checksum = checksumResult;
      
      if (!checksumResult.passed) {
        result.success = false;
        result.errors.push(...checksumResult.errors);
      } else {
        console.log(`✓ Checksum validation passed`);
      }
    }
    
  } catch (error) {
    result.success = false;
    result.errors.push({
      type: 'validation_exception',
      message: error.message,
      severity: 'high'
    });
  }
  
  result.duration = Date.now() - startTime;
  console.log(`Collection ${collectionName} validation completed in ${result.duration}ms`);
  
  return result;
}

/**
 * Validate indexes between source and target collections
 */
async function validateIndexes(sourceCollection, targetCollection) {
  try {
    const [sourceIndexes, targetIndexes] = await Promise.all([
      sourceCollection.listIndexes().toArray(),
      targetCollection.listIndexes().toArray()
    ]);
    
    const result = {
      passed: true,
      errors: [],
      sourceIndexes: sourceIndexes.map(idx => idx.name),
      targetIndexes: targetIndexes.map(idx => idx.name),
      missingIndexes: [],
      extraIndexes: []
    };
    
    // Check for missing indexes in target
    for (const sourceIndex of sourceIndexes) {
      const targetIndex = targetIndexes.find(idx => idx.name === sourceIndex.name);
      if (!targetIndex) {
        result.passed = false;
        result.missingIndexes.push(sourceIndex.name);
        result.errors.push({
          type: 'missing_index',
          message: `Index '${sourceIndex.name}' exists in source but not in target`,
          severity: 'medium'
        });
      } else {
        // Validate index structure
        if (JSON.stringify(sourceIndex.key) !== JSON.stringify(targetIndex.key)) {
          result.passed = false;
          result.errors.push({
            type: 'index_structure_mismatch',
            message: `Index '${sourceIndex.name}' has different structure`,
            severity: 'high'
          });
        }
      }
    }
    
    // Check for extra indexes in target
    for (const targetIndex of targetIndexes) {
      const sourceIndex = sourceIndexes.find(idx => idx.name === targetIndex.name);
      if (!sourceIndex) {
        result.extraIndexes.push(targetIndex.name);
        // Extra indexes are not necessarily an error, just a warning
      }
    }
    
    return result;
    
  } catch (error) {
    return {
      passed: false,
      errors: [{
        type: 'index_validation_error',
        message: `Failed to validate indexes: ${error.message}`,
        severity: 'high'
      }],
      sourceIndexes: [],
      targetIndexes: []
    };
  }
}

/**
 * Validate sample documents
 */
async function validateSampleDocuments(sourceCollection, targetCollection, sampleSize) {
  try {
    console.log(`Validating ${sampleSize} sample documents...`);
    
    // Get random sample from source
    const sampleDocs = await sourceCollection.aggregate([
      { $sample: { size: sampleSize } }
    ]).toArray();
    
    const result = {
      passed: true,
      errors: [],
      warnings: [],
      samplesValidated: 0,
      matchedDocuments: 0,
      criticalErrors: 0
    };
    
    for (const sourceDoc of sampleDocs) {
      try {
        const targetDoc = await targetCollection.findOne({ _id: sourceDoc._id });
        
        if (!targetDoc) {
          result.passed = false;
          result.criticalErrors++;
          result.errors.push({
            type: 'missing_document',
            message: `Document with _id '${sourceDoc._id}' not found in target`,
            severity: 'high',
            documentId: sourceDoc._id
          });
        } else {
          // Compare documents (excluding MongoDB internal fields)
          const sourceClean = cleanDocument(sourceDoc);
          const targetClean = cleanDocument(targetDoc);
          
          if (JSON.stringify(sourceClean) === JSON.stringify(targetClean)) {
            result.matchedDocuments++;
          } else {
            result.warnings.push({
              type: 'document_content_difference',
              message: `Document with _id '${sourceDoc._id}' has content differences`,
              severity: 'medium',
              documentId: sourceDoc._id
            });
          }
        }
        
        result.samplesValidated++;
        
      } catch (error) {
        result.warnings.push({
          type: 'document_validation_error',
          message: `Error validating document ${sourceDoc._id}: ${error.message}`,
          severity: 'medium',
          documentId: sourceDoc._id
        });
      }
    }
    
    // Calculate match percentage
    result.matchPercentage = result.samplesValidated > 0 
      ? (result.matchedDocuments / result.samplesValidated) * 100 
      : 0;
    
    console.log(`Sample validation: ${result.matchedDocuments}/${result.samplesValidated} documents matched (${result.matchPercentage.toFixed(1)}%)`);
    
    return result;
    
  } catch (error) {
    return {
      passed: false,
      errors: [{
        type: 'sample_validation_error',
        message: `Sample validation failed: ${error.message}`,
        severity: 'high'
      }],
      samplesValidated: 0,
      matchedDocuments: 0,
      criticalErrors: 1
    };
  }
}

/**
 * Validate all documents (for small collections)
 */
async function validateAllDocuments(sourceCollection, targetCollection) {
  try {
    console.log('Running deep validation on all documents...');
    
    const result = {
      passed: true,
      errors: [],
      documentsValidated: 0,
      matchedDocuments: 0
    };
    
    const cursor = sourceCollection.find({});
    
    for await (const sourceDoc of cursor) {
      const targetDoc = await targetCollection.findOne({ _id: sourceDoc._id });
      
      if (!targetDoc) {
        result.passed = false;
        result.errors.push({
          type: 'missing_document',
          message: `Document with _id '${sourceDoc._id}' not found in target`,
          severity: 'high',
          documentId: sourceDoc._id
        });
      } else {
        const sourceClean = cleanDocument(sourceDoc);
        const targetClean = cleanDocument(targetDoc);
        
        if (JSON.stringify(sourceClean) === JSON.stringify(targetClean)) {
          result.matchedDocuments++;
        } else {
          result.passed = false;
          result.errors.push({
            type: 'document_content_mismatch',
            message: `Document with _id '${sourceDoc._id}' has content differences`,
            severity: 'high',
            documentId: sourceDoc._id
          });
        }
      }
      
      result.documentsValidated++;
    }
    
    console.log(`Deep validation: ${result.matchedDocuments}/${result.documentsValidated} documents matched`);
    
    return result;
    
  } catch (error) {
    return {
      passed: false,
      errors: [{
        type: 'deep_validation_error',
        message: `Deep validation failed: ${error.message}`,
        severity: 'high'
      }],
      documentsValidated: 0,
      matchedDocuments: 0
    };
  }
}

/**
 * Validate collection checksum
 */
async function validateCollectionChecksum(sourceCollection, targetCollection) {
  try {
    console.log('Calculating collection checksums...');
    
    const [sourceChecksum, targetChecksum] = await Promise.all([
      calculateCollectionChecksum(sourceCollection),
      calculateCollectionChecksum(targetCollection)
    ]);
    
    const result = {
      passed: sourceChecksum === targetChecksum,
      errors: [],
      sourceChecksum,
      targetChecksum
    };
    
    if (!result.passed) {
      result.errors.push({
        type: 'checksum_mismatch',
        message: `Collection checksums don't match: source=${sourceChecksum}, target=${targetChecksum}`,
        severity: 'high'
      });
    }
    
    return result;
    
  } catch (error) {
    return {
      passed: false,
      errors: [{
        type: 'checksum_validation_error',
        message: `Checksum validation failed: ${error.message}`,
        severity: 'high'
      }]
    };
  }
}

/**
 * Calculate checksum for a collection
 */
async function calculateCollectionChecksum(collection) {
  const hash = crypto.createHash('sha256');
  const cursor = collection.find({}).sort({ _id: 1 });
  
  for await (const doc of cursor) {
    const cleanDoc = cleanDocument(doc);
    hash.update(JSON.stringify(cleanDoc));
  }
  
  return hash.digest('hex');
}

/**
 * Clean document by removing MongoDB internal fields
 */
function cleanDocument(doc) {
  const cleaned = { ...doc };
  
  // Remove MongoDB internal fields that might differ
  delete cleaned.__v;
  
  return cleaned;
}