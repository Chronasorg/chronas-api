import express from 'express'
import logger from 'morgan'
// body-parser is now built into Express 4.16+
import cookieParser from 'cookie-parser'
import compress from 'compression'
import methodOverride from 'method-override'
import cors from 'cors'
import httpStatus from 'http-status'
import expressWinston from 'express-winston'
import expressValidation from 'express-validation'
import helmet from 'helmet'
import passport from 'passport'
// import { Strategy } from 'passport-twitter'
import AWSXRay from 'aws-xray-sdk'
import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'
import appInsights from 'applicationinsights'
import expressSession from 'express-session'

import winstonInstance from './winston.js';
import routes from '../server/routes/index.route.js';
import { config } from './config.js';
import APIError from '../server/helpers/APIError.js';
// import versionRoutes from '../server/routes/version.router.js'; // Disabled for Lambda
import { createPerformanceMiddleware } from './performance.js';

const app = express()

app.use(AWSXRay.express.openSegment('Chronas-Api'));

const swaggerDocument = YAML.load('./swagger.yaml');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

console.log("appInsightsString" + config.appInsightsConnectionString);

// Only initialize Application Insights if connection string is provided
if (config.appInsightsConnectionString) {
  appInsights.setup(config.appInsightsConnectionString)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true)
      .setUseDiskRetryCaching(true)
      .start()
  console.log("✅ Application Insights initialized");
} else {
  console.log("⚠️  Application Insights not configured, telemetry disabled");
}

if (config.env === 'development') {
  app.use(logger('dev'))
}

// parse body params and attach them to req.body (built into Express 4.16+)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use(cookieParser())
app.use(compress())
app.use(methodOverride())

// secure apps by setting various HTTP headers
app.use(helmet())

// enable CORS - Cross Origin Resource Sharing
app.use(cors())

// Add performance monitoring middleware
app.use(createPerformanceMiddleware())


/** Auth plans init **/

// Configure the Twitter strategy for use by Passport.
//
// OAuth 1.0-based strategies require a `verify` function which receives the
// credentials (`token` and `tokenSecret`) for accessing the Twitter API on the
// user's behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.

// Twitter authentication temporarily disabled during modernization
// console.log("consumerkey Twitter express -:" + config.twitterConsumerKey);
// 
// passport.use(new Strategy({
//   consumerKey: config.twitterConsumerKey,
//   consumerSecret: config.twitterConsumerKey,
//   callbackURL: config.twitterCallbackUrl
// },
//   (token, tokenSecret, profile, cb) =>
//     // In this example, the user's Twitter profile is supplied as the user
//     // record.  In a production-quality application, the Twitter profile should
//     // be associated with a user record in the application's database, which
//     // allows for account linking and authentication with other identity
//     // providers.
//      cb(null, profile)))
// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  In a
// production-quality application, this would typically be as simple as
// supplying the user ID when serializing, and querying the user record by ID
// from the database when deserializing.  However, due to the fact that this
// example does not have a database, the complete Twitter profile is serialized
// and deserialized.
passport.serializeUser((user, cb) => {
  cb(null, user)
})

passport.deserializeUser((obj, cb) => {
  cb(null, obj)
})

// Only configure session in non-test environments to avoid issues
if (config.env !== 'test') {
  app.use(expressSession({ 
    secret: config.jwtSecret || 'test-secret-key', 
    resave: false, 
    saveUninitialized: false, 
    cookie: { secure: false }
  }));
}

app.use(passport.initialize())
// Only use passport session in non-test environments
if (config.env !== 'test') {
  app.use(passport.session())
}

// // enable detailed API logging in dev env
if (config.env === 'development') {
  expressWinston.requestWhitelist.push('body')
  expressWinston.responseWhitelist.push('body')
  app.use(expressWinston.logger({
    winstonInstance,
    meta: true, // optional: log meta data about request (defaults to true)
    msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
    colorStatus: true // Color the status code (default green, 3XX cyan, 4XX yellow, 5XX red).
  }))
}

// route for v1 (current) requests
app.use('/v1', routes)

// for the default route return the version - Disabled for Lambda
// app.use('/', versionRoutes)

// if error is not an instanceOf APIError, convert it.
app.use((err, req, res, next) => {
  if (err instanceof expressValidation.ValidationError) {
    // validation error contains errors which is an array of error each containing message[]
    const unifiedErrorMessage = err.errors.map(error => error.messages.join('. ')).join(' and ')
    const error = new APIError(unifiedErrorMessage, err.status, true)
    return next(error)
  } else if (!(err instanceof APIError)) {
    const apiError = new APIError(err.message, err.status, err.isPublic)
    return next(apiError)
  }
  return next(err)
})

// catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new APIError(req.url +  ' - ' + 'API not found. Check the url, example: /v1/health', httpStatus.NOT_FOUND)
  return next(err)
})

// log error in winston transports except when executing test suite
if (config.env !== 'test') {
  app.use(expressWinston.errorLogger({
    winstonInstance
  }))
}


function removeStackTraces(envelope, context) {
  const data = envelope.data.baseData
  if (data.url && data.url.includes('health')) {
    return false
  }

  return true
}

// Only add telemetry processor if Application Insights is configured
if (config.appInsightsConnectionString && appInsights.defaultClient) {
  appInsights.defaultClient.addTelemetryProcessor(removeStackTraces)
}


// error handler, send stacktrace only during development
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Only track exceptions if Application Insights is configured
  if (config.appInsightsConnectionString && appInsights.defaultClient) {
    appInsights.defaultClient.trackException({ exception: err })
  }
  res.status(err.status).json({
    message: err.isPublic ? err.message : httpStatus[err.status],
    stack: config.env === 'development' || config.env === 'test' ? err.stack : {}
  })
})

app.use(AWSXRay.express.closeSegment());

export default app
