/**
 * Lambda-Optimized Configuration Module
 * 
 * This module provides optimized configuration loading for AWS Lambda
 * with caching, validation, and graceful fallbacks.
 */

import Joi from 'joi';
import debug from 'debug';
import { getApplicationConfig } from './secrets-manager.js';

const debugLog = debug('chronas-api:lambda-config');

// Configuration cache for Lambda optimization
let cachedConfig = null;
let configLoadTime = null;

/**
 * Lambda environment detection
 */
export const isLambdaEnvironment = () => {
  return !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
};

/**
 * Get environment variables with Lambda-specific handling and Secrets Manager integration
 */
async function getEnvironmentVariables() {
  const mergedSecrets = {};
  
  // Start with environment variables
  Object.assign(mergedSecrets, process.env);
  
  // Lambda environment: Check for JSON-encoded configuration
  if (process.env.chronasConfig) {
    try {
      const lambdaEnv = JSON.parse(process.env.chronasConfig);
      Object.keys(lambdaEnv).forEach(key => {
        mergedSecrets[key] = lambdaEnv[key];
      });
      debugLog('Loaded configuration from Lambda environment variable');
    } catch (error) {
      debugLog('Failed to parse chronasConfig JSON:', error.message);
    }
  }
  
  // Load additional configuration from Secrets Manager (if configured)
  if (process.env.SECRET_CONFIG_NAME || process.env.CHRONAS_CONFIG_SECRET) {
    const secretId = process.env.SECRET_CONFIG_NAME || process.env.CHRONAS_CONFIG_SECRET;
    
    try {
      debugLog(`Loading additional configuration from Secrets Manager: ${secretId}`);
      const secretConfig = await getApplicationConfig(secretId);
      
      // Merge secrets manager config (don't override existing env vars)
      Object.keys(secretConfig).forEach(key => {
        if (!mergedSecrets[key]) {
          mergedSecrets[key] = secretConfig[key];
        }
      });
      
      debugLog('Configuration loaded from Secrets Manager');
    } catch (error) {
      debugLog('Failed to load configuration from Secrets Manager:', error.message);
      // Continue without Secrets Manager config (non-fatal)
    }
  }
  
  // Local development: Load .env file (non-Lambda environments only)
  if (!isLambdaEnvironment()) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
      // Re-merge environment variables (in case .env added new ones)
      Object.assign(mergedSecrets, process.env);
      debugLog('Loaded configuration from .env file');
    } catch (error) {
      debugLog('dotenv not available or failed to load:', error.message);
    }
  }
  
  return mergedSecrets;
}

/**
 * Configuration schema with Lambda-optimized defaults
 */
