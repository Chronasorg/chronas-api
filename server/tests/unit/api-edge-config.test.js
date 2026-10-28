import { describe, it } from 'mocha';
import { expect } from 'chai';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'fs';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

import {
  renderDistributionConfig, validateDistributionConfig, checkPolicy, isMainModule, POLICY_SPECS, PREVIOUS_POLICY_SPECS,
  ALL_VIEWER_EXCEPT_HOST_ID, PUBLIC_PATHS, TEMPORARY_PATHS, WEB_FUNCTION_ORIGIN_ID
} from '../../../infra/api-edge/edge-config.mjs';

/**
 * The CloudFront configuration that infra/api-edge applies to api.chronas.org,
 * rendered from a snapshot of the live distribution (2026-10-13). See
 * docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md §6.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(readFileSync(path.join(__dirname, '../../../infra/api-edge/fixtures', name), 'utf8'));
const LIVE = fixture('live-distribution-config-2026-10-13.json');
// The live distribution after the cutover: everything on the Web Function,
// public behaviors on ChronasApiPublicV3.
const LIVE_2026_10_28 = fixture('live-distribution-config-2026-10-28.json');
const LIVE_IDS = { dynamic: '113a9e01-bbbd-46f8-bbd5-760b70b2ab47', publicV3: '0862a230-d0d7-40d0-a421-fcfcf7381ea2' };
const policyIds = { dynamic: 'dyn-0000', public: 'pub-0000' };

describe('## api-edge CloudFront config', () => {
  describe('# render (P4 behaviors on the live distribution)', () => {
    const config = renderDistributionConfig(LIVE, { policyIds });

    it('is valid', () => {
      expect(validateDistributionConfig(config, { policyIds })).to.deep.equal([]);
    });

    it('the live config is not (no behaviors, wrong policies, 5xx cached)', () => {
      expect(validateDistributionConfig(LIVE, { policyIds })).to.not.be.empty;
    });

    it('puts the public paths in order, on the public policy, all on API Gateway', () => {
      expect(config.CacheBehaviors.Items.map(b => b.PathPattern)).to.deep.equal(PUBLIC_PATHS);
      config.CacheBehaviors.Items.forEach((b) => {
        expect(b.CachePolicyId).to.equal(policyIds.public);
        expect(b.OriginRequestPolicyId).to.equal(ALL_VIEWER_EXCEPT_HOST_ID);
        expect(b.TargetOriginId).to.equal('ApiGatewayOrigin');
      });
    });

    it('the default behavior uses the dynamic policy and forwards everything but Host', () => {
      expect(config.DefaultCacheBehavior.CachePolicyId).to.equal(policyIds.dynamic);
      expect(config.DefaultCacheBehavior.OriginRequestPolicyId).to.equal(ALL_VIEWER_EXCEPT_HOST_ID);
    });

    it('does not cache 500, 502, 503 or 504 (D7)', () => {
      expect(config.CustomErrorResponses).to.deep.equal({
        Quantity: 4,
        Items: [500, 502, 503, 504].map(code => ({ ErrorCode: code, ResponsePagePath: '', ResponseCode: '', ErrorCachingMinTTL: 0 }))
      });
    });

    it('keeps aliases, certificate, TLS, price class, HTTP versions and IPv6', () => {
      for (const key of ['Aliases', 'ViewerCertificate', 'PriceClass', 'HttpVersion', 'IsIPV6Enabled', 'Origins', 'CallerReference', 'Comment', 'Logging', 'WebACLId']) {
        expect(config[key], key).to.deep.equal(LIVE[key]);
      }
    });

    it('does not modify its input', () => {
      expect(LIVE.CacheBehaviors.Quantity).to.equal(0);
    });
  });

  describe('# render (P8 origin migration)', () => {
    const webFunction = { domainName: 'abc.b7t.lambda-web.eu-west-1.on.aws', originAccessControlId: 'OAC123' };

    it('adds the Web Function origin with OAC and assigns behaviors one at a time', () => {
      const config = renderDistributionConfig(LIVE, { policyIds, webFunction, temporary: true, assign: { health: WEB_FUNCTION_ORIGIN_ID, version: WEB_FUNCTION_ORIGIN_ID } });
      expect(validateDistributionConfig(config, { policyIds })).to.deep.equal([]);
      expect(config.Origins.Quantity).to.equal(2);
      expect(config.Origins.Items[1]).to.include({ Id: WEB_FUNCTION_ORIGIN_ID, OriginAccessControlId: 'OAC123' });
      const targets = Object.fromEntries(config.CacheBehaviors.Items.map(b => [b.PathPattern, b.TargetOriginId]));
      expect(targets).to.deep.equal({
        '/v1/health': WEB_FUNCTION_ORIGIN_ID,
        '/v1/version': WEB_FUNCTION_ORIGIN_ID,
        '/v1/areas/*': 'ApiGatewayOrigin',
        '/v1/metadata*': 'ApiGatewayOrigin',
        '/v1/markers*': 'ApiGatewayOrigin'
      });
      expect(config.DefaultCacheBehavior.TargetOriginId).to.equal('ApiGatewayOrigin');
      expect(TEMPORARY_PATHS.every(p => config.CacheBehaviors.Items.find(b => b.PathPattern === p).CachePolicyId === policyIds.dynamic)).to.equal(true);
    });

    it('drops the API Gateway origin once nothing targets it', () => {
      const allWeb = { default: WEB_FUNCTION_ORIGIN_ID, areas: WEB_FUNCTION_ORIGIN_ID, metadata: WEB_FUNCTION_ORIGIN_ID, markers: WEB_FUNCTION_ORIGIN_ID };
      const config = renderDistributionConfig(LIVE, { policyIds, webFunction, assign: allWeb, dropApiGateway: true });
      expect(validateDistributionConfig(config, { policyIds })).to.deep.equal([]);
      expect(config.Origins.Items.map(o => o.Id)).to.deep.equal([WEB_FUNCTION_ORIGIN_ID]);
      expect(() => renderDistributionConfig(LIVE, { policyIds, webFunction, assign: { ...allWeb, markers: 'ApiGatewayOrigin' }, dropApiGateway: true }))
        .to.throw('a behavior still targets ApiGatewayOrigin');
    });

    it('rejects a behavior that points at a missing origin', () => {
      const config = renderDistributionConfig(LIVE, { policyIds, assign: { markers: WEB_FUNCTION_ORIGIN_ID } });
      expect(validateDistributionConfig(config, { policyIds })).to.include(`behavior /v1/markers*: unknown origin ${WEB_FUNCTION_ORIGIN_ID}`);
    });
  });

  describe('# render (P3 throwaway test distribution)', () => {
    const config = renderDistributionConfig(LIVE, { policyIds, testDistribution: true, callerReference: 'p3-test' });

    it('has no alias and the default certificate, and is otherwise the target config', () => {
      expect(validateDistributionConfig(config, { policyIds, testDistribution: true })).to.deep.equal([]);
      expect(config.Aliases).to.deep.equal({ Quantity: 0 });
      expect(config.ViewerCertificate.CloudFrontDefaultCertificate).to.equal(true);
      expect(config.CallerReference).to.equal('p3-test');
    });

    it('would be rejected as the live distribution config', () => {
      expect(validateDistributionConfig(config, { policyIds })).to.include('alias api.chronas.org missing');
    });
  });

  describe('# render (ChronasApiPublicV4 on the live distribution of 2026-10-28)', () => {
    const v4Ids = { dynamic: LIVE_IDS.dynamic, public: 'v4-0000' };
    const assign = { default: WEB_FUNCTION_ORIGIN_ID, areas: WEB_FUNCTION_ORIGIN_ID, metadata: WEB_FUNCTION_ORIGIN_ID, markers: WEB_FUNCTION_ORIGIN_ID };

    it('the live config is valid with the previous public policy, which the drift check accepts', () => {
      expect(validateDistributionConfig(LIVE_2026_10_28, { policyIds: { dynamic: LIVE_IDS.dynamic, public: LIVE_IDS.publicV3 } })).to.deep.equal([]);
      expect(validateDistributionConfig(LIVE_2026_10_28, { policyIds: v4Ids })).to.deep.equal(
        PUBLIC_PATHS.map(p => `behavior ${p}: cache policy ${LIVE_IDS.publicV3}, expected v4-0000`)
      );
    });

    it('moving to V4 changes only the cache policy of the three public behaviors', () => {
      const config = renderDistributionConfig(LIVE_2026_10_28, { policyIds: v4Ids, assign, dropApiGateway: true });
      expect(validateDistributionConfig(config, { policyIds: v4Ids })).to.deep.equal([]);
      const expected = JSON.parse(JSON.stringify(LIVE_2026_10_28));
      expected.CacheBehaviors.Items.forEach((b) => { b.CachePolicyId = 'v4-0000'; });
      expect(config).to.deep.equal(expected);
    });

    it('without --assign, behaviors would point at the retired API Gateway origin and the render is invalid', () => {
      const config = renderDistributionConfig(LIVE_2026_10_28, { policyIds: v4Ids });
      expect(validateDistributionConfig(config, { policyIds: v4Ids })).to.include('default behavior: unknown origin ApiGatewayOrigin');
    });
  });

  describe('# cache policy specs', () => {
    it('the specs match themselves and catch a wrong TTL or key', () => {
      for (const name of Object.keys(POLICY_SPECS)) expect(checkPolicy(POLICY_SPECS[name], name), name).to.deep.equal([]);
      expect(checkPolicy({ ...POLICY_SPECS.public, DefaultTTL: 3600 }, 'public')).to.include('DefaultTTL is 3600, expected 0');
      expect(checkPolicy(POLICY_SPECS.dynamic, 'public')).to.not.be.empty;
      expect(checkPolicy(POLICY_SPECS.publicV3, 'public')).to.deep.equal(['Name is ChronasApiPublicV3, expected ChronasApiPublicV4', 'MaxTTL is 86400, expected 604800']);
    });

    it('ChronasApiPublicV4 is ChronasApiPublicV3 with a MaxTTL of 7 days, under a new name', () => {
      const v4 = POLICY_SPECS.public;
      const v3 = POLICY_SPECS.publicV3;
      expect([v4.Name, v4.MaxTTL]).to.deep.equal(['ChronasApiPublicV4', 604800]);
      expect([v3.Name, v3.MaxTTL]).to.deep.equal(['ChronasApiPublicV3', 86400]);
      for (const key of ['MinTTL', 'DefaultTTL', 'ParametersInCacheKeyAndForwardedToOrigin']) {
        expect(v4[key], key).to.deep.equal(v3[key]);
      }
      expect(Object.keys(v4).sort()).to.deep.equal(Object.keys(v3).sort());
      expect(PREVIOUS_POLICY_SPECS).to.deep.equal({ public: 'publicV3' });
    });

    it('both policies key on Authorization (OAC needs it forwarded)', () => {
      for (const spec of Object.values(POLICY_SPECS)) {
        expect(spec.ParametersInCacheKeyAndForwardedToOrigin.HeadersConfig.Headers.Items).to.include('Authorization');
      }
    });
  });

  // lib.sh runs `node "$EDGE_DIR/edge-config.mjs"` with the directory as
  // given. Through a symlink (macOS /tmp is /private/tmp) the old check
  // compared the real module URL with the symlinked argv[1]: the command
  // printed nothing, and policies.sh reported '==>  is missing'.
  describe('# command line', () => {
    const EDGE_DIR = path.join(__dirname, '../../../infra/api-edge');
    const run = (script, ...args) => execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' });

    it('runs from its real path and through a symlinked directory', () => {
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'edge-config-'));
      try {
        symlinkSync(EDGE_DIR, path.join(tmp, 'api-edge'), 'dir');
        for (const script of [path.join(EDGE_DIR, 'edge-config.mjs'), path.join(tmp, 'api-edge', 'edge-config.mjs')]) {
          expect(JSON.parse(run(script, 'policy-spec', 'public')), script).to.deep.equal(POLICY_SPECS.public);
          expect(run(script, 'previous-policy-name', 'public'), script).to.equal('ChronasApiPublicV3\n');
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('isMainModule compares through realpath, and is false when imported or without a script', () => {
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'edge-config-'));
      try {
        symlinkSync(EDGE_DIR, path.join(tmp, 'api-edge'), 'dir');
        const moduleUrl = pathToFileURL(path.join(EDGE_DIR, 'edge-config.mjs')).href;
        expect(isMainModule(moduleUrl, path.join(EDGE_DIR, 'edge-config.mjs'))).to.equal(true);
        expect(isMainModule(moduleUrl, path.join(tmp, 'api-edge', 'edge-config.mjs'))).to.equal(true);
        expect(isMainModule(moduleUrl, path.join(EDGE_DIR, 'lib.sh'))).to.equal(false);
        expect(isMainModule(moduleUrl, path.join(tmp, 'missing.mjs'))).to.equal(false);
        expect(isMainModule(moduleUrl, undefined)).to.equal(false);
        // As imported by this test: argv[1] is mocha.
        expect(isMainModule()).to.equal(false);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
