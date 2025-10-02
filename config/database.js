/**
 * Database Connection Configuration for DocumentDB
 * 
 * This module handles MongoDB/DocumentDB connections with Lambda optimization
 * and TLS support for AWS DocumentDB clusters.
 */

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import debug from 'debug';
import { initializeDatabaseFromSecrets, getDatabaseCredentials } from './secrets-manager.js';

const debugLog = debug('chronas-api:database');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connection cache for Lambda optimization
let cachedConnection = null;

/**
 * DocumentDB TLS Certificate paths
 * Using the latest AWS global certificate bundle for DocumentDB
 */
const TLS_CERT_PATHS = [
  '/opt/global-bundle.pem',  // Lambda layer path
  path.join(__dirname, '../certs/global-bundle.pem'),  // Local development (new bundle)
  path.join(__dirname, '../certs/rds-ca-2019-root.pem'),  // Fallback to old certificate
  path.join(__dirname, '../migration/rds-ca-2019-root.pem')  // Migration script path
];

/**
 * Get the TLS certificate path
 * @returns {string|null} Path to TLS certificate or null if not found
 */
function getTLSCertificatePath() {
  for (const certPath of TLS_CERT_PATHS) {
    if (fs.existsSync(certPath)) {
      debugLog(`Found TLS certificate at: ${certPath}`);
      return certPath;
    }
  }
  
  debugLog('No TLS certificate found in any of the expected paths');
  return null;
}

/**
 * Determine if TLS should be used based on connection URI and environment
 * @param {string} uri - MongoDB connection URI
 * @returns {boolean} True if TLS should be used
 */
function shouldUseTLS(uri) {
  // Check environment variable first (explicit override)
  if (process.env.MONGODB_USE_TLS === 'true') return true;
  if (process.env.MONGODB_USE_TLS === 'false') return false;
  
  // For DocumentDB clusters, TLS is required by default with the new certificate bundle
  if (uri.includes('docdb')) {
    // TLS is now enabled by default for DocumentDB with proper certificate
    return process.env.DOCDB_TLS_ENABLED !== 'false';  // Default to true unless explicitly disabled
  }
  
  // For other MongoDB instances, default to false (local development)
  return false;
}

/**
 * Get optimized connection options for the current environment
 * @param {string} uri - MongoDB connection URI
 * @returns {object} Mongoose connection options
 */
function getConnectionOptions(uri) {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const useTLS = shouldUseTLS(uri);
  
  // Base connection options optimized for DocumentDB 5.0
  const options = {
    // Connection pooling - optimized for Lambda
    maxPoolSize: isLambda ? 1 : 10,  // Single connection for Lambda
    minPoolSize: isLambda ? 0 : 2,   // No minimum for Lambda
    
    // Timeouts - increased for DocumentDB 5.0
    serverSelectionTimeoutMS: 10000,  // 10 seconds (increased for DocumentDB)
    socketTimeoutMS: 45000,           // 45 seconds (Lambda timeout consideration)
    connectTimeoutMS: 15000,          // 15 seconds (increased for DocumentDB)
    
    // Buffer settings for Lambda
    bufferCommands: !isLambda,        // Disable buffering in Lambda
    
    // DocumentDB 5.0 specific settings
    retryWrites: false,               // DocumentDB doesn't support retryWrites
    directConnection: false,          // Use cluster connection for DocumentDB
    readPreference: 'primary',        // Ensure we read from primary
    readConcern: { level: 'local' },  // DocumentDB compatible read concern
    
    // Authentication mechanism - DocumentDB requires SCRAM-SHA-1
    authMechanism: 'SCRAM-SHA-1',     // DocumentDB doesn't support SCRAM-SHA-256
  };
  
  console.log('🔧 Connection options configured:', {
    isLambda,
    useTLS,
    maxPoolSize: options.maxPoolSize,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
    connectTimeoutMS: options.connectTimeoutMS,
    bufferCommands: options.bufferCommands,
    directConnection: options.directConnection,
    readPreference: options.readPreference
  });

  // Add TLS configuration for DocumentDB
  if (useTLS) {
    const tlsCertPath = getTLSCertificatePath();
    
    if (tlsCertPath) {
      options.tls = true;
      options.tlsCAFile = tlsCertPath;
      options.tlsAllowInvalidHostnames = false;
      options.tlsAllowInvalidCertificates = false;
      debugLog('TLS configuration enabled with certificate');
    } else {
      debugLog('WARNING: TLS required but certificate not found');
      // Still enable TLS but without custom CA file
      options.tls = true;
    }
  }

  debugLog('Connection options:', {
    isLambda,
    useTLS,
    maxPoolSize: options.maxPoolSize,
    bufferCommands: options.bufferCommands,
    tlsEnabled: options.tls || false
  });

  return options;
}

