/**
 * Lambda-Optimized Application Initialization
 *
 * DynamoDB-only: no database connection step — all models read/write DynamoDB
 * via the AWS SDK.
 */

import debug from 'debug';

import { loadConfig, isLambdaEnvironment } from './lambda-config.js';

const debugLog = debug('chronas-api:lambda-app');

// Application state cache
const appState = {
  initialized: false,
  initTime: null,
  config: null,
  expressApp: null,
  initError: null
};

/**
 * Cold start optimization - pre-initialize heavy dependencies
 */
async function preInitializeDependencies() {
  const startTime = Date.now();

  try {
    debugLog('Pre-initializing dependencies for cold start optimization...');

    const modulePromises = [
      import('express'),
      import('cors'),
      import('helmet'),
      import('compression'),
      import('morgan')
    ];

    await Promise.all(modulePromises);

    const preInitTime = Date.now() - startTime;
    debugLog(`Dependencies pre-initialized in ${preInitTime}ms`);

    return true;
  } catch (error) {
    debugLog('Dependency pre-initialization failed:', error.message);
    return false;
  }
}

/**
 * Create Express application with Lambda optimizations
 */
async function createExpressApp(config) {
  debugLog('Creating Express application...');

  const { default: expressApp } = await import('./express.js');

  if (config.isLambda) {
    expressApp.use((req, res, next) => {
      res.set('Connection', 'close');
      next();
    });

    expressApp.use((req, res, next) => {
      req.isLambda = true;
      req.lambdaContext = res.locals.lambdaContext;
      next();
    });
  }

  debugLog('Express application created');
  return expressApp;
}

/**
 * Initialize application with cold start optimization
 */
export async function initializeApp(forceReload = false) {
  if (appState.initialized && !forceReload) {
    debugLog('Using cached application state');
    return {
      app: appState.expressApp,
      config: appState.config,
      initTime: appState.initTime
    };
  }

  const startTime = Date.now();

  try {
    debugLog('Initializing application...');

    appState.initialized = false;
    appState.initError = null;

    const [, config] = await Promise.all([
      preInitializeDependencies(),
      loadConfig(forceReload)
    ]);

    appState.config = config;

    const expressApp = await createExpressApp(config);
    appState.expressApp = expressApp;

    appState.initialized = true;
    appState.initTime = Date.now() - startTime;

    debugLog(`Application initialized successfully in ${appState.initTime}ms`);

    return {
      app: appState.expressApp,
      config: appState.config,
      initTime: appState.initTime
    };
  } catch (error) {
    appState.initError = error;
    appState.initTime = Date.now() - startTime;

    debugLog(`Application initialization failed after ${appState.initTime}ms:`, error.message);
    throw error;
  }
}

export function getAppState() {
  return {
    ...appState,
    uptime: appState.initTime ? Date.now() - appState.initTime : 0
  };
}

export function checkAppHealth() {
  return {
    initialized: appState.initialized,
    hasError: !!appState.initError,
    initTime: appState.initTime,
    uptime: appState.initTime ? Date.now() - appState.initTime : 0
  };
}

export async function shutdownApp() {
  debugLog('Shutting down application...');
  appState.initialized = false;
  appState.expressApp = null;
  debugLog('Application shutdown completed');
}

export async function warmUp() {
  debugLog('Warming up Lambda function...');
  await initializeApp();
  return checkAppHealth();
}

export function setupLambdaContext(event, context) {
  const lambdaContext = {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis(),
    event: {
      httpMethod: event.httpMethod,
      path: event.path,
      headers: event.headers,
      queryStringParameters: event.queryStringParameters
    }
  };
  return lambdaContext;
}

export default {
  initializeApp,
  getAppState,
  checkAppHealth,
  shutdownApp,
  warmUp,
  setupLambdaContext
};
