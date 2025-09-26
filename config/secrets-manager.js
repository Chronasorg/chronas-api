/**
 * AWS Secrets Manager Integration (SDK v3)
 * 
 * This module provides optimized Secrets Manager integration with caching,
 * error handling, and Lambda performance optimization.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import debug from 'debug';

const debugLog = debug('chronas-api:secrets-manager');

// Secrets cache for Lambda optimization
const secretsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Secrets Manager client (singleton)
let secretsManagerClient = null;

/**
 * Get or create Secrets Manager client
 */
function getSecretsManagerClient() {
  if (!secretsManagerClient) {
    const region = process.env.AWS_REGION || process.env.region || 'eu-west-1';
    
    secretsManagerClient = new SecretsManagerClient({
      region,
      // Lambda optimization: reuse connections
      maxAttempts: 3,
      requestTimeout: 10000, // 10 seconds timeout
    });
    
    debugLog(`Secrets Manager client created for region: ${region}`);
  }
  
  return secretsManagerClient;
}

/**
 * Check if cached secret is still valid
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_TTL;
}

/**
 * Get secret from cache
 */
function getCachedSecret(secretId) {
  const cacheEntry = secretsCache.get(secretId);
  
  if (isCacheValid(cacheEntry)) {
    debugLog(`Using cached secret: ${secretId}`);
    return cacheEntry.value;
  }
  
  // Remove expired cache entry
  if (cacheEntry) {
    secretsCache.delete(secretId);
    debugLog(`Expired cache entry removed: ${secretId}`);
  }
  
  return null;
}

/**
 * Cache secret value
 */
function cacheSecret(secretId, value) {
  secretsCache.set(secretId, {
    value,
    timestamp: Date.now()
  });
  
  debugLog(`Secret cached: ${secretId}`);
}

/**
 * Retrieve secret from AWS Secrets Manager with caching
 * @param {string} secretId - The secret ID or ARN
 * @param {object} options - Options for secret retrieval
 * @returns {Promise<object>} Parsed secret value
 */
export async function getSecret(secretId, options = {}) {
  const {
    useCache = true,
    parseJson = true,
    retryAttempts = 3,
    retryDelay = 1000
  } = options;
  
  try {
    // Check cache first (if enabled)
    if (useCache) {
      const cachedValue = getCachedSecret(secretId);
      if (cachedValue) {
        return cachedValue;
      }
    }
    
    debugLog(`Retrieving secret from AWS: ${secretId}`);
    
    const client = getSecretsManagerClient();
    const command = new GetSecretValueCommand({
      SecretId: secretId
    });
    
    let lastError;
    
    // Retry logic for transient failures
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await client.send(command);
        
        if (!response.SecretString) {
          throw new Error('SecretString not found in response');
        }
        
        let secretValue;
        
        if (parseJson) {
          try {
            secretValue = JSON.parse(response.SecretString);
          } catch (parseError) {
            debugLog(`Failed to parse secret as JSON: ${parseError.message}`);
            secretValue = response.SecretString;
          }
        } else {
          secretValue = response.SecretString;
        }
        
        // Cache the secret (if caching enabled)
        if (useCache) {
          cacheSecret(secretId, secretValue);
        }
        
        debugLog(`Secret retrieved successfully: ${secretId}`);
        return secretValue;
        
      } catch (error) {
        lastError = error;
        debugLog(`Attempt ${attempt} failed for secret ${secretId}: ${error.message}`);
        
        // Don't retry on certain errors
        if (error.name === 'ResourceNotFoundException' || 
            error.name === 'AccessDeniedException' ||
            error.name === 'InvalidParameterException') {
          break;
        }
        
        // Wait before retry (except on last attempt)
        if (attempt < retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }
    
    throw lastError;
    
  } catch (error) {
    debugLog(`Failed to retrieve secret ${secretId}: ${error.message}`);
    throw new Error(`Failed to retrieve secret ${secretId}: ${error.message}`);
  }
}

/**
 * Get database credentials from Secrets Manager
 * @param {string} secretId - Database secret ID
 * @returns {Promise<object>} Database credentials
 */
