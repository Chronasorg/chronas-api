import { describe, it, before, beforeEach, after } from 'mocha';
import { expect } from 'chai';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * infra/api-edge/jwt-secret-ssm.sh, run for real against a stand-in AWS CLI
 * (helpers/aws-cli-stub.js) first on PATH. The real CLI is out of reach too:
 * the profile does not exist and there are no config or credential files.
 * Snapshots go to a temporary EDGE_BACKUP_DIR, and every run checks that the
 * checkout's infra/backups/ did not change.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(ROOT, 'infra/api-edge/jwt-secret-ssm.sh');
const STUB = path.join(ROOT, 'server/tests/helpers/aws-cli-stub.js');
const CHECKOUT_BACKUPS = path.join(ROOT, 'infra/backups');
const PROFILE = 'jwt-secret-ssm-test-stub';
const PHRASE = 'copy jwt secret to ssm';

// Everything a generated password or a shell could trip over.
const SECRET = 'Ab1!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ xé€';
const OTHER = 'some-other-value';
const LEFTOVER = 'unused-leftover-key';
// Around what PutParameter rejects: a Standard tier value above 4 KB, or one
// with '{{' and '}}'.
const AT_LIMIT = `${'k'.repeat(4094)}é`; // 4096 bytes
const TOO_LONG = 'l'.repeat(4097);
const TOO_LONG_UTF8 = 'é'.repeat(2049); // 2049 characters, 4098 bytes
const BRACED = 'jwt-{{ssm:another-parameter}}-secret';
const BRACED_REVERSED = 'jwt-}}-and-{{-secret';
const VALUES = [SECRET, OTHER, LEFTOVER, AT_LIMIT, TOO_LONG, TOO_LONG_UTF8, BRACED, BRACED_REVERSED];

const has = tool => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0;
const hasTools = ['bash', 'jq', 'git'].every(has) && (has('sha256sum') || has('shasum'));

const listing = dir => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : []);

