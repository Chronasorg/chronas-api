import { isLambdaEnvironment } from './config/lambda-config.js';
import { initializeApp, shutdownApp } from './config/lambda-app.js';
import debug from 'debug';

const debugLog = debug('chronas-api:index');

// Global application state
let appInstance = null;

/**
 * Initialize application with Lambda optimization
 */
async function initApp() {
  try {
    console.log("Initializing application...");
    
    appInstance = await initializeApp();
    
    console.log(`Application initialized successfully in ${appInstance.initTime}ms`);
    console.log(`Database connected: ${appInstance.dbConnected}`);
    console.log(`Lambda environment: ${appInstance.config.isLambda}`);
    
    return appInstance;
    
  } catch (error) {
    console.error('ERROR: Failed to initialize application -', error.message);
    
    // In Lambda, don't exit the process
    if (isLambdaEnvironment()) {
      console.error('Continuing with degraded functionality...');
      return null;
    } else {
      process.exit(1);
    }
  }
}

// Initialize application
const appPromise = initApp();

// Graceful shutdown handling (not needed in Lambda)
if (!isLambdaEnvironment()) {
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    try {
      await shutdownApp();
      console.log('Application shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error.message);
      process.exit(1);
    }
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    try {
      await shutdownApp();
      console.log('Application shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error.message);
      process.exit(1);
    }
  });
}

// Start server if running directly (not in Lambda)
if (import.meta.url === `file://${process.argv[1]}` && !isLambdaEnvironment()) {
  appPromise.then((app) => {
    if (app && app.app) {
      app.app.listen(app.config.port, () => {
        debugLog(`Server started on port ${app.config.port} (${app.config.env})`);
        console.log(`🚀 Chronas API server running on port ${app.config.port}`);
      });
    }
  }).catch((error) => {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  });
}

/**
 * Export application for Lambda handler or other uses
 */
export default async function getApp() {
  const app = await appPromise;
  return app ? app.app : null;
}

/**
 * Export application instance for direct access
 */
export { appPromise, appInstance };