/**
 * module dependencies for express configuration
 */
import passport from 'passport'
import morgan from 'morgan'
import compress from 'compression'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import flash from 'connect-flash'
import passportConfig from './passport.js'
import devConfig from './dev.js'
import routesConfig from './routes.js'

const DBBOARDURL = process.env.MONGO_BOARD_HOST
/**
 * express configuration
 */
const expressConfig = (app, serverConfigs) => {
  // apply gzip compression (should be placed before express.static)
  app.use(compress())

  // log server requests to console
  !serverConfigs.PRODUCTION && app.use(morgan('dev'))

  // get data from html froms
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: true }))

  // read cookies (should be above session)
  app.use(cookieParser())

  // use session with mongo
  app.use(session({
    resave: false,
    saveUninitialized: true,
    secret: process.env.JWT_SECRET || 'test-secret-key',
    store: MongoStore.create({
      mongoUrl: DBBOARDURL || process.env.MONGO_HOST || 'mongodb://localhost:27017/chronas-test',
      collectionName: 'sessions',
    }),
  }))

  // use passport session
  app.use(passport.initialize())
  app.use(passport.session())

  // apply passport configs
  passportConfig(app)

  // connect flash for flash messages (should be declared after sessions)
  app.use(flash())

  // apply development environment additionals
  if (!serverConfigs.PRODUCTION) {
    devConfig(app)
  }

  // apply route configs
  routesConfig(app)
}

export default expressConfig