describe('## infra/api-edge/jwt-secret-ssm.sh', function () {
  this.timeout(20000);
  let dir;
  let state;
  let tmp;
  let backups;
  let checkoutBackups;

  before(function () {
    if (!hasTools) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwt-secret-ssm-test-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'aws'), `#!/bin/sh\nexec "${process.execPath}" "${STUB}" "$@"\n`, { mode: 0o755 });
    state = path.join(dir, 'state');
    tmp = path.join(dir, 'tmp');
    backups = path.join(dir, 'backups');
    checkoutBackups = listing(CHECKOUT_BACKUPS);
  });

  after(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  function reset({ secretString = JSON.stringify({ JWT_SECRET: SECRET, MAILGUN_KEY: LEFTOVER }), parameter } = {}) {
    for (const d of [state, tmp, backups]) {
      fs.rmSync(d, { recursive: true, force: true });
      fs.mkdirSync(d);
    }
    fs.writeFileSync(path.join(state, 'secret-string.txt'), secretString);
    if (parameter) fs.writeFileSync(path.join(state, 'parameter.json'), JSON.stringify(parameter));
  }

  const environment = extra => ({
    PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
    HOME: process.env.HOME,
    TMPDIR: tmp,
    EDGE_BACKUP_DIR: backups,
    AWS_EDGE_PROFILE: PROFILE,
    AWS_CONFIG_FILE: path.join(dir, 'no-config'),
    AWS_SHARED_CREDENTIALS_FILE: path.join(dir, 'no-credentials'),
    STUB_PROFILE: PROFILE,
    STUB_STATE: state,
    ...extra
  });

  function run(args, extra = {}) {
    fs.rmSync(path.join(state, 'calls.log'), { force: true });
    const result = spawnSync(SCRIPT, args, { env: environment(extra), encoding: 'utf8' });
    const calls = fs.existsSync(path.join(state, 'calls.log')) ? fs.readFileSync(path.join(state, 'calls.log'), 'utf8') : '';
    for (const [where, text] of [['stdout', result.stdout], ['stderr', result.stderr], ['a command line', calls]]) {
      for (const value of VALUES) {
        for (const form of [value, JSON.stringify(value).slice(1, -1)]) {
          expect(text.includes(form), `a value reached ${where}`).to.equal(false);
        }
      }
    }
    expect(fs.readdirSync(tmp), 'files left in TMPDIR').to.deep.equal([]);
    expect(listing(CHECKOUT_BACKUPS), 'the checkout\'s infra/backups changed').to.deep.equal(checkoutBackups);
    return { code: result.status, out: result.stdout, err: result.stderr, calls };
  }

  const stored = () => JSON.parse(fs.readFileSync(path.join(state, 'parameter.json'), 'utf8'));
  const exists = () => fs.existsSync(path.join(state, 'parameter.json'));
  const secureString = (value, extra = {}) => ({ Type: 'SecureString', KeyId: 'alias/aws/ssm', Tier: 'Standard', Version: 1, Value: value, ...extra });
  const secretWith = value => JSON.stringify({ JWT_SECRET: value, MAILGUN_KEY: LEFTOVER });

  describe('# copy', () => {
    beforeEach(() => reset());

    it('dry run: shows the plan and writes nothing', () => {
      const r = run(['copy']);
      expect(r.code, r.err).to.equal(0);
      expect(r.err).to.contain('Plan: create /chronas/jwt-secret (SecureString, alias/aws/ssm, Standard tier');
      expect(r.err).to.contain(`--apply --confirm "${PHRASE}"`);
      expect(exists()).to.equal(false);
      expect(r.calls).to.not.contain('"put-parameter"');
      expect(fs.readdirSync(backups)).to.deep.equal([]);
    });

    it('needs the exact phrase', () => {
      const r = run(['copy', '--apply', '--confirm', 'yes']);
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('confirmation phrase mismatch');
      expect(exists()).to.equal(false);
      expect(fs.readdirSync(backups)).to.deep.equal([]);
    });

    it('creates a standard SecureString under aws/ssm with the exact value, from a 0600 file', () => {
      const r = run(['copy', '--apply', '--confirm', PHRASE]);
      expect(r.code, r.err).to.equal(0);
      expect(r.out).to.equal('match\n');
      expect(stored()).to.deep.equal(secureString(SECRET));
      const input = JSON.parse(fs.readFileSync(path.join(state, 'put-input.json'), 'utf8'));
      expect(input.mode).to.equal('600');
      // No Overwrite: an existing parameter makes PutParameter fail.
      expect(input.keys).to.deep.equal(['Description', 'KeyId', 'Name', 'Tags', 'Tier', 'Type', 'Value']);
      expect(input.Tags).to.deep.equal([{ Key: 'app', Value: 'chronas' }]);
      expect(r.err).to.contain('Snapshot (metadata only)');
    });

    it('writes its metadata-only snapshot below EDGE_BACKUP_DIR, not into the checkout', () => {
      const r = run(['copy', '--apply', '--confirm', PHRASE]);
      expect(r.code, r.err).to.equal(0);
      const snapshots = fs.readdirSync(backups);
      expect(snapshots).to.have.length(1);
      expect(snapshots[0]).to.match(/^\d{8}T\d{6}Z-jwt-secret-ssm$/);
      expect(r.err).to.contain(`Snapshot (metadata only): ${path.join(fs.realpathSync(backups), snapshots[0], 'parameter-metadata.json')}`);
      expect(fs.readdirSync(path.join(backups, snapshots[0]))).to.deep.equal(['parameter-metadata.json']);
      const { Parameters } = JSON.parse(fs.readFileSync(path.join(backups, snapshots[0], 'parameter-metadata.json'), 'utf8'));
      expect(Parameters).to.have.length(1);
      expect(Parameters[0]).to.include({ Name: '/chronas/jwt-secret', Type: 'SecureString' }).and.not.have.property('Value');
    });

    it('copies a value of exactly 4096 bytes', () => {
      reset({ secretString: secretWith(AT_LIMIT) });
      const r = run(['copy', '--apply', '--confirm', PHRASE]);
      expect(r.code, r.err).to.equal(0);
      expect(r.out).to.equal('match\n');
      expect(stored().Value).to.equal(AT_LIMIT);
    });

    it('refuses a value above 4096 bytes before PutParameter, dry run included', () => {
      for (const value of [TOO_LONG, TOO_LONG_UTF8]) {
        for (const args of [['copy'], ['copy', '--apply', '--confirm', PHRASE]]) {
          reset({ secretString: secretWith(value) });
          const r = run(args);
          expect(r.code).to.equal(1);
          expect(r.out).to.equal('');
          expect(r.err).to.contain('the JWT_SECRET value is longer than 4096 bytes, the Standard tier limit, so it can\'t be copied as is (value not shown)');
          expect(r.err).to.not.contain('Plan: create');
          expect(r.calls).to.not.contain('"put-parameter"');
          expect(exists()).to.equal(false);
          expect(fs.readdirSync(backups)).to.deep.equal([]);
        }
      }
    });

    it('refuses a value with \'{{\' and \'}}\' before PutParameter, dry run included', () => {
      for (const value of [BRACED, BRACED_REVERSED]) {
        for (const args of [['copy'], ['copy', '--apply', '--confirm', PHRASE]]) {
          reset({ secretString: secretWith(value) });
          const r = run(args);
          expect(r.code).to.equal(1);
          expect(r.out).to.equal('');
          expect(r.err).to.contain('the JWT_SECRET value contains \'{{\' and \'}}\', which Parameter Store rejects in a value, so it can\'t be copied as is (value not shown)');
          expect(r.err).to.contain('Keep reading Secrets Manager; a new secret would log every user out.');
          expect(r.calls).to.not.contain('"put-parameter"');
          expect(exists()).to.equal(false);
          expect(fs.readdirSync(backups)).to.deep.equal([]);
        }
      }
    });

    it('shows only the error code when PutParameter fails, and removes the empty snapshot directory', () => {
      // The stand-in quotes the value in its message; run() checks it stays hidden.
      const r = run(['copy', '--apply', '--confirm', PHRASE], { STUB_PUT_ERROR: 'ValidationException' });
      expect(r.code).to.equal(1);
      expect(r.out).to.equal('');
      expect(r.err).to.contain('PutParameter failed (ValidationException; message not shown, it could quote the value)');
      expect(r.err).to.not.contain('was not accepted');
      expect(fs.readdirSync(backups)).to.deep.equal([]);
    });

    it('stops before PutParameter when EDGE_BACKUP_DIR is in a git work tree and not gitignored', () => {
      const repo = path.join(dir, 'other-repo');
      fs.rmSync(repo, { recursive: true, force: true });
      fs.mkdirSync(path.join(repo, 'notes'), { recursive: true });
      expect(spawnSync('git', ['init', '-q', repo]).status).to.equal(0);
      const r = run(['copy', '--apply', '--confirm', PHRASE], { EDGE_BACKUP_DIR: path.join(repo, 'notes') });
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('is in a git work tree and not gitignored');
      expect(r.calls).to.not.contain('"put-parameter"');
      expect(exists()).to.equal(false);
      expect(fs.readdirSync(path.join(repo, 'notes'))).to.deep.equal([]);
    });

    it('does nothing when the parameter already holds the value', () => {
      reset({ parameter: secureString(SECRET) });
      const r = run(['copy', '--apply', '--confirm', PHRASE]);
      expect(r.code, r.err).to.equal(0);
      expect(r.err).to.contain('already holds the same value; nothing to copy');
      expect(r.out).to.equal('match\n');
      expect(r.calls).to.not.contain('"put-parameter"');
    });

    it('refuses to overwrite another value', () => {
      reset({ parameter: secureString(OTHER, { Version: 3 }) });
      const r = run(['copy', '--apply', '--confirm', PHRASE]);
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('already exists with a different value; refusing to overwrite it');
      expect(stored().Value).to.equal(OTHER);
      expect(r.calls).to.not.contain('"put-parameter"');
    });

    it('fails without showing a secret that has no JWT_SECRET or is not JSON', () => {
      for (const secretString of [JSON.stringify({ MAILGUN_KEY: LEFTOVER }), `not json ${SECRET}`]) {
        reset({ secretString });
        const r = run(['copy']);
        expect(r.code).to.equal(1);
        expect(r.err).to.contain('has no JWT_SECRET string (value not shown)');
      }
    });

    it('removes its temporary files when interrupted', async () => {
      // Bash runs the trap once the running command returns, here after the hang.
      const child = spawn(SCRIPT, ['copy'], { env: environment({ STUB_HANG: 'describe-parameters', STUB_HANG_MS: '1500' }), stdio: 'ignore' });
      const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve(code ?? signal)));
      // The value is on disk while describe-parameters runs.
      const valueFile = () => fs.readdirSync(tmp).some(d => fs.existsSync(path.join(tmp, d, 'secret.value')));
      for (let waited = 0; !valueFile(); waited += 50) {
        if (waited > 10000) throw new Error('the script never wrote the value');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      child.kill('SIGTERM');
      expect(await exited).to.equal(143);
      expect(fs.readdirSync(tmp)).to.deep.equal([]);
    });
  });

  describe('# verify', () => {
    it('prints match for the same value', () => {
      reset({ parameter: secureString(SECRET) });
      const r = run(['verify']);
      expect(r.code, r.err).to.equal(0);
      expect(r.out).to.equal('match\n');
      expect(r.err).to.contain('SecureString, key alias/aws/ssm, Standard tier, version 1');
    });

    it('prints mismatch and exits 1 for another value, even one that differs by a newline', () => {
      for (const value of [OTHER, `${SECRET}\n`]) {
        reset({ parameter: secureString(value) });
        const r = run(['verify']);
        expect(r.code).to.equal(1);
        expect(r.out).to.equal('mismatch\n');
      }
    });

    it('prints only match or mismatch for values that copy refuses', () => {
      const cases = [[TOO_LONG, TOO_LONG, 'match\n', 0], [BRACED, OTHER, 'mismatch\n', 1]];
      for (const [secret, parameter, out, code] of cases) {
        reset({ secretString: secretWith(secret), parameter: secureString(parameter, { Tier: 'Advanced' }) });
        const r = run(['verify']);
        expect(r.out).to.equal(out);
        expect(r.code).to.equal(code);
        expect(r.err).to.not.contain('can\'t be copied');
      }
    });

    it('rejects a missing parameter, a String parameter and another KMS key', () => {
      const cases = [
        [undefined, 'does not exist; run: ./jwt-secret-ssm.sh copy'],
        [{ ...secureString(SECRET), Type: 'String', KeyId: null }, 'is String, expected SecureString'],
        [secureString(SECRET, { KeyId: 'alias/not-aws/ssm' }), 'encrypted with alias/not-aws/ssm, expected alias/aws/ssm']
      ];
      for (const [parameter, message] of cases) {
        reset({ parameter });
        const r = run(['verify']);
        expect(r.code).to.equal(1);
        expect(r.err).to.contain(message);
      }
    });

    it('accepts the aws/ssm alias ARN', () => {
      reset({ parameter: secureString(SECRET, { KeyId: 'arn:aws:kms:eu-west-1:937826731833:alias/aws/ssm' }) });
      expect(run(['verify']).out).to.equal('match\n');
    });
  });

  describe('# guards', () => {
    beforeEach(() => reset());

    it('refuses another account', () => {
      const r = run(['copy'], { STUB_ACCOUNT: '111122223333' });
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('expected 937826731833');
      expect(r.calls).to.not.contain('get-secret-value');
    });

    it('refuses to run while AWS CLI history is enabled', () => {
      const r = run(['copy'], { STUB_CLI_HISTORY: 'enabled' });
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('cli_history is enabled');
      expect(r.calls).to.not.contain('get-secret-value');
    });

    it('prints its usage without an action', () => {
      const r = run([]);
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('usage: jwt-secret-ssm.sh');
    });
  });
});