/**
 * Connect to MongoDB/DocumentDB with optimized settings
 * @param {string} uri - MongoDB connection URI
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
export async function connectToDatabase(uri) {
  // Return cached connection if available and healthy
  if (cachedConnection && mongoose.connection.readyState === 1) {
    debugLog('Using cached database connection');
    return cachedConnection;
  }

  try {
    debugLog('Establishing new database connection...');
    
    const options = getConnectionOptions(uri);
    
    // Set mongoose promise library
    mongoose.Promise = global.Promise;
    
    // Connect to database
    cachedConnection = await mongoose.connect(uri, options);
    
    debugLog('Database connection established successfully');
    
    // Set up connection event handlers
    setupConnectionEventHandlers();
    
    return cachedConnection;
    
  } catch (error) {
    debugLog('Database connection failed:', error.message);
    cachedConnection = null;
    throw error;
  }
}

/**
 * Connect to database using Secrets Manager for credentials
 * @param {string} secretId - Secrets Manager secret ID for database credentials
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
export async function connectToDatabaseWithSecrets(secretId) {
  try {
    console.log(`🔐 Connecting to database using Secrets Manager: ${secretId}`);
    debugLog(`Connecting to database using Secrets Manager: ${secretId}`);
    
    const uri = await initializeDatabaseFromSecrets(secretId);
    console.log('🔗 Database URI created from secrets (masked):', uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    
    const connection = await connectToDatabase(uri);
    console.log('✅ Database connection established via Secrets Manager');
    return connection;
    
  } catch (error) {
    console.error('❌ Failed to connect to database with secrets:', error.message);
    console.error('🔍 Secrets connection error details:', error);
    debugLog('Failed to connect to database with secrets:', error.message);
    throw error;
  }
}

/**
 * Initialize database connection with automatic credential detection
 * @param {object} config - Configuration object
 * @returns {Promise<mongoose.Connection>} Mongoose connection
 */
export async function initializeDatabaseConnection(config) {
  try {
    console.log('🔌 Starting database initialization...');
    console.log('📋 Database config:', {
      docDbsecretName: config.docDbsecretName,
      mongoHost: config.mongo?.host,
      mongoPort: config.mongo?.port
    });
    
    // Try Secrets Manager first (if configured)
    if (config.docDbsecretName) {
      console.log(`🔐 Attempting database connection via Secrets Manager: ${config.docDbsecretName}`);
      debugLog('Attempting database connection via Secrets Manager');
      
      try {
        const connection = await connectToDatabaseWithSecrets(config.docDbsecretName);
        console.log('✅ Database connected successfully via Secrets Manager');
        return connection;
      } catch (secretsError) {
        console.error('❌ Secrets Manager connection failed:', secretsError.message);
        console.error('🔍 Secrets error details:', secretsError);
        debugLog('Secrets Manager connection failed, falling back to direct URI:', secretsError.message);
        
        // Fall back to direct URI if Secrets Manager fails
        if (config.mongo && config.mongo.host) {
          console.log('🔄 Falling back to direct URI connection');
          return await connectToDatabase(config.mongo.host);
        }
        
        throw secretsError;
      }
    }
    
    // Use direct URI connection
    if (config.mongo && config.mongo.host) {
      console.log('🔗 Using direct URI for database connection');
      debugLog('Using direct URI for database connection');
      return await connectToDatabase(config.mongo.host);
    }
    
    const error = new Error('No database configuration found (neither Secrets Manager nor direct URI)');
    console.error('❌ Database initialization failed: No configuration found');
    throw error;
    
  } catch (error) {
    console.error('💥 Database initialization failed:', error.message);
    console.error('🔍 Full error:', error);
    debugLog('Database initialization failed:', error.message);
    throw error;
  }
}

/**
 * Set up connection event handlers
 */
function setupConnectionEventHandlers() {
  const connection = mongoose.connection;
  
  // Remove existing listeners to prevent duplicates
  connection.removeAllListeners();
  
  connection.on('connected', () => {
    debugLog('Connected to MongoDB/DocumentDB');
  });
  
  connection.on('error', (error) => {
    debugLog('Database connection error:', error.message);
    cachedConnection = null;
  });
  
  connection.on('disconnected', () => {
    debugLog('Disconnected from MongoDB/DocumentDB');
    cachedConnection = null;
  });
  
  connection.on('reconnected', () => {
    debugLog('Reconnected to MongoDB/DocumentDB');
  });
  
  connection.on('close', () => {
    debugLog('Database connection closed');
    cachedConnection = null;
  });
}

/**
 * Close database connection gracefully
 * @returns {Promise<void>}
 */
export async function closeDatabaseConnection() {
  if (cachedConnection) {
    debugLog('Closing database connection...');
    await mongoose.connection.close();
    cachedConnection = null;
    debugLog('Database connection closed');
  }
}

/**
 * Get current connection status
 * @returns {object} Connection status information
 */
export function getConnectionStatus() {
  const connection = mongoose.connection;
  
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized'
  };
  
  return {
    readyState: connection.readyState,
    state: states[connection.readyState] || 'unknown',
    host: connection.host,
    name: connection.name,
    isConnected: connection.readyState === 1
  };
}

/**
 * Test database connectivity with a simple ping
 * @returns {Promise<boolean>} True if database is accessible
 */
export async function testDatabaseConnectivity() {
  try {
    if (mongoose.connection.readyState !== 1) {
      return false;
    }
    
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    
    return result.ok === 1;
  } catch (error) {
    debugLog('Database connectivity test failed:', error.message);
    return false;
  }
}

export default {
  connectToDatabase,
  closeDatabaseConnection,
  getConnectionStatus,
  testDatabaseConnectivity
};