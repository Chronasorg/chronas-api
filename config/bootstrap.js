/**
 * Startup for web-server.js.
 *
 * config/config.js reads JWT_SECRET from process.env when it is first
 * imported, and every route captures config.jwtSecret at module load. So the
 * secret has to be in process.env before the Express app is imported. The
 * Secrets Manager value wins over an environment variable, so environment
 * variables never need to carry it (docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md
 * D8).
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Keys copied from the Secrets Manager document into process.env.
const SECRET_KEYS = ['JWT_SECRET'];

export const isWebFunction = () => Boolean(process.env.AWS_LAMBDA_HTTP_ENDPOINT);

let secretsClient = null;

function getSecretsClient() {
  // Worst case about 6 s (2 attempts × 1 s connect + 2 s response), far
  // below the 25 s request timeout. Without throwOnRequestTimeout the SDK's
  // requestTimeout only logs a warning and the call waits indefinitely, so
  // a stalled Secrets Manager would hold every request of the environment.
  secretsClient ||= new SecretsManagerClient({
    region: process.env.AWS_REGION || process.env.region || 'eu-west-1',
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 2000, throwOnRequestTimeout: true }
  });
  return secretsClient;
}

/**
 * Copy the secrets from SECRET_CONFIG_NAME into process.env.
 * @returns {Promise<'secrets-manager'|'environment'>} where JWT_SECRET came from
 */
export async function loadSecrets({
  secretId = process.env.SECRET_CONFIG_NAME,
  send = command => getSecretsClient().send(command)
} = {}) {
  if (!secretId) return 'environment';
  try {
    const { SecretString } = await send(new GetSecretValueCommand({ SecretId: secretId }));
    const values = JSON.parse(SecretString);
    for (const key of SECRET_KEYS) {
      if (values[key]) process.env[key] = values[key];
    }
    return 'secrets-manager';
  } catch (error) {
    // Local runs and tests may use an environment secret instead; the Web
    // Function never does.
    if (!isWebFunction() && process.env.JWT_SECRET) {
      console.warn(`Secrets Manager read failed (${error.name}); using JWT_SECRET from the environment`);
      return 'environment';
    }
    throw error;
  }
}

let appPromise = null;

/**
 * Load the secrets, then import the Express app. Concurrent callers share one
 * attempt; a failed attempt is forgotten so the next call retries.
 */
export function createApp() {
  appPromise ||= (async () => {
    await loadSecrets();
    const { default: app } = await import('./express.js');
    return app;
  })().catch((error) => {
    appPromise = null;
    throw error;
  });
  return appPromise;
}
