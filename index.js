import mongoose from 'mongoose';
import { config } from './config/config';
import app from './config/express';
import bluebird from 'bluebird';

const debug = require('debug')('chronas-api:index')

const uri = `mongodb://${config.docdb.username}:${config.docdb.password}@${config.docdb.endpoint}:${config.docdb.port}/chronas-api?replicaSet=rs0`;
console.log("mongoUri: " + uri);
// plugin bluebird promise in mongoose
mongoose.Promise = bluebird;

console.log("start connecting to mongoDB");

// MongoDB connection options with connection pooling
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10, // Set the maximum number of connections in the 
  minPoolSize: 10, // Set the minimum number of connections in the 
  //poolSize: 10, // Set the maximum number of connections in the pool
  keepAlive: true, // Set to true to enable keepAlive on the socket for long-running applications
  keepAliveInitialDelay: 300000, // The number of milliseconds to wait before initiating keepAlive on the socket
};

// Connect to MongoDB using the provided options
mongoose.connect(uri, mongooseOptions)
  .then(() => console.log('Connected to MongoDB by mongoose.connect'))
  .catch(err => console.log('ERROR MongoDB - ' + err.message));

mongoose.connection.on('error', () => console.log('ERROR MongoDB'));

mongoose.connection.on('disconnected', () => console.log('Disconnected from MongoDB'));

mongoose.connection.on('connected', () => console.log('Connected to MongoDB'));

mongoose.connection.on('reconnected', () => console.log('Reconnected to MongoDB'));

mongoose.connection.on('close', () => console.log('Connection to MongoDB closed'));

mongoose.connection.on('SIGINT', () => mongoose.connection.close(() => {
  console.log('Connection to MongoDB closed through app termination');
  process.exit(0);
}));

console.log("mongoose.connection.readyState: " + mongoose.connection.readyState);


// module.parent check is required to support mocha watch
// src: https://github.com/mochajs/mocha/issues/1912

if (!module.parent) {
  // listen on port config.port
  app.listen(config.port, () => {
    debug(`server started on port ${config.port} (${config.env})`)
  })
}

export default app;
