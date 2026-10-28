import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { loadSecrets } from '../../../config/bootstrap.js';

/**
 * Startup of the Web Function: the JWT secret comes from Parameter Store
 * (JWT_SECRET_PARAMETER) or Secrets Manager (SECRET_CONFIG_NAME) and wins over
 * the environment.
 */

const ENV_KEYS = ['JWT_SECRET', 'JWT_SECRET_PARAMETER', 'SECRET_CONFIG_NAME', 'AWS_LAMBDA_HTTP_ENDPOINT', 'AWS_LAMBDA_FUNCTION_NAME'];

const failing = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };

// Records console.warn lines while fn runs.
async function warningsOf(fn) {
  const lines = [];
  const original = console.warn;
  console.warn = (...args) => { lines.push(args.join(' ')); };
  try {
    return { result: await fn(), lines };
  } finally {
    console.warn = original;
  }
}

describe('## Bootstrap', () => {
  let saved;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    // The defaults read these; a developer's shell must not change the tests.
    delete process.env.JWT_SECRET_PARAMETER;
    delete process.env.SECRET_CONFIG_NAME;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe('# loadSecrets (Secrets Manager)', () => {
    const secretDocument = JSON.stringify({ JWT_SECRET: 'from-secrets-manager', MAILGUN_KEY: 'unused' });

    it('the Secrets Manager value wins over the environment', async () => {
      process.env.JWT_SECRET = 'from-environment';
      const source = await loadSecrets({ secretId: '/chronas/secrets', send: async () => ({ SecretString: secretDocument }) });
      expect(source).to.equal('secrets-manager');
      expect(process.env.JWT_SECRET).to.equal('from-secrets-manager');
    });

    it('reads the secret named by SECRET_CONFIG_NAME', async () => {
      process.env.SECRET_CONFIG_NAME = '/chronas/secrets';
      const commands = [];
      await loadSecrets({ send: async (command) => { commands.push(command); return { SecretString: secretDocument }; } });
      expect(commands).to.have.length(1);
      expect(commands[0]).to.be.instanceOf(GetSecretValueCommand);
      expect(commands[0].input).to.deep.equal({ SecretId: '/chronas/secrets' });
    });

    it('copies only the JWT secret into the environment', async () => {
      delete process.env.MAILGUN_KEY;
      await loadSecrets({ secretId: '/chronas/secrets', send: async () => ({ SecretString: secretDocument }) });
      expect(process.env.MAILGUN_KEY).to.equal(undefined);
    });

    it('without SECRET_CONFIG_NAME it keeps the environment', async () => {
      process.env.JWT_SECRET = 'from-environment';
      expect(await loadSecrets({ secretId: '' })).to.equal('environment');
      expect(process.env.JWT_SECRET).to.equal('from-environment');
    });

    it('outside the Web Function it falls back to an environment secret when the read fails', async () => {
      delete process.env.AWS_LAMBDA_HTTP_ENDPOINT;
      process.env.JWT_SECRET = 'from-environment';
      const { result, lines } = await warningsOf(() => loadSecrets({ secretId: '/chronas/secrets', send: failing }));
      expect(result).to.equal('environment');
      expect(lines).to.deep.equal(['Secrets Manager read failed (TimeoutError); using JWT_SECRET from the environment']);
    });

    it('fails when the read fails and there is no environment secret', async () => {
      delete process.env.JWT_SECRET;
      const error = await loadSecrets({ secretId: '/chronas/secrets', send: failing }).catch(e => e);
      expect(error).to.be.an('error');
    });

    it('the Web Function never falls back to the environment', async () => {
      process.env.AWS_LAMBDA_HTTP_ENDPOINT = '127.0.0.1:9001';
      process.env.JWT_SECRET = 'from-environment';
      const error = await loadSecrets({ secretId: '/chronas/secrets', send: failing }).catch(e => e);
      expect(error).to.be.an('error');
    });
  });

  describe('# loadSecrets (Parameter Store)', () => {
    const parameterName = '/chronas/jwt-secret';
    const answer = value => async () => ({ Parameter: { Name: parameterName, Type: 'SecureString', Value: value, Version: 1 } });
    const recording = (commands, respond) => async (command) => {
      commands.push(command);
      return respond(command);
    };

    it('reads the parameter with decryption, and its value wins over the environment', async () => {
      process.env.JWT_SECRET = 'from-environment';
      const commands = [];
      const source = await loadSecrets({ parameterName, send: recording(commands, answer('from-parameter-store')) });
      expect(source).to.equal('parameter-store');
      expect(process.env.JWT_SECRET).to.equal('from-parameter-store');
      expect(commands).to.have.length(1);
      expect(commands[0]).to.be.instanceOf(GetParameterCommand);
      expect(commands[0].input).to.deep.equal({ Name: parameterName, WithDecryption: true });
    });

    it('keeps the value byte for byte (no trimming or decoding)', async () => {
      const value = ' a$b"c\\d\'e`f{g}\n ';
      await loadSecrets({ parameterName, send: answer(value) });
      expect(process.env.JWT_SECRET).to.equal(value);
    });

    it('uses JWT_SECRET_PARAMETER and never reads SECRET_CONFIG_NAME when both are set', async () => {
      process.env.JWT_SECRET_PARAMETER = parameterName;
      process.env.SECRET_CONFIG_NAME = '/chronas/secrets';
      const commands = [];
      expect(await loadSecrets({ send: recording(commands, answer('from-parameter-store')) })).to.equal('parameter-store');
      expect(commands.map(c => c.constructor.name)).to.deep.equal(['GetParameterCommand']);
      expect(commands[0].input.Name).to.equal(parameterName);
    });

    it('a failed read fails the Web Function: no Secrets Manager, no environment fallback', async () => {
      process.env.AWS_LAMBDA_HTTP_ENDPOINT = '127.0.0.1:9001';
      process.env.JWT_SECRET = 'from-environment';
      const commands = [];
      const denied = recording(commands, () => { throw Object.assign(new Error('denied'), { name: 'AccessDeniedException' }); });
      const error = await loadSecrets({ parameterName, secretId: '/chronas/secrets', send: denied }).catch(e => e);
      expect(error).to.be.an('error').with.property('name', 'AccessDeniedException');
      expect(commands.map(c => c.constructor.name)).to.deep.equal(['GetParameterCommand']);
    });

    it('a missing or empty value fails the Web Function', async () => {
      process.env.AWS_LAMBDA_HTTP_ENDPOINT = '127.0.0.1:9001';
      process.env.JWT_SECRET = 'from-environment';
      for (const response of [{}, { Parameter: {} }, { Parameter: { Value: '' } }]) {
        const error = await loadSecrets({ parameterName, send: async () => response }).catch(e => e);
        expect(error, JSON.stringify(response)).to.be.an('error').with.property('name', 'EmptyParameterValue');
      }
      expect(process.env.JWT_SECRET).to.equal('from-environment');
    });

    it('outside the Web Function it falls back to an environment secret, with a warning that names no parameter', async () => {
      delete process.env.AWS_LAMBDA_HTTP_ENDPOINT;
      process.env.JWT_SECRET = 'from-environment';
      const { result, lines } = await warningsOf(() => loadSecrets({ parameterName, send: failing }));
      expect(result).to.equal('environment');
      expect(process.env.JWT_SECRET).to.equal('from-environment');
      expect(lines).to.deep.equal(['Parameter Store read failed (TimeoutError); using JWT_SECRET from the environment']);
    });

    it('outside the Web Function it fails when there is no environment secret', async () => {
      delete process.env.AWS_LAMBDA_HTTP_ENDPOINT;
      delete process.env.JWT_SECRET;
      const error = await loadSecrets({ parameterName, send: failing }).catch(e => e);
      expect(error).to.be.an('error').with.property('name', 'TimeoutError');
    });
  });
});
