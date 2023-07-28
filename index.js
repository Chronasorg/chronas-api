import mongoose from 'mongoose';
import { config } from './config/config';
import app from './config/express';
import AWS from 'aws-sdk';
import bluebird from 'bluebird';
import { createPool } from 'generic-pool';

const debug = require('debug')('chronas-api:index')

const secretName = "/chronas/docdb/newpassword";
const region = "eu-west-1";

const client = new AWS.SecretsManager({ region });

client.getSecretValue({ SecretId: secretName }, (err, data) => {
  if (err) {
    console.log("error in getSecretValue ");
    console.log(err);
    return reject('SecretString not found');
  }

  if (typeof data.SecretString != "undefined") {
    const { host, password, username, port } = JSON.parse(data.SecretString);
    const DOCDB_ENDPOINT = host || 'DOCDBURL';
    const DOCDB_PASSWORD = encodeURIComponent(password) || 'DOCPASSWORD';
    const DOCDB_USERNAME = username || 'myuser';
    const DOCDB_PORT = port || 'myuser';

    const uri = `mongodb://${DOCDB_USERNAME}:${DOCDB_PASSWORD}@${DOCDB_ENDPOINT}:${DOCDB_PORT}/chronas-api?replicaSet=rs0`;

    // plugin bluebird promise in mongoose
    mongoose.Promise = bluebird;

    console.log("start connecting to mongoDB");

    // MongoDB connection options with connection pooling
    const mongooseOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      poolSize: 10, // Set the maximum number of connections in the pool
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
    
  } else {
    console.log("secret is: undefined");
    reject('SecretString is undefined');
  }
});

// module.parent check is required to support mocha watch
// src: https://github.com/mochajs/mocha/issues/1912

if (!module.parent) {
  // listen on port config.port
  app.listen(config.port, () => {
    debug(`server started on port ${config.port} (${config.env})`)
  })
}

export default app;
