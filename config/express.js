import express from 'express';
import logger from 'morgan';
// body-parser is now built into Express 4.16+
import cookieParser from 'cookie-parser';
import compress from 'compression';
import methodOverride from 'method-override';
import cors from 'cors';
import httpStatus from 'http-status';
import expressWinston from 'express-winston';
import expressValidation from 'express-validation';
import helmet from 'helmet';
import passport from 'passport';
import AWSXRay from 'aws-xray-sdk';
import expressSession from 'express-session';

import routes from '../server/routes/index.route.js';
import APIError from '../server/helpers/APIError.js';

import winstonInstance from './winston.js';
import { config } from './config.js';


// import versionRoutes from '../server/routes/version.router.js'; // Disabled for Lambda
import { createPerformanceMiddleware } from './performance.js';

const app = express();

app.use(AWSXRay.express.openSegment('Chronas-Api'));

// Set up Swagger documentation with graceful fallback
async function setupSwaggerDocs() {
  try {
    const swaggerUi = (await import('swagger-ui-express')).default;
    const YAML = (await import('yamljs')).default;
    const swaggerDocument = YAML.load('./swagger.yaml');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    console.log('✅ Swagger API documentation enabled at /api-docs');
  } catch {
    console.log('⚠️  Swagger UI not available, API documentation disabled');
  }
}

// Initialize Swagger docs asynchronously
setupSwaggerDocs();

if (config.env === 'development') {
  app.use(logger('dev'));
}

// parse body params and attach them to req.body (built into Express 4.16+)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(cookieParser());
app.use(compress());
app.use(methodOverride());

// secure apps by setting various HTTP headers
app.use(helmet());

// enable CORS - Cross Origin Resource Sharing
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');

    if (allowedOrigins.includes(origin) || /^https:\/\/([a-z0-9-]+\.)?chronas\.org$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Add performance monitoring middleware
app.use(createPerformanceMiddleware());


/** Auth plans init **/

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((obj, cb) => {
  cb(null, obj);
});

// Only configure session in non-test environments to avoid issues
if (config.env !== 'test') {
  app.use(expressSession({
    secret: config.jwtSecret || 'test-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }));
}

app.use(passport.initialize());
// Only use passport session in non-test environments
if (config.env !== 'test') {
  app.use(passport.session());
}

// // enable detailed API logging in dev env
if (config.env === 'development') {
  expressWinston.requestWhitelist.push('body');
  expressWinston.responseWhitelist.push('body');
  app.use(expressWinston.logger({
    winstonInstance,
    meta: true, // optional: log meta data about request (defaults to true)
    msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
    colorStatus: true // Color the status code (default green, 3XX cyan, 4XX yellow, 5XX red).
  }));
}

// route for v1 (current) requests
app.use('/v1', routes);

// for the default route return the version - Disabled for Lambda
// app.use('/', versionRoutes)

// if error is not an instanceOf APIError, convert it.
app.use((err, req, res, next) => {
  if (err instanceof expressValidation.ValidationError) {
    // validation error contains errors which is an array of error each containing message[]
    const unifiedErrorMessage = err.errors.map(error => error.messages.join('. ')).join(' and ');
    const error = new APIError(unifiedErrorMessage, err.status, true);
    return next(error);
  } else if (!(err instanceof APIError)) {
    const apiError = new APIError(err.message, err.status, err.isPublic);
    return next(apiError);
  }
  return next(err);
});

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new APIError(`${req.url} - ` + 'API not found. Check the url, example: /v1/health', httpStatus.NOT_FOUND);
  return next(err);
});

// log error in winston transports except when executing test suite
if (config.env !== 'test') {
  app.use(expressWinston.errorLogger({
    winstonInstance
  }));
}


// error handler, send stacktrace only during development
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  res.status(err.status).json({
    message: err.isPublic ? err.message : httpStatus[err.status],
    stack: config.env === 'development' || config.env === 'test' ? err.stack : {}
  });
});

app.use(AWSXRay.express.closeSegment());

export default app;
