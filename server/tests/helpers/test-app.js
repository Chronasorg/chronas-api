/**
 * Test Application Helper
 * Creates Express app with routes but without auto-connecting to database
 */

import express from 'express';
import cors from 'cors';
import httpStatus from 'http-status';
import helmet from 'helmet';
import compression from 'compression';

import { config } from '../../../config/config.js';
import APIError from '../../helpers/APIError.js';

// Import routes
import routes from '../../routes/index.route.js';

const app = express();

// Enable CORS
app.use(cors());

// Secure apps by setting various HTTP headers
app.use(helmet());

// Enable compression
app.use(compression());

// Parse body params and attach them to req.body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount all routes on /v1 path
app.use('/v1', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env
  });
});

// Default route (version endpoint)
app.get('/', (req, res) => {
  res.status(200).json({
    version: '1.3.5',
    commit: 'test-commit-hash',
    environment: config.env
  });
});

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new APIError('API not found', httpStatus.NOT_FOUND);
  return next(err);
});

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || httpStatus.INTERNAL_SERVER_ERROR).json({
    message: err.isPublic ? err.message : httpStatus[err.status],
    stack: config.env === 'development' || config.env === 'test' ? err.stack : {}
  });
});

export default app;
