import Joi from 'joi'
export const cache = require('memory-cache')
// import logger from './winston'

// require and configure dotenv, will load vars in .env in PROCESS.ENV

//parse json from the lambda environment variables
//check if process.env.chronasConfig is not null
const mergedSecrets = {};

console.log("config there" + process.env.chronasConfig);

if (process.env.chronasConfig != null)
{
  const lambdaEnv = JSON.parse(process.env.chronasConfig)
  console.log("config from lambda");
  Object.assign(mergedSecrets, process.env);
  Object.keys(lambdaEnv).forEach(key => mergedSecrets[key] = lambdaEnv[key]);

}else
{
  require('dotenv').config();
    console.log("env config");
  Object.assign(mergedSecrets, process.env);
}


console.log(mergedSecrets);

//define the default env vars

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
  SECRET_DB_NAME: Joi.string()
    .default('/chronas/docdb/newpassword'),    
  region: Joi.string()
    .default('eu-west-1'),       
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
  },
  docDbsecretName : envVars.SECRET_DB_NAME,
  awsRegion: envVars.region,
  appInsightsConnectionString: envVars.APPINSIGHTS_CONNECTION_STRING
}
