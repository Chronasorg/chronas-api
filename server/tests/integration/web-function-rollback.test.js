import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * infra/api-edge/web-function.sh rollback, run for real against a stand-in
 * AWS CLI (helpers/aws-cli-stub.js) first on PATH. It must refuse a target
 * revision that would answer 503 (it reads the JWT secret from a Secrets
 * Manager secret that is scheduled for deletion or gone) or that would leave
 * edits stale behind the 7-day edge policy (no CLOUDFRONT_DISTRIBUTION_ID), in
 * the dry run and with --apply, and it must fail closed when a lookup fails.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(ROOT, 'infra/api-edge/web-function.sh');
const STUB = path.join(ROOT, 'server/tests/helpers/aws-cli-stub.js');
const PROFILE = 'web-function-rollback-test-stub';
const PHRASE = 'roll back chronas-api';
const V3 = '0862a230-d0d7-40d0-a421-fcfcf7381ea2';
const V4 = '0cdec506-5eec-4b4e-9b91-9b1a1746456b';
const DYNAMIC = '113a9e01-bbbd-46f8-bbd5-760b70b2ab47';

const has = tool => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0;
const hasTools = ['bash', 'jq', 'git', 'node'].every(has);

// Environment variables of the revisions involved (values that matter only).
const SSM_REVISION = { JWT_SECRET_PARAMETER: '/chronas/jwt-secret', CLOUDFRONT_DISTRIBUTION_ID: 'E1KTIK2H0W8J2Q' };
const SECRETS_MANAGER_REVISION = { SECRET_CONFIG_NAME: '/chronas/secrets', CLOUDFRONT_DISTRIBUTION_ID: 'E1KTIK2H0W8J2Q' };
const NO_INVALIDATION_REVISION = { JWT_SECRET_PARAMETER: '/chronas/jwt-secret' };

