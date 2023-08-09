import Joi from 'joi'
export const cache = require('memory-cache')
import AWS from 'aws-sdk';
  
const secretName = process.env.secretDbName || '/chronas/secrets';
const region = process.env.region || 'eu-west-1';

const client = new AWS.SecretsManager({ region });

const mergedSecrets = {};

// require and configure dotenv, will load vars in .env in PROCESS.ENV
//require('dotenv').config()

//add process.env to the mergedSecrets object
Object.assign(mergedSecrets, process.env);


client.getSecretValue({ SecretId: secretName }, (err, data) => {
  if (err) {
    throw new Error(`getSecret config error: ${err}`)
  }
  
  if (typeof data.SecretString != "undefined") {
    Object.assign(mergedSecrets, JSON.parse(data.SecretString));
    } else {

    throw new Error("not able to recieve config secrets")
  }
});

const secretNameDb = process.env.secretDbName || '/chronas/docdb/newpassword';
client.getSecretValue({ SecretId: secretNameDb }, (err, data) => {
  if (err) {
    throw new Error(`getSecret db param error: ${err}`)
  }

  if (typeof data.SecretString != "undefined") {
    
    Object.assign(mergedSecrets, JSON.parse(data.SecretString));
    console.log(mergedSecrets);
    
    }
   else {
    throw new Error("not able to recieve db config secrets")
  }
});

console.log(mergedSecrets);

// import logger from './winston'



// require and configure dotenv, will load vars in .env in PROCESS.ENV
//require('dotenv').config()

// define validation for all the env vars
const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string()
    .allow(['development', 'production', 'test', 'provision'])
    .default('development'),
  PORT: Joi.number()
    .default(4040),
  MONGOOSE_DEBUG: Joi.boolean()
    .when('NODE_ENV', {
      is: Joi.string().equal('development'),
      then: Joi.boolean().default(true),
      otherwise: Joi.boolean().default(false)
    }),
  JWT_SECRET: Joi.string().required()
    .description('JWT Secret required to sign'),
  MONGO_HOST: Joi.string().required()
    .description('Mongo DB host url'),
  MONGO_PORT: Joi.number()
    .default(27017)
}).unknown()
  .required()
  
  
const { error, value: envVars } = Joi.validate(mergedSecrets, envVarsSchema)


if (error) {
  throw new Error(`Config validation error: ${error.message}`)
}

export const initItemsAndLinksToRefresh = ['provinces', 'links', 'ruler', 'culture', 'religion', 'capital', 'province', 'religionGeneral']

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongooseDebug: envVars.MONGOOSE_DEBUG,
  jwtSecret: envVars.JWT_SECRET,
  mongo: {
    host: envVars.MONGO_HOST,
    port: envVars.MONGO_PORT
  }
}
