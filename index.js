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

const poolFactory = {
  create: () => {
    return new Promise((resolve, reject) => {
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

          // Create the connection using mongoose.createConnection()
          const connectionOptions = {
            useNewUrlParser: true,
            //useUnifiedTopology: true,
          };

          const connection = mongoose.createConnection(uri, connectionOptions);

          connection.on('error', () => console.log('ERORR MongoDB'));
          connection.on('disconnected', () => console.log('Disconnected from MongoDB'));
          connection.on('connected', () => console.log('Connected to MongoDB'));
          connection.on('reconnected', () => console.log('Reconnected to MongoDB'));
          connection.on('close', () => console.log('Connection to MongoDB closed'));

          connection.on('SIGINT', () => connection.close(() => {
            console.log('Connection to MongoDB closed through app termination');
            process.exit(0);
          }));

          resolve(connection);
        } else {
          console.log("secret is: undefined");
          reject('SecretString is undefined');
        }
      });
    });
  },
  destroy: (connection) => {
    return new Promise((resolve, reject) => {
      connection.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};

const pool = createPool(poolFactory, {
  min: 2, // Minimum number of connections in the pool
  max: 10, // Maximum number of connections in the pool
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
