import mongoose from 'mongoose';
import { config } from './config/config';
import app from './config/express';
import AWS from 'aws-sdk';
import bluebird from 'bluebird';

const debug = require('debug')('chronas-api:index')

const secretName = "/chronas/docdb/newpassword";
const region = "eu-west-1";

const client = new AWS.SecretsManager({ region });

// In this sample we only handle the specific exceptions for the ‘GetSecretValue’ API.

client.getSecretValue({
  SecretId: secretName
}, function (err, data) {
  if (err) {

    console.log("error in getSecretValue ");
    console.log(err);

    throw new Error('SecretString not found');
  }

  if (typeof data.SecretString != "undefined") {

    const { host, password, username, port } = JSON.parse(data.SecretString);

    const DOCDB_ENDPOINT = host || 'DOCDBURL';
    const DOCDB_PASSWORD = encodeURIComponent(password) || 'DOCPASSWORD';
    const DOCDB_USERNAME = username || 'myuser';
    const DOCDB_PORT = port || 'myuser';

    console.log("DB_Input: " + DOCDB_ENDPOINT);
    const uri = `mongodb://${DOCDB_USERNAME}:${DOCDB_PASSWORD}@${DOCDB_ENDPOINT}:${DOCDB_PORT}/chronas-api?replicaSet=rs0`;
    console.log("DB_Output: " + uri);

    // plugin bluebird promise in mongoose
    mongoose.Promise = bluebird;

    console.log("start connecting to mongoDB");

    mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
      .then(() => console.log('Connected to MongoDB  by mongoose.connect'), )
      .catch(err => console.log('ERORR MongoDB - ' + err.message));
    
    
    mongoose.connection.on('error', () => console.log('ERORR MongoDB'));

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

export default app