describe('## infra/api-edge/web-function.sh rollback', function () {
  this.timeout(30000);
  let dir;
  let state;

  before(function () {
    if (!hasTools) this.skip();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-function-rollback-test-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'aws'), `#!/bin/sh\nexec "${process.execPath}" "${STUB}" "$@"\n`, { mode: 0o755 });
    state = path.join(dir, 'state');
  });

  after(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name, value) => fs.writeFileSync(path.join(state, name), typeof value === 'string' ? value : JSON.stringify(value));

  // Production as of 2026-10-28: rev-new (SSM, invalidation) is routed,
  // /chronas/secrets is scheduled for deletion, V4 is on the public behaviors.
  function reset({ revisions = {}, secret = { Name: '/chronas/secrets', DeletedDate: '2026-10-28T18:29:26.363000+01:00' }, publicPolicy = V4, policies = { ChronasApiPublicV4: V4 } } = {}) {
    fs.rmSync(state, { recursive: true, force: true });
    fs.mkdirSync(path.join(state, 'revisions'), { recursive: true });
    write('endpoint.txt', 'rev-new');
    for (const [id, env] of Object.entries({ 'rev-new': SSM_REVISION, ...revisions })) {
      write(path.join('revisions', `${id}.json`), { revisionId: id, serviceConfig: { environmentVariables: { NODE_ENV: 'production', ...env } } });
    }
    if (secret) write('secret.json', secret);
    write('policies.json', policies);
    write('distribution-config.json', {
      ETag: 'E1',
      DistributionConfig: {
        DefaultCacheBehavior: { CachePolicyId: DYNAMIC },
        CacheBehaviors: { Quantity: 3, Items: ['/v1/areas/*', '/v1/metadata*', '/v1/markers*'].map(PathPattern => ({ PathPattern, CachePolicyId: publicPolicy })) }
      }
    });
  }

  function run(args, extra = {}) {
    fs.rmSync(path.join(state, 'calls.log'), { force: true });
    const result = spawnSync(SCRIPT, ['rollback', ...args], {
      encoding: 'utf8',
      env: {
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        HOME: process.env.HOME,
        AWS_EDGE_PROFILE: PROFILE,
        AWS_CONFIG_FILE: path.join(dir, 'no-config'),
        AWS_SHARED_CREDENTIALS_FILE: path.join(dir, 'no-credentials'),
        STUB_PROFILE: PROFILE,
        STUB_STATE: state,
        ...extra
      }
    });
    const calls = fs.existsSync(path.join(state, 'calls.log')) ? fs.readFileSync(path.join(state, 'calls.log'), 'utf8') : '';
    return { code: result.status, err: result.stderr, calls, routed: fs.readFileSync(path.join(state, 'endpoint.txt'), 'utf8') };
  }

  const apply = ['--apply', '--confirm', PHRASE];

  describe('# refuses targets that would answer 503', () => {
    it('Secrets Manager revision while the secret is scheduled for deletion: dry run and --apply', () => {
      reset({ revisions: { 'rev-old': SECRETS_MANAGER_REVISION } });
      for (const extra of [[], apply]) {
        const r = run(['rev-old', ...extra]);
        expect(r.code).to.equal(1);
        expect(r.err).to.contain('reads the JWT secret from Secrets Manager /chronas/secrets, which is scheduled for deletion');
        expect(r.err).to.contain('aws secretsmanager restore-secret');
        expect(r.err).to.not.contain('Dry run.');
        expect(r.calls).to.not.contain('"update-web-function-endpoint"');
        expect(r.routed).to.equal('rev-new');
      }
    });

    it('Secrets Manager revision after the secret is gone', () => {
      reset({ revisions: { 'rev-old': SECRETS_MANAGER_REVISION }, secret: null });
      const r = run(['rev-old', ...apply]);
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('which can\'t be described (gone?)');
      expect(r.routed).to.equal('rev-new');
    });

    it('fails closed when the secret lookup fails', () => {
      reset({ revisions: { 'rev-old': SECRETS_MANAGER_REVISION }, secret: { Name: '/chronas/secrets' } });
      const r = run(['rev-old', ...apply], { STUB_FAIL: 'describe-secret' });
      expect(r.code).to.equal(1);
      expect(r.routed).to.equal('rev-new');
    });

    it('an unknown revision', () => {
      reset();
      const r = run(['rev-missing', ...apply]);
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('can\'t read revision rev-missing');
      expect(r.routed).to.equal('rev-new');
    });
  });

  describe('# refuses targets that would leave edits stale at the edge', () => {
    it('no CLOUDFRONT_DISTRIBUTION_ID while ChronasApiPublicV4 is assigned: dry run and --apply', () => {
      reset({ revisions: { 'rev-old': NO_INVALIDATION_REVISION } });
      for (const extra of [[], apply]) {
        const r = run(['rev-old', ...extra]);
        expect(r.code).to.equal(1);
        expect(r.err).to.contain('doesn\'t invalidate CloudFront after writes (no CLOUDFRONT_DISTRIBUTION_ID), but ChronasApiPublicV4');
        expect(r.err).to.contain('Restore ChronasApiPublicV3 first');
        expect(r.routed).to.equal('rev-new');
      }
    });

    it('fails closed when the distribution config can\'t be read', () => {
      reset({ revisions: { 'rev-old': NO_INVALIDATION_REVISION } });
      const r = run(['rev-old', ...apply], { STUB_FAIL: 'get-distribution-config' });
      expect(r.code).to.equal(1);
      expect(r.err).to.contain('can\'t read the config of distribution E1KTIK2H0W8J2Q');
      expect(r.routed).to.equal('rev-new');
    });

    it('fails closed when the cache policies can\'t be listed', () => {
      reset({ revisions: { 'rev-old': NO_INVALIDATION_REVISION } });
      const r = run(['rev-old', ...apply], { STUB_FAIL: 'list-cache-policies' });
      expect(r.code).to.equal(1);
      expect(r.routed).to.equal('rev-new');
    });
  });

  describe('# allows safe targets', () => {
    it('a revision that reads SSM and invalidates: dry run, then --apply moves the endpoint', () => {
      reset({ revisions: { 'rev-prev': SSM_REVISION } });
      const dry = run(['rev-prev']);
      expect(dry.code, dry.err).to.equal(0);
      expect(dry.err).to.contain('Rollback target rev-prev passed the checks');
      expect(dry.err).to.contain(`--apply --confirm "${PHRASE}"`);
      expect(dry.routed).to.equal('rev-new');
      // Reads SSM: Secrets Manager isn't consulted at all.
      expect(dry.calls).to.not.contain('"describe-secret"');

      const r = run(['rev-prev', ...apply]);
      expect(r.code, r.err).to.equal(0);
      expect(r.err).to.contain('Endpoint prod now serves rev-prev');
      expect(r.routed).to.equal('rev-prev');
    });

    it('a Secrets Manager revision once the secret is restored', () => {
      reset({ revisions: { 'rev-old': SECRETS_MANAGER_REVISION }, secret: { Name: '/chronas/secrets' } });
      const r = run(['rev-old', ...apply]);
      expect(r.code, r.err).to.equal(0);
      expect(r.routed).to.equal('rev-old');
    });

    it('JWT_SECRET_PARAMETER wins over SECRET_CONFIG_NAME, as in bootstrap.js', () => {
      reset({ revisions: { 'rev-both': { ...SSM_REVISION, SECRET_CONFIG_NAME: '/chronas/secrets' } } });
      const r = run(['rev-both', ...apply]);
      expect(r.code, r.err).to.equal(0);
      expect(r.calls).to.not.contain('"describe-secret"');
      expect(r.routed).to.equal('rev-both');
    });

    it('no CLOUDFRONT_DISTRIBUTION_ID while ChronasApiPublicV3 is assigned, or V4 doesn\'t exist', () => {
      reset({ revisions: { 'rev-old': NO_INVALIDATION_REVISION }, publicPolicy: V3 });
      expect(run(['rev-old', ...apply]).routed).to.equal('rev-old');

      reset({ revisions: { 'rev-old': NO_INVALIDATION_REVISION }, publicPolicy: V3, policies: {} });
      const r = run(['rev-old', ...apply]);
      expect(r.code, r.err).to.equal(0);
      expect(r.calls).to.not.contain('"get-distribution-config"');
      expect(r.routed).to.equal('rev-old');
    });
  });
});
