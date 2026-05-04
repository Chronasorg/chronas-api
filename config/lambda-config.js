/**
 * Lambda-Optimized Configuration Module
 *
 * DynamoDB-only: no database URI configuration. Secrets Manager still used for
 * JWT/OAuth config under SECRET_CONFIG_NAME.
 */

import Joi from 'joi';
import debug from 'debug';
import memoryCache from 'memory-cache';

import { getApplicationConfig } from './secrets-manager.js';

const debugLog = debug('chronas-api:lambda-config');

let cachedConfig = null;
let configLoadTime = null;

export const isLambdaEnvironment = () => {
  return !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
};

async function getEnvironmentVariables() {
  const mergedSecrets = {};

  Object.assign(mergedSecrets, process.env);

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

  if (process.env.SECRET_CONFIG_NAME || process.env.CHRONAS_CONFIG_SECRET) {
    const secretId = process.env.SECRET_CONFIG_NAME || process.env.CHRONAS_CONFIG_SECRET;

    try {
      debugLog(`Loading additional configuration from Secrets Manager: ${secretId}`);
      const secretConfig = await getApplicationConfig(secretId);

      Object.keys(secretConfig).forEach(key => {
        if (!mergedSecrets[key]) {
          mergedSecrets[key] = secretConfig[key];
        }
      });

      debugLog('Configuration loaded from Secrets Manager');
    } catch (error) {
      debugLog('Failed to load configuration from Secrets Manager:', error.message);
    }
  }

  if (!isLambdaEnvironment()) {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
      Object.assign(mergedSecrets, process.env);
      debugLog('Loaded configuration from .env file');
    } catch (error) {
      debugLog('dotenv not available or failed to load:', error.message);
    }
  }

  return mergedSecrets;
}

const getConfigSchema = () => {
  const isLambda = isLambdaEnvironment();

  return Joi.object({
    NODE_ENV: Joi.string()
      .valid('development', 'production', 'test', 'provision')
      .default(isLambda ? 'production' : 'development'),

    PORT: Joi.number()
      .default(isLambda ? 3000 : 4040),

    JWT_SECRET: Joi.string()
      .when('NODE_ENV', {
        is: Joi.string().equal('development'),
        then: Joi.string().default('dev-jwt-secret-change-in-production'),
        otherwise: Joi.string().required()
      })
      .description('JWT Secret required to sign'),

    SECRET_CONFIG_NAME: Joi.string()
      .allow('', null)
      .default(''),

    CHRONAS_CONFIG_SECRET: Joi.string()
      .allow('', null)
      .default(''),

    region: Joi.string()
      .default('eu-west-1'),

    LAMBDA_TIMEOUT: Joi.number()
      .default(30000),

    LAMBDA_MEMORY: Joi.number()
      .default(512),

    MAILGUN_RECEIVER: Joi.string().allow('', null).default(''),
    GITHUB_CLIENT_ID: Joi.string().allow('', null).default(''),
    TWITTER_CONSUMER_SECRET: Joi.string().allow('', null).default(''),
    GOOGLE_CLIENT_SECRET: Joi.string().allow('', null).default(''),
    MAILGUN_KEY: Joi.string().allow('', null).default(''),
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

  }).unknown(true)
    .required();
};

function validateConfiguration(envVars) {
  const schema = getConfigSchema();
  const { error, value } = schema.validate(envVars, {
    allowUnknown: true,
    stripUnknown: false
  });

  if (error) {
    const errorMessage = `Configuration validation error: ${error.message}`;
    debugLog(errorMessage);

    if (isLambdaEnvironment()) {
      console.error(errorMessage);
      console.error('Continuing with partial configuration...');
      return envVars;
    } else {
      throw new Error(errorMessage);
    }
  }

  return value;
}

