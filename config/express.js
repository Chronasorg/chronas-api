import express from 'express'
import logger from 'morgan'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import compress from 'compression'
import methodOverride from 'method-override'
import cors from 'cors'
import httpStatus from 'http-status'
import expressWinston from 'express-winston'
import expressValidation from 'express-validation'
import helmet from 'helmet'
import passport from 'passport'
import { Strategy } from 'passport-twitter'

import winstonInstance from './winston'
import routes from '../server/routes/index.route'
import { config } from './config'
import APIError from '../server/helpers/APIError'
import versionRoutes from '../server/routes/version.router'

const app = express()

const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const swaggerDocument = YAML.load('./swagger.yaml')

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

const appInsights = require('applicationinsights')
appInsights.setup()
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(true)
    .start()

if (config.env === 'development') {
  app.use(logger('dev'))
}

// set high enough limit
app.use(bodyParser({ limit: '50mb' }))

// parse body params and attache them to req.body
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(cookieParser())
app.use(compress())
app.use(methodOverride())

// secure apps by setting various HTTP headers
app.use(helmet())

// enable CORS - Cross Origin Resource Sharing
app.use(cors())


/** Auth plans init **/

// Configure the Twitter strategy for use by Passport.
//
// OAuth 1.0-based strategies require a `verify` function which receives the
// credentials (`token` and `tokenSecret`) for accessing the Twitter API on the
// user's behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.
passport.use(new Strategy({
  consumerKey: process.env.TWITTER_CONSUMER_KEY,
  consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
  callbackURL: process.env.TWITTER_CALLBACK_URL
},
  (token, tokenSecret, profile, cb) =>
    // In this example, the user's Twitter profile is supplied as the user
    // record.  In a production-quality application, the Twitter profile should
    // be associated with a user record in the application's database, which
    // allows for account linking and authentication with other identity
    // providers.
     cb(null, profile)))
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

app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true, cookie: { secure: true }  /*key: 'sid', cookie: { secure: true }*/ }))

app.use(passport.initialize())
app.use(passport.session())

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

//for the default route return the version
app.use('/', versionRoutes)

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
  const err = new APIError('API not found. Check the url, example: /v1/health', httpStatus.NOT_FOUND)
  return next(err)
})

// log error in winston transports except when executing test suite
if (config.env !== 'test') {
  app.use(expressWinston.errorLogger({
    winstonInstance
  }))
}


function removeStackTraces(envelope, context) {
  var data = envelope.data.baseData;
  if (data.url && data.url.includes("health"))
  {
      return false;
  }

  return true;
}


appInsights.defaultClient.addTelemetryProcessor(removeStackTraces);


// error handler, send stacktrace only during development
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  appInsights.defaultClient.trackException({exception: err})
  res.status(err.status).json({
    message: err.isPublic ? err.message : httpStatus[err.status],
    stack: config.env === 'development' || config.env === 'test' ? err.stack : {}
  })
})

export default app
