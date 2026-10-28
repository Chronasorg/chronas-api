/**
 * Startup for web-server.js.
 *
 * config/config.js reads JWT_SECRET from process.env when it is first
 * imported, and every route captures config.jwtSecret at module load. So the
 * secret has to be in process.env before the Express app is imported. The
 * stored value wins over an environment variable, so environment variables
 * never need to carry it (docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md D8).
 *
 * Where the secret comes from, first match wins:
 * - JWT_SECRET_PARAMETER: an SSM Parameter Store SecureString that holds only
 *   the secret. Nothing else is tried when it is set, so a failed read fails
 *   startup (and with it a deploy's checks) instead of using another source.
 * - SECRET_CONFIG_NAME: the JWT_SECRET field of a Secrets Manager JSON secret.
 * - neither: JWT_SECRET from the environment.
 * Each AWS client is imported only when its source is used.
 */

// Keys copied from the Secrets Manager document into process.env.
const SECRET_KEYS = ['JWT_SECRET'];

export const isWebFunction = () => Boolean(process.env.AWS_LAMBDA_HTTP_ENDPOINT);

// Worst case about 6 s per read (2 attempts × 1 s connect + 2 s response),
// far below the 25 s request timeout. Without throwOnRequestTimeout the SDK's
// requestTimeout only logs a warning and the call waits indefinitely, so a
// stalled endpoint would hold every request of the environment.
const clientConfig = () => ({
  region: process.env.AWS_REGION || process.env.region || 'eu-west-1',
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 1000, requestTimeout: 2000, throwOnRequestTimeout: true }
});

let parameterClient = null;
let secretsClient = null;

async function readParameter(name, send) {
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const sendCommand = send || ((command) => {
    parameterClient ||= new SSMClient(clientConfig());
    return parameterClient.send(command);
  });
  const { Parameter } = await sendCommand(new GetParameterCommand({ Name: name, WithDecryption: true }));
  if (typeof Parameter?.Value !== 'string' || Parameter.Value === '') {
    throw Object.assign(new Error('the parameter has no value'), { name: 'EmptyParameterValue' });
  }
  return Parameter.Value;
}

async function readSecretDocument(secretId, send) {
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const sendCommand = send || ((command) => {
    secretsClient ||= new SecretsManagerClient(clientConfig());
    return secretsClient.send(command);
  });
  const { SecretString } = await sendCommand(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(SecretString);
}

// Local runs and tests may use an environment secret instead; the Web
// Function never does.
function useEnvironmentInstead(source, error) {
  if (!isWebFunction() && process.env.JWT_SECRET) {
    console.warn(`${source} read failed (${error.name}); using JWT_SECRET from the environment`);
    return 'environment';
  }
  throw error;
}

/**
 * Copy the JWT secret from JWT_SECRET_PARAMETER or SECRET_CONFIG_NAME into
 * process.env.
 * @returns {Promise<'parameter-store'|'secrets-manager'|'environment'>} where JWT_SECRET came from
 */
export async function loadSecrets({
  parameterName = process.env.JWT_SECRET_PARAMETER,
  secretId = process.env.SECRET_CONFIG_NAME,
  send
} = {}) {
  if (parameterName) {
    try {
      process.env.JWT_SECRET = await readParameter(parameterName, send);
      return 'parameter-store';
    } catch (error) {
      return useEnvironmentInstead('Parameter Store', error);
    }
  }
  if (!secretId) return 'environment';
  try {
    const values = await readSecretDocument(secretId, send);
    for (const key of SECRET_KEYS) {
      if (values[key]) process.env[key] = values[key];
    }
    return 'secrets-manager';
  } catch (error) {
    return useEnvironmentInstead('Secrets Manager', error);
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
