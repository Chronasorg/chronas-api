import mongoose from 'mongoose'
import util from 'util'

// config should be imported before importing any other file
import { config } from './config/config'
import app from './config/express'


const debug = require('debug')('chronas-api:index')

//Initialize AWS X-Ray SDK
var AWSXRay = require('aws-xray-sdk');
    

Promise = require('bluebird') // eslint-disable-line no-global-assign

var AWS = require('aws-sdk'),
    region = "eu-west-1",
    secretName = "/chronas/docdb/newpassword",
    secret,
    decodedBinarySecret;
// Create a Secrets Manager client
var client = new AWS.SecretsManager({
    region: region
});
// In this sample we only handle the specific exceptions for the ‘GetSecretValue’ API.
// See https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
// We rethrow the exception by default.
client.getSecretValue({
    SecretId: secretName
}, function(err, data) {
    if (err) {

          console.log("error in getSecretValue ");
          console.log(err);
          
          throw err;
    } else {

        // Decrypts secret using the associated KMS CMK.
        // Depending on whether the secret is a string or binary, one of these fields will be populated.
        if ('SecretString' in data) {
            secret = data.SecretString;
        } else {
            let buff = new Buffer(data.SecretBinary, 'base64');
            decodedBinarySecret = buff.toString('ascii');
        }
    }

    //Establish the server connection
    
    if (typeof secret != "undefined") {

        const secretJSON = JSON.parse(secret);
        
        console.log("parsed secret");
    
        const DOCDB_ENDPOINT = secretJSON.host || 'DOCDBURL';
        const DOCDB_PASSWORD = encodeURIComponent(secretJSON.password) || 'DOCPASSWORD';
        const DOCDB_USERNAME = secretJSON.username || 'myuser';
        const DOCDB_PORT = secretJSON.port || 'myuser';
    
        console.log("DB_Input: " + DOCDB_ENDPOINT);

        // replace the URI with your AWS DocumentDB connection string
        const uri = 'mongodb://' + DOCDB_USERNAME + ':' + DOCDB_PASSWORD + '@' + DOCDB_ENDPOINT + ':' + DOCDB_PORT + '/chronas-api?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false';

        // make bluebird default Promise
        //console.log("uri: " + uri);

        // plugin bluebird promise in mongoose
        mongoose.Promise = Promise              
  
        mongoose.connect(uri, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        })
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.log(err));

    }else   {
        console.log("secret is: undefined");
    } 
});

// module.parent check is required to support mocha watch
// src: https://github.com/mochajs/mocha/issues/1912
if (!module.parent) {
  // listen on port config.port
  app.listen(config.port, () => {
      
    const seg = AWSXRay.getSegment();
    app.use(AWSXRay.express.openSegment('Chronas-Api'));
    AWSXRay.captureHTTPsGlobal(require('http'));
    AWSXRay.captureHTTPsGlobal(require('https'));

    debug(`server started on port ${config.port} (${config.env})`)
  })
}


export default app
app.use(AWSXRay.express.closeSegment());