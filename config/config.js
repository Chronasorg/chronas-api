import Joi from 'joi';
import memoryCache from 'memory-cache';
import dotenv from 'dotenv';
// import logger from './winston.js'

export const cache = memoryCache;

// require and configure dotenv, will load vars in .env in PROCESS.ENV

//parse json from the lambda environment variables
//check if process.env.chronasConfig is not null
const mergedSecrets = {};

if (process.env.chronasConfig != null)
{
  const lambdaEnv = JSON.parse(process.env.chronasConfig)
  Object.assign(mergedSecrets, process.env);
  Object.keys(lambdaEnv).forEach(key => mergedSecrets[key] = lambdaEnv[key]);

}else
{
  // Load environment-specific .env file
  const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: envFile });
  Object.assign(mergedSecrets, process.env);
}

//define the default env vars

// define validation for all the env vars
const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
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

const { error, value: envVars } = envVarsSchema.validate(mergedSecrets)
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
  docDbsecretName: envVars.SECRET_DB_NAME,
  awsRegion: envVars.region,
  appInsightsConnectionString: envVars.APPINSIGHTS_CONNECTION_STRING,
  mailgunReceiver: envVars.MAILGUN_RECEIVER,
  githubClientId: envVars.GITHUB_CLIENT_ID,
  twitterConsumerSecret: envVars.TWITTER_CONSUMER_SECRET,
  googleClientSecret: envVars.GOOGLE_CLIENT_SECRET,
  mailgunKey: envVars.MAILGUN_KEY,
  appinsightsInstrumentationkey: envVars.APPINSIGHTS_INSTRUMENTATIONKEY,
  googleClientId: envVars.GOOGLE_CLIENT_ID,
  githubClientSecret: envVars.GITHUB_CLIENT_SECRET,
  mailgunDomain: envVars.MAILGUN_DOMAIN,
  paypalClientId: envVars.PAYPAL_CLIENT_ID,
  twitterConsumerKey: envVars.TWITTER_CONSUMER_KEY,
  facebookClientId: envVars.FACEBOOK_CLIENT_ID,
  cloudinaryUrl: envVars.CLOUDINARY_URL,
  facebookClientSecret: envVars.FACEBOOK_CLIENT_SECRET,
  paypalClientSecret: envVars.PAYPAL_CLIENT_SECRET,
  appinsightsConnectionString: envVars.APPINSIGHTS_CONNECTION_STRING,
  rumEndpoint: envVars.RUMENDPOINT,
  rumRoleArn: envVars.RUMROLEARN,
  rumIdentityPool: envVars.RUMIDENTITYPOOL,
  facebookCallBackUrl: envVars.FACEBOOK_CALLBACK_URL,
  githubCallbackUrl: envVars.GITHUB_CALLBACK_URL,
  googleCallbackUrl: envVars.GOOGLE_CALLBACK_URL,
  twitterCallbackUrl: envVars.TWITTER_CALLBACK_URL,
  rumApplicationId: envVars.RUMAPPLICATIONID,
  chronasHost: envVars.CHRONAS_HOST
}

console.log(config);