export async function getDatabaseCredentials(secretId) {
  try {
    const credentials = await getSecret(secretId, {
      useCache: true,
      parseJson: true
    });
    
    // Validate required fields
    const requiredFields = ['host', 'username', 'password'];
    const missingFields = requiredFields.filter(field => !credentials[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required database credential fields: ${missingFields.join(', ')}`);
    }
    
    debugLog('Database credentials retrieved and validated');
    
    // Handle TLS configuration - check both 'tls' and 'ssl' fields
    // For our DocumentDB cluster, TLS is disabled, so we should not use TLS
    // Override the secret's ssl setting based on our cluster configuration
    const shouldUseTLS = process.env.DOCDB_TLS_ENABLED === 'true' || 
                        credentials.tls === true || 
                        (credentials.ssl === true && process.env.DOCDB_TLS_ENABLED !== 'false');
    
    // For our current DocumentDB cluster, TLS is disabled in the parameter group
    // So we force TLS to false regardless of what the secret says
    const useTLS = process.env.NODE_ENV === 'development' ? false : false; // Disabled for our cluster
    
    return {
      host: credentials.host,
      port: credentials.port || 27017,
      username: credentials.username,
      password: credentials.password,
      database: credentials.database || 'chronas',
      tls: useTLS, // Use our cluster-specific TLS setting
      // Additional DocumentDB-specific options
      replicaSet: credentials.replicaSet || 'rs0',
      retryWrites: false // DocumentDB doesn't support retryWrites
    };
    
  } catch (error) {
    debugLog(`Failed to get database credentials: ${error.message}`);
    throw error;
  }
}

/**
 * Get application configuration from Secrets Manager
 * @param {string} secretId - Application config secret ID
 * @returns {Promise<object>} Application configuration
 */
export async function getApplicationConfig(secretId) {
  try {
    const config = await getSecret(secretId, {
      useCache: true,
      parseJson: true
    });
    
    debugLog('Application configuration retrieved from Secrets Manager');
    return config;
    
  } catch (error) {
    debugLog(`Failed to get application config: ${error.message}`);
    
    // Return empty config as fallback (don't throw)
    console.warn(`Warning: Could not retrieve application config from ${secretId}: ${error.message}`);
    return {};
  }
}

/**
 * Build MongoDB connection URI from credentials
 * @param {object} credentials - Database credentials
 * @returns {string} MongoDB connection URI
 */
export function buildMongoUri(credentials) {
  const {
    username,
    password,
    host,
    port = 27017,
    database = 'chronas',
    replicaSet = 'rs0',
    retryWrites = false
  } = credentials;
  
  // Encode username and password for URI
  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  
  // Build connection URI
  let uri = `mongodb://${encodedUsername}:${encodedPassword}@${host}:${port}/${database}`;
  
  // Add query parameters
  const params = new URLSearchParams();
  if (replicaSet) params.append('replicaSet', replicaSet);
  if (!retryWrites) params.append('retryWrites', 'false');
  
  if (params.toString()) {
    uri += `?${params.toString()}`;
  }
  
  debugLog('MongoDB URI built from credentials');
  return uri;
}

/**
 * Initialize database connection using Secrets Manager
 * @param {string} secretId - Database secret ID
 * @returns {Promise<string>} MongoDB connection URI
 */
export async function initializeDatabaseFromSecrets(secretId) {
  try {
    debugLog(`Initializing database connection from secret: ${secretId}`);
    
    const credentials = await getDatabaseCredentials(secretId);
    const mongoUri = buildMongoUri(credentials);
    
    debugLog('Database connection URI created from Secrets Manager');
    return mongoUri;
    
  } catch (error) {
    debugLog(`Failed to initialize database from secrets: ${error.message}`);
    throw error;
  }
}

/**
 * Clear secrets cache (useful for testing or forced refresh)
 */
export function clearSecretsCache() {
  secretsCache.clear();
  debugLog('Secrets cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const stats = {
    size: secretsCache.size,
    entries: Array.from(secretsCache.keys()),
    ttl: CACHE_TTL
  };
  
  debugLog('Cache stats:', stats);
  return stats;
}

/**
 * Health check for Secrets Manager connectivity
 */
export async function healthCheck() {
  try {
    const client = getSecretsManagerClient();
    
    // Try to list secrets (this will fail if no permissions, but validates connectivity)
    // We don't actually need the result, just want to test the connection
    const testCommand = new GetSecretValueCommand({
      SecretId: 'non-existent-secret-for-health-check'
    });
    
    try {
      await client.send(testCommand);
    } catch (error) {
      // ResourceNotFoundException is expected and means connectivity is working
      if (error.name === 'ResourceNotFoundException') {
        return {
          healthy: true,
          message: 'Secrets Manager connectivity verified'
        };
      }
      throw error;
    }
    
    return {
      healthy: true,
      message: 'Secrets Manager connectivity verified'
    };
    
  } catch (error) {
    return {
      healthy: false,
      message: `Secrets Manager health check failed: ${error.message}`
    };
  }
}

export default {
  getSecret,
  getDatabaseCredentials,
  getApplicationConfig,
  buildMongoUri,
  initializeDatabaseFromSecrets,
  clearSecretsCache,
  getCacheStats,
  healthCheck
};