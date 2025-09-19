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

const debugLog = debug('chronas-api:database');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connection cache for Lambda optimization
let cachedConnection = null;

/**
 * DocumentDB TLS Certificate paths
 */
const TLS_CERT_PATHS = [
  '/opt/rds-ca-2019-root.pem',  // Lambda layer path
  path.join(__dirname, '../certs/rds-ca-2019-root.pem'),  // Local development
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
 * Determine if TLS should be used based on connection URI
 * @param {string} uri - MongoDB connection URI
 * @returns {boolean} True if TLS should be used
 */
function shouldUseTLS(uri) {
  // Use TLS for DocumentDB clusters (contains 'docdb' in hostname)
  // or when explicitly configured via environment variable
  return uri.includes('docdb') || process.env.MONGODB_USE_TLS === 'true';
}

/**
 * Get optimized connection options for the current environment
 * @param {string} uri - MongoDB connection URI
 * @returns {object} Mongoose connection options
 */
function getConnectionOptions(uri) {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const useTLS = shouldUseTLS(uri);
  
  // Base connection options
  const options = {
    // Connection pooling - optimized for Lambda
    maxPoolSize: isLambda ? 1 : 10,  // Single connection for Lambda
    minPoolSize: isLambda ? 0 : 2,   // No minimum for Lambda
    
    // Timeouts
    serverSelectionTimeoutMS: 5000,   // 5 seconds
    socketTimeoutMS: 45000,           // 45 seconds (Lambda timeout consideration)
    connectTimeoutMS: 10000,          // 10 seconds
    
    // Keep alive settings (removed deprecated keepAlive options)
    // keepAlive is now handled automatically by the driver
    
    // Buffer settings for Lambda
    bufferCommands: !isLambda,        // Disable buffering in Lambda
    
    // DocumentDB specific settings
    retryWrites: false,               // DocumentDB doesn't support retryWrites
    directConnection: false,          // Use replica set connection
  };

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