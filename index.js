import { config } from './config/config.js';
import app from './config/express.js';
import { connectToDatabase, closeDatabaseConnection } from './config/database.js';
import debug from 'debug';

const debugLog = debug('chronas-api:index');

// Database connection URI
// TODO: Implement AWS SDK v3 Secrets Manager integration in task 6.1
const mongoUri = process.env.MONGO_HOST || 'mongodb://localhost:27017/chronas-api';

console.log("Initializing database connection...");

// Initialize database connection with DocumentDB optimization
connectToDatabase(mongoUri)
  .then(() => {
    console.log('Database connection initialized successfully');
  })
  .catch(err => {
    console.error('ERROR: Failed to initialize database connection -', err.message);
    process.exit(1);
  });

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  try {
    await closeDatabaseConnection();
    console.log('Database connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error.message);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  try {
    await closeDatabaseConnection();
    console.log('Database connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error.message);
    process.exit(1);
  }
});

// ES6 modules don't have module.parent, use import.meta.main instead
// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // listen on port config.port
  app.listen(config.port, () => {
    debugLog(`server started on port ${config.port} (${config.env})`)
  })
}

export default app;