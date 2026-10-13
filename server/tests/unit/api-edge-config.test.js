import { describe, it } from 'mocha';
import { expect } from 'chai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import {
  renderDistributionConfig, validateDistributionConfig, checkPolicy, POLICY_SPECS,
  ALL_VIEWER_EXCEPT_HOST_ID, PUBLIC_PATHS, TEMPORARY_PATHS, WEB_FUNCTION_ORIGIN_ID
} from '../../../infra/api-edge/edge-config.mjs';

/**
 * The CloudFront configuration that infra/api-edge applies to api.chronas.org,
 * rendered from a snapshot of the live distribution (2026-10-13). See
 * docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md §6.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE = JSON.parse(readFileSync(path.join(__dirname, '../../../infra/api-edge/fixtures/live-distribution-config-2026-10-13.json'), 'utf8'));
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

  describe('# cache policy specs', () => {
    it('the specs match themselves and catch a wrong TTL or key', () => {
      expect(checkPolicy(POLICY_SPECS.dynamic, 'dynamic')).to.deep.equal([]);
      expect(checkPolicy(POLICY_SPECS.public, 'public')).to.deep.equal([]);
      expect(checkPolicy({ ...POLICY_SPECS.public, DefaultTTL: 3600 }, 'public')).to.include('DefaultTTL is 3600, expected 0');
      expect(checkPolicy(POLICY_SPECS.dynamic, 'public')).to.not.be.empty;
    });

    it('both policies key on Authorization (OAC needs it forwarded)', () => {
      for (const spec of Object.values(POLICY_SPECS)) {
        expect(spec.ParametersInCacheKeyAndForwardedToOrigin.HeadersConfig.Headers.Items).to.include('Authorization');
      }
    });
  });
});
