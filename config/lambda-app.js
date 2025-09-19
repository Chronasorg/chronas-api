/**
 * Lambda-Optimized Application Initialization
 * 
 * This module provides optimized application initialization for AWS Lambda
 * with cold start optimization and connection caching.
 */

import debug from 'debug';
import { loadConfig, isLambdaEnvironment } from './lambda-config.js';
import { initializeDatabaseConnection } from './database.js';

const debugLog = debug('chronas-api:lambda-app');

// Application state cache
let appState = {
  initialized: false,
  initTime: null,
  config: null,
  dbConnected: false,
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
    
    // Pre-load heavy modules that don't depend on configuration
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
 * Initialize database connection with retry logic and Secrets Manager support
 */
async function initializeDatabase(config) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      debugLog(`Database connection attempt ${attempt}/${maxRetries}`);
      
      await initializeDatabaseConnection(config);
      appState.dbConnected = true;
      debugLog('Database connection established');
      return true;
      
    } catch (error) {
      debugLog(`Database connection attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        // On final attempt, decide whether to fail or continue
        if (isLambdaEnvironment()) {
          console.error('Database connection failed after all retries, continuing without DB');
          appState.dbConnected = false;
          return false;
        } else {
          throw error;
        }
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

/**
 * Create Express application with Lambda optimizations
 */
async function createExpressApp(config) {
  debugLog('Creating Express application...');
  
  // Import express configuration
  const { default: expressApp } = await import('./express.js');
  
  // Lambda-specific middleware optimizations
  if (config.isLambda) {
    // Disable keep-alive for Lambda
    expressApp.use((req, res, next) => {
      res.set('Connection', 'close');
      next();
    });
    
    // Add Lambda context to requests
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
  // Return cached app if already initialized and not forcing reload
  if (appState.initialized && !forceReload) {
    debugLog('Using cached application state');
    return {
      app: appState.expressApp,
      config: appState.config,
      dbConnected: appState.dbConnected,
      initTime: appState.initTime
    };
  }
  
  const startTime = Date.now();
  
  try {
    debugLog('Initializing application...');
    
    // Reset state
    appState.initialized = false;
    appState.initError = null;
    
    // Step 1: Pre-initialize dependencies (parallel with config loading)
    const [preInitResult, config] = await Promise.all([
      preInitializeDependencies(),
      loadConfig(forceReload)
    ]);
    
    appState.config = config;
    
    // Step 2: Initialize database connection (can be done in parallel with Express app creation)
    const [dbResult, expressApp] = await Promise.all([
      initializeDatabase(config),
      createExpressApp(config)
    ]);
    
    appState.expressApp = expressApp;
    appState.dbConnected = dbResult;
    
    // Mark as initialized
    appState.initialized = true;
    appState.initTime = Date.now() - startTime;
    
    debugLog(`Application initialized successfully in ${appState.initTime}ms`);
    
    return {
      app: appState.expressApp,
      config: appState.config,
      dbConnected: appState.dbConnected,
      initTime: appState.initTime
    };
    
  } catch (error) {
    appState.initError = error;
    appState.initTime = Date.now() - startTime;
    
    debugLog(`Application initialization failed after ${appState.initTime}ms:`, error.message);
    
    // In Lambda, try to provide a minimal working app
    if (isLambdaEnvironment()) {
      console.error('Application initialization failed, attempting minimal setup');
      
      try {
        const minimalConfig = await loadConfig();
        const { default: expressApp } = await import('./express.js');
        
        return {
          app: expressApp,
          config: minimalConfig,
          dbConnected: false,
          initTime: appState.initTime,
          error: error.message
        };
      } catch (minimalError) {
        console.error('Minimal setup also failed:', minimalError.message);
        throw error;
      }
    }
    
    throw error;
  }
}

/**
 * Get current application state
 */
export function getAppState() {
  return {
    ...appState,
    uptime: appState.initTime ? Date.now() - appState.initTime : 0
  };
}

/**
 * Health check for application state
 */
export function checkAppHealth() {
  return {
    initialized: appState.initialized,
    dbConnected: appState.dbConnected,
    hasError: !!appState.initError,
    initTime: appState.initTime,
    uptime: appState.initTime ? Date.now() - appState.initTime : 0
  };
}

/**
 * Graceful shutdown
 */
export async function shutdownApp() {
  debugLog('Shutting down application...');
  
  try {
    // Close database connection
    if (appState.dbConnected) {
      const { closeDatabaseConnection } = await import('./database.js');
      await closeDatabaseConnection();
      appState.dbConnected = false;
    }
    
    // Reset application state
    appState.initialized = false;
    appState.expressApp = null;
    
    debugLog('Application shutdown completed');
    
  } catch (error) {
    debugLog('Error during application shutdown:', error.message);
    throw error;
  }
}

/**
 * Warm up function for Lambda provisioned concurrency
 */
export async function warmUp() {
  debugLog('Warming up Lambda function...');
  
  try {
    // Pre-initialize the application
    await initializeApp();
    
    // Perform a simple health check
    const health = checkAppHealth();
    
    debugLog('Lambda warm-up completed:', health);
    return health;
    
  } catch (error) {
    debugLog('Lambda warm-up failed:', error.message);
    throw error;
  }
}

/**
 * Lambda-specific request context setup
 */
export function setupLambdaContext(event, context) {
  // Add Lambda-specific properties to the context
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
  
  debugLog('Lambda context setup:', {
    requestId: lambdaContext.requestId,
    functionName: lambdaContext.functionName,
    remainingTime: lambdaContext.remainingTimeInMillis
  });
  
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