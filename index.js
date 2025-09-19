import mongoose from 'mongoose';
import { config } from './config/config.js';
import app from './config/express.js';
import bluebird from 'bluebird';
import debug from 'debug';

const debugLog = debug('chronas-api:index');

// Simplified MongoDB connection for development/testing
// TODO: Implement AWS SDK v3 Secrets Manager integration in task 6.1
const mongoUri = process.env.MONGO_HOST || 'mongodb://localhost:27017/chronas-api';

// plugin bluebird promise in mongoose
mongoose.Promise = bluebird;

console.log("start connecting to mongoDB");

// MongoDB connection options
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  minPoolSize: 5,
  keepAlive: true,
  keepAliveInitialDelay: 300000,
};

// Connect to MongoDB
mongoose.connect(mongoUri, mongooseOptions)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('ERROR MongoDB - ' + err.message));

mongoose.connection.on('error', () => console.log('ERROR MongoDB'));
mongoose.connection.on('disconnected', () => console.log('Disconnected from MongoDB'));
mongoose.connection.on('connected', () => console.log('Connected to MongoDB'));
mongoose.connection.on('reconnected', () => console.log('Reconnected to MongoDB'));
mongoose.connection.on('close', () => console.log('Connection to MongoDB closed'));

process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    console.log('Connection to MongoDB closed through app termination');
    process.exit(0);
  });
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