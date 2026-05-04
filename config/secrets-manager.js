/**
 * AWS Secrets Manager Integration (SDK v3)
 *
 * DynamoDB-only: only used for application configuration (JWT_SECRET, OAuth
 * client secrets, etc.) retrieved via SECRET_CONFIG_NAME.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import debug from 'debug';

const debugLog = debug('chronas-api:secrets-manager');

const secretsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

let secretsManagerClient = null;

function getSecretsManagerClient() {
  if (!secretsManagerClient) {
    const region = process.env.AWS_REGION || process.env.region || 'eu-west-1';

    secretsManagerClient = new SecretsManagerClient({
      region,
      maxAttempts: 3,
      requestTimeout: 10000
    });

    debugLog(`Secrets Manager client created for region: ${region}`);
  }

  return secretsManagerClient;
}

function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_TTL;
}

function getCachedSecret(secretId) {
  const cacheEntry = secretsCache.get(secretId);

  if (isCacheValid(cacheEntry)) {
    debugLog(`Using cached secret: ${secretId}`);
    return cacheEntry.value;
  }

  if (cacheEntry) {
    secretsCache.delete(secretId);
    debugLog(`Expired cache entry removed: ${secretId}`);
  }

  return null;
}

function cacheSecret(secretId, value) {
  secretsCache.set(secretId, {
    value,
    timestamp: Date.now()
  });

  debugLog(`Secret cached: ${secretId}`);
}

export async function getSecret(secretId, options = {}) {
  const {
    useCache = true,
    parseJson = true,
    retryAttempts = 3,
    retryDelay = 1000
  } = options;

  try {
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

        if (useCache) {
          cacheSecret(secretId, secretValue);
        }

        debugLog(`Secret retrieved successfully: ${secretId}`);
        return secretValue;
      } catch (error) {
        lastError = error;
        debugLog(`Attempt ${attempt} failed for secret ${secretId}: ${error.message}`);

        if (error.name === 'ResourceNotFoundException' ||
          error.name === 'AccessDeniedException' ||
          error.name === 'InvalidParameterException') {
          break;
        }

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
    console.warn(`Warning: Could not retrieve application config from ${secretId}: ${error.message}`);
    return {};
  }
}

export function clearSecretsCache() {
  secretsCache.clear();
  debugLog('Secrets cache cleared');
}

export function getCacheStats() {
  return {
    size: secretsCache.size,
    entries: Array.from(secretsCache.keys()),
    ttl: CACHE_TTL
  };
}

export async function healthCheck() {
  try {
    const client = getSecretsManagerClient();

    const testCommand = new GetSecretValueCommand({
      SecretId: 'non-existent-secret-for-health-check'
    });

    try {
      await client.send(testCommand);
    } catch (error) {
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
  getApplicationConfig,
  clearSecretsCache,
  getCacheStats,
  healthCheck
};
