/**
 * AWS Lambda Handler for Chronas API
 *
 * This handler provides optimized Lambda integration with connection caching,
 * cold start optimization, and proper error handling.
 */

import serverlessExpress from '@vendia/serverless-express';
import debug from 'debug';

import { initializeApp, setupLambdaContext, checkAppHealth } from './config/lambda-app.js';
import { trackColdStart, trackWarmStart, trackLambdaContext, getMetrics } from './config/performance.js';

const debugLog = debug('chronas-api:lambda-handler');

// Force cold start for debugging - v1.0.1

// Cached serverless express instance for connection reuse
let serverlessExpressInstance = null;
let appInitialized = false;

/**
 * Initialize serverless express instance with caching
 */
async function getServerlessExpressInstance() {
  if (serverlessExpressInstance && appInitialized) {
    debugLog('Using cached serverless express instance');
    return serverlessExpressInstance;
  }

  try {
    debugLog('Initializing serverless express instance...');

    // Initialize the application
    const appResult = await initializeApp();

    if (!appResult || !appResult.app) {
      throw new Error('Failed to initialize Express application');
    }

    // Create serverless express instance
    serverlessExpressInstance = serverlessExpress({
      app: appResult.app,
      logSettings: {
        level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
      },
      // Lambda-specific optimizations
      binaryMimeTypes: [
        'application/octet-stream',
        'font/eot',
        'font/opentype',
        'font/otf',
        'image/jpeg',
        'image/png',
        'image/svg+xml'
      ]
    });

    appInitialized = true;

    // Track cold start performance
    trackColdStart(appResult.initTime);

    debugLog(`Serverless express instance initialized (init time: ${appResult.initTime}ms)`);
    debugLog(`Database connected: ${appResult.dbConnected}`);

    return serverlessExpressInstance;
  } catch (error) {
    debugLog('Failed to initialize serverless express instance:', error.message);

    // Reset cached instance on error
    serverlessExpressInstance = null;
    appInitialized = false;

    throw error;
  }
}

/**
 * Handle warm-up requests
 */
function handleWarmUp(event) {
  debugLog('Handling warm-up request');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Lambda-Warm-Up': 'true'
    },
    body: JSON.stringify({
      message: 'Lambda function warmed up',
      timestamp: new Date().toISOString(),
      health: checkAppHealth(),
      performance: getMetrics()
    })
  };
}

/**
 * Handle health check requests
 */
function handleHealthCheck(event) {
  debugLog('Handling health check request');

  const health = checkAppHealth();
  const statusCode = health.initialized && !health.hasError ? 200 : 503;

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      status: health.initialized ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      ...health
    })
  };
}

/**
 * Main Lambda handler
 */
export const handler = async (event, context) => {
  // Prevent Lambda from waiting for empty event loop
  context.callbackWaitsForEmptyEventLoop = false;

  const startTime = Date.now();

  try {
    // Track Lambda context performance
    const lambdaPerf = trackLambdaContext(context);

    debugLog('Lambda handler invoked', {
      httpMethod: event.httpMethod,
      path: event.path,
      requestId: context.awsRequestId,
      remainingTime: lambdaPerf.remainingTime
    });

    // Track warm start if app is already initialized
    if (appInitialized) {
      trackWarmStart();
    }

    // Handle special requests
    if (event.source === 'serverless-plugin-warmup' || event.warmup) {
      return handleWarmUp(event);
    }

    if (event.path === '/health/lambda' || event.path === '/lambda-health') {
      return handleHealthCheck(event);
    }

    // Set up Lambda context for the request
    const lambdaContext = setupLambdaContext(event, context);

    // Get or initialize serverless express instance
    const serverlessApp = await getServerlessExpressInstance();

    // Add Lambda context to the event for middleware access
    event.lambdaContext = lambdaContext;

    // Process the request
    const response = await serverlessApp(event, context);

    const processingTime = Date.now() - startTime;
    debugLog(`Request processed in ${processingTime}ms`);

    // Add Lambda-specific headers
    if (response.headers) {
      response.headers['X-Lambda-Request-Id'] = context.awsRequestId;
      response.headers['X-Lambda-Processing-Time'] = processingTime.toString();
    }

    return response;
  } catch (error) {
    const processingTime = Date.now() - startTime;

    debugLog('Lambda handler error:', {
      error: error.message,
      stack: error.stack,
      processingTime,
      requestId: context.awsRequestId
    });

    // Log error for monitoring
    console.error('Lambda handler error:', {
      message: error.message,
      requestId: context.awsRequestId,
      path: event.path,
      method: event.httpMethod,
      processingTime
    });

    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Lambda-Request-Id': context.awsRequestId,
        'X-Lambda-Processing-Time': processingTime.toString(),
        'X-Lambda-Error': 'true'
      },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
        requestId: context.awsRequestId,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Health check handler for ALB health checks
 */
export const healthHandler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const health = checkAppHealth();

    return {
      statusCode: health.initialized && !health.hasError ? 200 : 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: health.initialized ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId,
        ...health
      })
    };
  } catch (error) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId: context.awsRequestId
      })
    };
  }
};

export default { handler, healthHandler };
