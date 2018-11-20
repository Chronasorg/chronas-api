import mongoose from 'mongoose'
import util from 'util'

// config should be imported before importing any other file
import { config } from './config/config'
import app from './config/express'


const debug = require('debug')('chronas-api:index')

// make bluebird default Promise
Promise = require('bluebird') // eslint-disable-line no-global-assign

// plugin bluebird promise in mongoose
mongoose.Promise = Promise

// connect to mongo db
const mongoUri = config.mongo.host
mongoose.connect(mongoUri, {  useNewUrlParser: true , server: { socketOptions: { keepAlive: 1 }} })

mongoose.connection.on('error',function (err) {  
  throw new Error('nable to connect to database - URL - ' + mongoUri + ' - Error - ' + err);
}); 

// print mongoose logs in dev env
if (config.MONGOOSE_DEBUG) {
  mongoose.set('debug', (collectionName, method, query, doc) => {
    debug(`${collectionName}.${method}`, util.inspect(query, false, 20), doc)
  })
}

// module.parent check is required to support mocha watch
// src: https://github.com/mochajs/mocha/issues/1912
if (!module.parent) {
  // listen on port config.port
  app.listen(config.port, () => {
    debug(`server started on port ${config.port} (${config.env})`)
  })
}

export default app