const getConfigSchema = () => {
  const isLambda = isLambdaEnvironment();
  
  return Joi.object({
    NODE_ENV: Joi.string()
      .valid('development', 'production', 'test', 'provision')
      .default(isLambda ? 'production' : 'development'),
    
    PORT: Joi.number()
      .default(isLambda ? 3000 : 4040), // Lambda uses port 3000 by default
    
    MONGOOSE_DEBUG: Joi.boolean()
      .when('NODE_ENV', {
        is: Joi.string().equal('development'),
        then: Joi.boolean().default(true),
        otherwise: Joi.boolean().default(false)
      }),
    
    JWT_SECRET: Joi.string()
      .when('NODE_ENV', {
        is: Joi.string().equal('development'),
        then: Joi.string().default('dev-jwt-secret-change-in-production'),
        otherwise: Joi.string().required()
      })
      .description('JWT Secret required to sign'),
    
    SECRET_DB_NAME: Joi.string()
      .default('/chronas/docdb/newpassword'),
    
    SECRET_MODERNIZED_DB_NAME: Joi.string()
      .allow('', null)
      .default(''),
    
    SECRET_CONFIG_NAME: Joi.string()
      .allow('', null)
      .default(''),
    
    CHRONAS_CONFIG_SECRET: Joi.string()
      .allow('', null)
      .default(''),
    
    region: Joi.string()
      .default('eu-west-1'),
    
    MONGO_HOST: Joi.string()
      .when('NODE_ENV', {
        is: Joi.string().equal('development'),
        then: Joi.string().default('mongodb://localhost:27017/chronas-api'),
        otherwise: Joi.string().required()
      })
      .description('MongoDB/DocumentDB host URL'),
    
    MONGO_PORT: Joi.number()
      .default(27017),
    
    // Lambda-specific optimizations
    LAMBDA_TIMEOUT: Joi.number()
      .default(30000), // 30 seconds default timeout
    
    LAMBDA_MEMORY: Joi.number()
      .default(512), // 512MB default memory
    
    // Optional configuration with graceful fallbacks
    APPINSIGHTS_CONNECTION_STRING: Joi.string().allow('', null).default(''),
    MAILGUN_RECEIVER: Joi.string().allow('', null).default(''),
    GITHUB_CLIENT_ID: Joi.string().allow('', null).default(''),
    TWITTER_CONSUMER_SECRET: Joi.string().allow('', null).default(''),
    GOOGLE_CLIENT_SECRET: Joi.string().allow('', null).default(''),
    MAILGUN_KEY: Joi.string().allow('', null).default(''),
    APPINSIGHTS_INSTRUMENTATIONKEY: Joi.string().allow('', null).default(''),
    GOOGLE_CLIENT_ID: Joi.string().allow('', null).default(''),
    GITHUB_CLIENT_SECRET: Joi.string().allow('', null).default(''),
    MAILGUN_DOMAIN: Joi.string().allow('', null).default(''),
    PAYPAL_CLIENT_ID: Joi.string().allow('', null).default(''),
    TWITTER_CONSUMER_KEY: Joi.string().allow('', null).default(''),
    FACEBOOK_CLIENT_ID: Joi.string().allow('', null).default(''),
    CLOUDINARY_URL: Joi.string().allow('', null).default(''),
    FACEBOOK_CLIENT_SECRET: Joi.string().allow('', null).default(''),
    PAYPAL_CLIENT_SECRET: Joi.string().allow('', null).default(''),
    RUMENDPOINT: Joi.string().allow('', null).default(''),
    RUMROLEARN: Joi.string().allow('', null).default(''),
    RUMIDENTITYPOOL: Joi.string().allow('', null).default(''),
    FACEBOOK_CALLBACK_URL: Joi.string().allow('', null).default(''),
    GITHUB_CALLBACK_URL: Joi.string().allow('', null).default(''),
    GOOGLE_CALLBACK_URL: Joi.string().allow('', null).default(''),
    TWITTER_CALLBACK_URL: Joi.string().allow('', null).default(''),
    RUMAPPLICATIONID: Joi.string().allow('', null).default(''),
    CHRONAS_HOST: Joi.string().allow('', null).default('')
    
  }).unknown(true) // Allow unknown environment variables
    .required();
};

/**
 * Validate and process configuration
 */
function validateConfiguration(envVars) {
  const schema = getConfigSchema();
  const { error, value } = schema.validate(envVars, {
    allowUnknown: true,
    stripUnknown: false
  });
  
  if (error) {
    const errorMessage = `Configuration validation error: ${error.message}`;
    debugLog(errorMessage);
    
    // In Lambda, log error but don't crash immediately
    if (isLambdaEnvironment()) {
      console.error(errorMessage);
      console.error('Continuing with partial configuration...');
      return envVars; // Return unvalidated config as fallback
    } else {
      throw new Error(errorMessage);
    }
  }
  
  return value;
}

/**
 * Build configuration object
 */