function buildConfig(envVars) {
  return {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    isLambda: isLambdaEnvironment(),

    jwtSecret: envVars.JWT_SECRET,

    awsRegion: envVars.region,

    lambda: {
      timeout: envVars.LAMBDA_TIMEOUT,
      memory: envVars.LAMBDA_MEMORY
    },

    mailgunReceiver: envVars.MAILGUN_RECEIVER,
    githubClientId: envVars.GITHUB_CLIENT_ID,
    twitterConsumerSecret: envVars.TWITTER_CONSUMER_SECRET,
    googleClientSecret: envVars.GOOGLE_CLIENT_SECRET,
    mailgunKey: envVars.MAILGUN_KEY,
    googleClientId: envVars.GOOGLE_CLIENT_ID,
    githubClientSecret: envVars.GITHUB_CLIENT_SECRET,
    mailgunDomain: envVars.MAILGUN_DOMAIN,
    paypalClientId: envVars.PAYPAL_CLIENT_ID,
    twitterConsumerKey: envVars.TWITTER_CONSUMER_KEY,
    facebookClientId: envVars.FACEBOOK_CLIENT_ID,
    cloudinaryUrl: envVars.CLOUDINARY_URL,
    facebookClientSecret: envVars.FACEBOOK_CLIENT_SECRET,
    paypalClientSecret: envVars.PAYPAL_CLIENT_SECRET,
    rumEndpoint: envVars.RUMENDPOINT,
    rumRoleArn: envVars.RUMROLEARN,
    rumIdentityPool: envVars.RUMIDENTITYPOOL,
    facebookCallBackUrl: envVars.FACEBOOK_CALLBACK_URL,
    githubCallbackUrl: envVars.GITHUB_CALLBACK_URL,
    googleCallbackUrl: envVars.GOOGLE_CALLBACK_URL,
    twitterCallbackUrl: envVars.TWITTER_CALLBACK_URL,
    rumApplicationId: envVars.RUMAPPLICATIONID,
    chronasHost: envVars.CHRONAS_HOST,

    dynamodb: {
      tablePrefix: envVars.DYNAMODB_TABLE_PREFIX || 'chronas',
      useAreas: envVars.USE_DYNAMODB_AREAS === 'true' || envVars.USE_DYNAMODB_AREAS === true,
      useMarkers: envVars.USE_DYNAMODB_MARKERS === 'true' || envVars.USE_DYNAMODB_MARKERS === true,
      useMetadata: envVars.USE_DYNAMODB_METADATA === 'true' || envVars.USE_DYNAMODB_METADATA === true,
      useUsers: envVars.USE_DYNAMODB_USERS === 'true' || envVars.USE_DYNAMODB_USERS === true,
      useFlags: envVars.USE_DYNAMODB_FLAGS === 'true' || envVars.USE_DYNAMODB_FLAGS === true,
      useRevisions: envVars.USE_DYNAMODB_REVISIONS === 'true' || envVars.USE_DYNAMODB_REVISIONS === true,
      useBoard: envVars.USE_DYNAMODB_BOARD === 'true' || envVars.USE_DYNAMODB_BOARD === true
    }
  };
}

export async function loadConfig(forceReload = false) {
  if (cachedConfig && !forceReload) {
    debugLog('Using cached configuration');
    return cachedConfig;
  }

  const startTime = Date.now();

  try {
    debugLog('Loading configuration...');

    const envVars = await getEnvironmentVariables();
    const validatedVars = validateConfiguration(envVars);

    cachedConfig = buildConfig(validatedVars);
    configLoadTime = Date.now() - startTime;

    debugLog(`Configuration loaded successfully in ${configLoadTime}ms`);

    return cachedConfig;
  } catch (error) {
    debugLog('Configuration loading failed:', error.message);

    if (isLambdaEnvironment()) {
      console.error('Configuration loading failed, using minimal fallback');
      cachedConfig = {
        env: 'production',
        port: 3000,
        isLambda: true,
        jwtSecret: process.env.JWT_SECRET || 'fallback-secret'
      };
      return cachedConfig;
    }

    throw error;
  }
}

export function getConfig() {
  if (!cachedConfig) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

export function clearConfigCache() {
  cachedConfig = null;
  configLoadTime = null;
  debugLog('Configuration cache cleared');
}

export function getConfigMetrics() {
  return {
    cached: !!cachedConfig,
    loadTime: configLoadTime,
    isLambda: isLambdaEnvironment()
  };
}

export const initItemsAndLinksToRefresh = [
  'provinces', 'links', 'ruler', 'culture', 'religion',
  'capital', 'province', 'religionGeneral'
];
export const cache = memoryCache;
