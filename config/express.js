import express from 'express';
import logger from 'morgan';
// body-parser is now built into Express 4.16+
import compress from 'compression';
import methodOverride from 'method-override';
import cors from 'cors';
import httpStatus from 'http-status';
import expressWinston from 'express-winston';
import expressValidation from 'express-validation';
import helmet from 'helmet';

import routes from '../server/routes/index.route.js';
import APIError from '../server/helpers/APIError.js';

import winstonInstance from './winston.js';
import { config } from './config.js';
import { corsOptions } from './cors.js';
import { buildErrorLoggerOptions } from './error-logger-options.js';


// import versionRoutes from '../server/routes/version.router.js'; // Disabled for Lambda
import { createPerformanceMiddleware } from './performance.js';

const app = express();

app.set('trust proxy', 2);

// Nothing is cacheable unless a handler opts in with `Cache-Control: public`
// (the public map-data reads). CloudFront and browsers must never store
// identity-dependent or dynamic responses, including errors and preflights.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

if (config.env === 'development') {
  app.use(logger('dev'));
}

// parse body params and attach them to req.body (built into Express 4.16+)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(compress());
app.use(methodOverride());

// secure apps by setting various HTTP headers
app.use(helmet());

// enable CORS - Cross Origin Resource Sharing
app.use(cors(corsOptions));

// Add performance monitoring middleware
app.use(createPerformanceMiddleware());


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

// log error in winston transports except when executing test suite.
// Emit a structured payload (stack, message, status, request path/method, AWS
// SDK metadata) instead of the bare literal "middlewareError" — see issue #158.
// Options live in a shared module so this and the test stay in sync.
if (config.env !== 'test') {
  app.use(expressWinston.errorLogger(buildErrorLoggerOptions(winstonInstance)));
}


// error handler, send stacktrace only during development
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  res.set('Cache-Control', 'no-store');
  res.status(err.status).json({
    message: err.isPublic ? err.message : httpStatus[err.status],
    stack: config.env === 'development' || config.env === 'test' ? err.stack : {}
  });
});

export default app;