function buildConfig(envVars) {
  return {
    // Environment
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    isLambda: isLambdaEnvironment(),
    
    // Database
    mongooseDebug: envVars.MONGOOSE_DEBUG,
    mongo: {
      host: envVars.MONGO_HOST,
      port: envVars.MONGO_PORT
    },
    
    // Security
    jwtSecret: envVars.JWT_SECRET,
    
    // AWS - use original database secret
    docDbsecretName: envVars.SECRET_DB_NAME,
    awsRegion: envVars.region,
    
    // Lambda-specific
    lambda: {
      timeout: envVars.LAMBDA_TIMEOUT,
      memory: envVars.LAMBDA_MEMORY
    },
    
    // External services (with fallbacks)
    appInsightsConnectionString: envVars.APPINSIGHTS_CONNECTION_STRING,
    mailgunReceiver: envVars.MAILGUN_RECEIVER,
    githubClientId: envVars.GITHUB_CLIENT_ID,
    twitterConsumerSecret: envVars.TWITTER_CONSUMER_SECRET,
    googleClientSecret: envVars.GOOGLE_CLIENT_SECRET,
    mailgunKey: envVars.MAILGUN_KEY,
    appinsightsInstrumentationkey: envVars.APPINSIGHTS_INSTRUMENTATIONKEY,
    googleClientId: envVars.GOOGLE_CLIENT_ID,
    githubClientSecret: envVars.GITHUB_CLIENT_SECRET,
    mailgunDomain: envVars.MAILGUN_DOMAIN,
    paypalClientId: envVars.PAYPAL_CLIENT_ID,
    twitterConsumerKey: envVars.TWITTER_CONSUMER_KEY,
    facebookClientId: envVars.FACEBOOK_CLIENT_ID,
    cloudinaryUrl: envVars.CLOUDINARY_URL,
    facebookClientSecret: envVars.FACEBOOK_CLIENT_SECRET,
    paypalClientSecret: envVars.PAYPAL_CLIENT_SECRET,
    appinsightsConnectionString: envVars.APPINSIGHTS_CONNECTION_STRING,
    rumEndpoint: envVars.RUMENDPOINT,
    rumRoleArn: envVars.RUMROLEARN,
    rumIdentityPool: envVars.RUMIDENTITYPOOL,
    facebookCallBackUrl: envVars.FACEBOOK_CALLBACK_URL,
    githubCallbackUrl: envVars.GITHUB_CALLBACK_URL,
    googleCallbackUrl: envVars.GOOGLE_CALLBACK_URL,
    twitterCallbackUrl: envVars.TWITTER_CALLBACK_URL,
    rumApplicationId: envVars.RUMAPPLICATIONID,
    chronasHost: envVars.CHRONAS_HOST
  };
}

/**
 * Load configuration with caching for Lambda optimization
 */
export async function loadConfig(forceReload = false) {
  // Return cached config if available and not forcing reload
  if (cachedConfig && !forceReload) {
    debugLog('Using cached configuration');
    return cachedConfig;
  }
  
  const startTime = Date.now();
  
  try {
    debugLog('Loading configuration...');
    
    // Get environment variables
    const envVars = await getEnvironmentVariables();
    
    // Validate configuration
    const validatedVars = validateConfiguration(envVars);
    
    // Build configuration object
    cachedConfig = buildConfig(validatedVars);
    configLoadTime = Date.now() - startTime;
    
    debugLog(`Configuration loaded successfully in ${configLoadTime}ms`);
    
    // Log configuration summary (without sensitive data)
    if (debugLog.enabled) {
      const configSummary = {
        env: cachedConfig.env,
        isLambda: cachedConfig.isLambda,
        port: cachedConfig.port,
        mongoHost: cachedConfig.mongo.host ? '[CONFIGURED]' : '[NOT SET]',
        jwtSecret: cachedConfig.jwtSecret ? '[CONFIGURED]' : '[NOT SET]'
      };
      debugLog('Configuration summary:', configSummary);
    }
    
    return cachedConfig;
    
  } catch (error) {
    debugLog('Configuration loading failed:', error.message);
    
    // In Lambda, provide minimal fallback configuration
    if (isLambdaEnvironment()) {
      console.error('Configuration loading failed, using minimal fallback');
      cachedConfig = {
        env: 'production',
        port: 3000,
        isLambda: true,
        mongo: {
          host: process.env.MONGO_HOST || 'mongodb://localhost:27017/chronas-api',
          port: 27017
        },
        jwtSecret: process.env.JWT_SECRET || 'fallback-secret',
        mongooseDebug: false
      };
      return cachedConfig;
    }
    
    throw error;
  }
}

/**
 * Get cached configuration (synchronous)
 */
export function getConfig() {
  if (!cachedConfig) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

/**
 * Clear configuration cache
 */
export function clearConfigCache() {
  cachedConfig = null;
  configLoadTime = null;
  debugLog('Configuration cache cleared');
}

/**
 * Get configuration loading performance metrics
 */
export function getConfigMetrics() {
  return {
    cached: !!cachedConfig,
    loadTime: configLoadTime,
    isLambda: isLambdaEnvironment()
  };
}

// Initialize items and links to refresh (from original config)
export const initItemsAndLinksToRefresh = [
  'provinces', 'links', 'ruler', 'culture', 'religion', 
  'capital', 'province', 'religionGeneral'
];

// Memory cache export for backward compatibility
import memoryCache from 'memory-cache';
export const cache = memoryCache;