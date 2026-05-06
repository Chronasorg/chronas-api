import Joi from 'joi';
import memoryCache from 'memory-cache';
import dotenv from 'dotenv';

export const cache = memoryCache;

const mergedSecrets = {};

if (process.env.chronasConfig !== undefined && process.env.chronasConfig !== null) {
  const lambdaEnv = JSON.parse(process.env.chronasConfig);
  Object.assign(mergedSecrets, process.env);
  Object.keys(lambdaEnv).forEach((key) => { mergedSecrets[key] = lambdaEnv[key]; });
} else {
  const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: envFile });
  Object.assign(mergedSecrets, process.env);
}

const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  PORT: Joi.number()
    .default(4040),
  JWT_SECRET: Joi.string().required()
    .description('JWT Secret required to sign'),
  region: Joi.string()
    .default('eu-west-1'),

  // DynamoDB feature flags. Every in-scope model has been migrated to
  // DynamoDB — these remain as switches for local overrides only.
  USE_DYNAMODB_AREAS: Joi.boolean().default(true),
  USE_DYNAMODB_MARKERS: Joi.boolean().default(true),
  USE_DYNAMODB_METADATA: Joi.boolean().default(true),
  USE_DYNAMODB_USERS: Joi.boolean().default(true),
  USE_DYNAMODB_FLAGS: Joi.boolean().default(true),
  USE_DYNAMODB_REVISIONS: Joi.boolean().default(true),
  USE_DYNAMODB_BOARD: Joi.boolean().default(true),
  DYNAMODB_TABLE_PREFIX: Joi.string().default('chronas')

}).unknown()
  .required();

const { error, value: envVars } = envVarsSchema.validate(mergedSecrets);
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const initItemsAndLinksToRefresh = ['provinces', 'links', 'ruler', 'culture', 'religion', 'capital', 'province', 'religionGeneral'];

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  jwtSecret: envVars.JWT_SECRET,
  awsRegion: envVars.region,
  mailgunReceiver: envVars.MAILGUN_RECEIVER,
  githubClientId: envVars.GITHUB_CLIENT_ID,
  googleClientSecret: envVars.GOOGLE_CLIENT_SECRET,
  mailgunKey: envVars.MAILGUN_KEY,
  googleClientId: envVars.GOOGLE_CLIENT_ID,
  githubClientSecret: envVars.GITHUB_CLIENT_SECRET,
  mailgunDomain: envVars.MAILGUN_DOMAIN,
  paypalClientId: envVars.PAYPAL_CLIENT_ID,
  facebookClientId: envVars.FACEBOOK_CLIENT_ID,
  cloudinaryUrl: envVars.CLOUDINARY_URL,
  facebookClientSecret: envVars.FACEBOOK_CLIENT_SECRET,
  paypalClientSecret: envVars.PAYPAL_CLIENT_SECRET,
  rumEndpoint: envVars.RUMENDPOINT,
  rumRoleArn: envVars.RUMROLEARN,
  rumIdentityPool: envVars.RUMIDENTITYPOOL,
  facebookCallBackUrl: envVars.FACEBOOK_CALLBACK_URL,
  githubCallbackUrl: envVars.GITHUB_CALLBACK_URL,
  googleCallbackUrl: envVars.GOOGLE_CALLBACK_URL,
  rumApplicationId: envVars.RUMAPPLICATIONID,
  chronasHost: envVars.CHRONAS_HOST,
  dynamodb: {
    tablePrefix: envVars.DYNAMODB_TABLE_PREFIX,
    useAreas: envVars.USE_DYNAMODB_AREAS,
    useMarkers: envVars.USE_DYNAMODB_MARKERS,
    useMetadata: envVars.USE_DYNAMODB_METADATA,
    useUsers: envVars.USE_DYNAMODB_USERS,
    useFlags: envVars.USE_DYNAMODB_FLAGS,
    useRevisions: envVars.USE_DYNAMODB_REVISIONS,
    useBoard: envVars.USE_DYNAMODB_BOARD
  }
};

if (config.env !== 'production') {
  console.log('Config loaded (env=%s, port=%s, dynamodb=%j)', config.env, config.port, config.dynamodb);
}
