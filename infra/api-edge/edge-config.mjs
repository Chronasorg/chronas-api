#!/usr/bin/env node
/**
 * Target CloudFront configuration for api.chronas.org
 * (docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md §6), as pure functions so PR CI
 * can test them against a fixture of the live config.
 *
 *   node edge-config.mjs render   --live live.json --dynamic-id ID --public-id ID [--assign default=ApiGatewayOrigin,...] [--temporary] [--test-distribution]
 *   node edge-config.mjs validate --config target.json --dynamic-id ID --public-id ID [--test-distribution]
 *   node edge-config.mjs policy-spec dynamic|public
 *   node edge-config.mjs check-policy --spec dynamic|public --config policy.json
 *
 * `live.json` is the output of `aws cloudfront get-distribution-config`
 * (with or without the ETag wrapper). Output is a DistributionConfig.
 */

import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';

export const API_GATEWAY_ORIGIN_ID = 'ApiGatewayOrigin';
export const WEB_FUNCTION_ORIGIN_ID = 'WebFunctionOrigin';
// Managed-AllViewerExceptHostHeader: forwards CORS preflight headers,
// Content-Type and cookies, and sets Host to the origin's own domain.
export const ALL_VIEWER_EXCEPT_HOST_ID = 'b689b0a8-53d0-40ab-baf2-68738e2966ac';
export const ALIAS = 'api.chronas.org';

// Order matters: CloudFront uses the first matching pattern.
export const TEMPORARY_PATHS = ['/v1/health', '/v1/version'];
export const PUBLIC_PATHS = ['/v1/areas/*', '/v1/metadata*', '/v1/markers*'];
const BEHAVIOR_KEYS = { '/v1/health': 'health', '/v1/version': 'version', '/v1/areas/*': 'areas', '/v1/metadata*': 'metadata', '/v1/markers*': 'markers' };

// D7: CloudFront ignores no-store on these codes, so only a TTL of 0 keeps
// them out of the cache. 404/410/414/501 honor the origin's no-store.
export const NO_ERROR_CACHING_CODES = [500, 502, 503, 504];

const encodingsAndKey = headers => ({
  EnableAcceptEncodingGzip: true,
  EnableAcceptEncodingBrotli: true,
  HeadersConfig: { HeaderBehavior: 'whitelist', Headers: { Quantity: headers.length, Items: headers } },
  CookiesConfig: { CookieBehavior: 'none' },
  QueryStringsConfig: { QueryStringBehavior: 'all' }
});

export const POLICY_SPECS = {
  // Default behavior. The origin sends no-store, so nothing is effectively
  // cached; Authorization is in the key so it is forwarded on every method
  // (required for Lambda Web Function origins with OAC). MaxTTL 1 because
  // CachingDisabled can't carry headers, and 0/0/0 can't enable encodings.
  dynamic: {
    Name: 'ChronasApiDynamicV3',
    Comment: 'api.chronas.org default: origin sends no-store; Authorization forwarded and in key',
    MinTTL: 0,
    DefaultTTL: 0,
    MaxTTL: 1,
    ParametersInCacheKeyAndForwardedToOrigin: encodingsAndKey(['Authorization'])
  },
  // Public map data. DefaultTTL 0: only responses with an explicit public
  // Cache-Control are cached. Anonymous requests share one entry.
  public: {
    Name: 'ChronasApiPublicV3',
    Comment: 'api.chronas.org public map data: cached only when the origin says public',
    MinTTL: 0,
    DefaultTTL: 0,
    MaxTTL: 86400,
    ParametersInCacheKeyAndForwardedToOrigin: encodingsAndKey(['Authorization', 'Origin'])
  }
};

const clone = value => JSON.parse(JSON.stringify(value));
const unwrap = live => (live.DistributionConfig ? live.DistributionConfig : live);

function behaviorFrom(template, { pathPattern, cachePolicyId, targetOriginId }) {
  const behavior = {
    ...(pathPattern ? { PathPattern: pathPattern } : {}),
    TargetOriginId: targetOriginId,
    TrustedSigners: { Enabled: false, Quantity: 0 },
    TrustedKeyGroups: { Enabled: false, Quantity: 0 },
    ViewerProtocolPolicy: 'redirect-to-https',
    AllowedMethods: {
      Quantity: 7,
      Items: ['HEAD', 'DELETE', 'POST', 'GET', 'OPTIONS', 'PUT', 'PATCH'],
      CachedMethods: { Quantity: 2, Items: ['HEAD', 'GET'] }
    },
    SmoothStreaming: false,
    Compress: true,
    // Lambda@Edge origin triggers are rejected for Web Function origins.
    LambdaFunctionAssociations: { Quantity: 0 },
    FunctionAssociations: { Quantity: 0 },
    FieldLevelEncryptionId: '',
    CachePolicyId: cachePolicyId,
    OriginRequestPolicyId: ALL_VIEWER_EXCEPT_HOST_ID
  };
  if (template.GrpcConfig) behavior.GrpcConfig = { Enabled: false };
  return behavior;
}

/**
 * Origin for a Lambda Web Function endpoint behind OAC. Not used before P8;
 * re-check the CloudFront Web Function origin docs before relying on it.
 */
export function webFunctionOrigin({ domainName, originAccessControlId }) {
  return {
    Id: WEB_FUNCTION_ORIGIN_ID,
    DomainName: domainName,
    OriginPath: '',
    CustomHeaders: { Quantity: 0 },
    CustomOriginConfig: {
      HTTPPort: 80,
      HTTPSPort: 443,
      OriginProtocolPolicy: 'https-only',
      OriginSslProtocols: { Quantity: 1, Items: ['TLSv1.2'] },
      OriginReadTimeout: 30,
      OriginKeepaliveTimeout: 5
    },
    ConnectionAttempts: 3,
    ConnectionTimeout: 10,
    OriginShield: { Enabled: false },
    OriginAccessControlId: originAccessControlId
  };
}

/**
 * @param live DistributionConfig (or get-distribution-config output)
 * @param options.policyIds { dynamic, public } cache policy ids
 * @param options.assign origin id per behavior key: default, areas, metadata, markers, health, version
 * @param options.temporary add the /v1/health and /v1/version behaviors (P8a)
 * @param options.webFunction { domainName, originAccessControlId } adds WebFunctionOrigin
 * @param options.testDistribution throwaway P3 copy: no alias, default certificate
 */
export function renderDistributionConfig(live, {
  policyIds, assign = {}, temporary = false, webFunction = null, testDistribution = false, callerReference
} = {}) {
  if (!policyIds?.dynamic || !policyIds?.public) throw new Error('policyIds.dynamic and policyIds.public are required');
  const config = clone(unwrap(live));
  const template = config.DefaultCacheBehavior;
  const originFor = key => assign[key] || assign.default || API_GATEWAY_ORIGIN_ID;

  if (webFunction) {
    const others = config.Origins.Items.filter(o => o.Id !== WEB_FUNCTION_ORIGIN_ID);
    config.Origins = { Quantity: others.length + 1, Items: [...others, webFunctionOrigin(webFunction)] };
  }

  const paths = [...(temporary ? TEMPORARY_PATHS : []), ...PUBLIC_PATHS];
  const behaviors = paths.map(pathPattern => behaviorFrom(template, {
    pathPattern,
    cachePolicyId: TEMPORARY_PATHS.includes(pathPattern) ? policyIds.dynamic : policyIds.public,
    targetOriginId: originFor(BEHAVIOR_KEYS[pathPattern])
  }));
  config.CacheBehaviors = { Quantity: behaviors.length, Items: behaviors };
  config.DefaultCacheBehavior = behaviorFrom(template, { cachePolicyId: policyIds.dynamic, targetOriginId: originFor('default') });

  config.CustomErrorResponses = {
    Quantity: NO_ERROR_CACHING_CODES.length,
    // UpdateDistribution rejects items without the two (empty) page fields;
    // CreateDistribution fills them in itself.
    Items: NO_ERROR_CACHING_CODES.map(code => ({ ErrorCode: code, ResponsePagePath: '', ResponseCode: '', ErrorCachingMinTTL: 0 }))
  };

  if (testDistribution) {
    config.CallerReference = callerReference || `chronas-api-p3-test-${Date.now()}`;
    config.Comment = 'chronas-api P3 throwaway test distribution (delete after use)';
    config.Aliases = { Quantity: 0 };
    config.ViewerCertificate = { CloudFrontDefaultCertificate: true, MinimumProtocolVersion: 'TLSv1', CertificateSource: 'cloudfront' };
  }
  return config;
}

/** @returns {string[]} violated §6 invariants; empty when the config is valid */
export function validateDistributionConfig(input, { policyIds, testDistribution = false } = {}) {
  const config = unwrap(input);
  const errors = [];
  const originIds = new Set((config.Origins?.Items || []).map(o => o.Id));

  const checkBehavior = (behavior, label, cachePolicyId) => {
    if (behavior.CachePolicyId !== cachePolicyId) errors.push(`${label}: cache policy ${behavior.CachePolicyId}, expected ${cachePolicyId}`);
    if (behavior.OriginRequestPolicyId !== ALL_VIEWER_EXCEPT_HOST_ID) errors.push(`${label}: origin request policy must be AllViewerExceptHostHeader`);
    if (!originIds.has(behavior.TargetOriginId)) errors.push(`${label}: unknown origin ${behavior.TargetOriginId}`);
    if (behavior.ViewerProtocolPolicy !== 'redirect-to-https') errors.push(`${label}: must redirect to https`);
    if (behavior.AllowedMethods?.Quantity !== 7) errors.push(`${label}: must allow all 7 methods`);
    const cached = [...(behavior.AllowedMethods?.CachedMethods?.Items || [])].sort().join(',');
    if (cached !== 'GET,HEAD') errors.push(`${label}: must cache only GET and HEAD, has ${cached}`);
    if (behavior.Compress !== true) errors.push(`${label}: must compress`);
    if ((behavior.LambdaFunctionAssociations?.Quantity || 0) !== 0) errors.push(`${label}: Lambda@Edge associations are not allowed`);
  };

  checkBehavior(config.DefaultCacheBehavior || {}, 'default behavior', policyIds.dynamic);

  const items = config.CacheBehaviors?.Items || [];
  const patterns = items.map(b => b.PathPattern);
  const expected = patterns[0] === TEMPORARY_PATHS[0] ? [...TEMPORARY_PATHS, ...PUBLIC_PATHS] : PUBLIC_PATHS;
  if (JSON.stringify(patterns) !== JSON.stringify(expected)) errors.push(`behaviors ${JSON.stringify(patterns)}, expected ${JSON.stringify(expected)}`);
  if (config.CacheBehaviors?.Quantity !== items.length) errors.push('CacheBehaviors.Quantity does not match Items');
  items.forEach(b => checkBehavior(b, `behavior ${b.PathPattern}`, TEMPORARY_PATHS.includes(b.PathPattern) ? policyIds.dynamic : policyIds.public));

  const errorItems = config.CustomErrorResponses?.Items || [];
  for (const code of NO_ERROR_CACHING_CODES) {
    const item = errorItems.find(e => e.ErrorCode === code);
    if (!item || item.ErrorCachingMinTTL !== 0) errors.push(`error caching for ${code} must be 0`);
    if (item?.ResponsePagePath) errors.push(`no custom error page for ${code}`);
  }

  const apiGateway = (config.Origins?.Items || []).find(o => o.Id === API_GATEWAY_ORIGIN_ID);
  if (!apiGateway) errors.push('ApiGatewayOrigin must stay until P9');
  for (const origin of config.Origins?.Items || []) {
    if (origin.CustomOriginConfig?.OriginProtocolPolicy !== 'https-only') errors.push(`origin ${origin.Id} must be https-only`);
    if (origin.Id === WEB_FUNCTION_ORIGIN_ID && !origin.OriginAccessControlId) errors.push('WebFunctionOrigin needs an origin access control');
  }

  if (testDistribution) {
    if ((config.Aliases?.Quantity || 0) !== 0) errors.push('test distribution must have no alias');
  } else {
    if (!(config.Aliases?.Items || []).some(alias => alias === ALIAS)) errors.push(`alias ${ALIAS} missing`);
    if (config.ViewerCertificate?.MinimumProtocolVersion !== 'TLSv1.2_2021') errors.push('TLS minimum must stay TLSv1.2_2021');
  }
  if (config.HttpVersion !== 'http2and3') errors.push('HTTP/2 and 3 must stay enabled');
  if (config.IsIPV6Enabled !== true) errors.push('IPv6 must stay enabled');
  if (config.Enabled !== true) errors.push('distribution must be enabled');
  return errors;
}

/** @returns {string[]} differences between a live cache policy config and its spec */
export function checkPolicy(config, specName) {
  const spec = POLICY_SPECS[specName];
  const errors = [];
  for (const key of ['Name', 'MinTTL', 'DefaultTTL', 'MaxTTL']) {
    if (config[key] !== spec[key]) errors.push(`${key} is ${config[key]}, expected ${spec[key]}`);
  }
  const live = config.ParametersInCacheKeyAndForwardedToOrigin || {};
  const want = spec.ParametersInCacheKeyAndForwardedToOrigin;
  if (live.EnableAcceptEncodingGzip !== want.EnableAcceptEncodingGzip) errors.push('gzip setting differs');
  if (live.EnableAcceptEncodingBrotli !== want.EnableAcceptEncodingBrotli) errors.push('brotli setting differs');
  const headers = h => [...(h?.Headers?.Items || [])].map(x => x.toLowerCase()).sort().join(',');
  if (live.HeadersConfig?.HeaderBehavior !== 'whitelist' || headers(live.HeadersConfig) !== headers(want.HeadersConfig)) {
    errors.push(`key headers are ${headers(live.HeadersConfig)}, expected ${headers(want.HeadersConfig)}`);
  }
  if (live.CookiesConfig?.CookieBehavior !== 'none') errors.push('cookies must not be in the key');
  if (live.QueryStringsConfig?.QueryStringBehavior !== 'all') errors.push('all query strings must be in the key');
  return errors;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i += 1; }
    } else args._.push(argv[i]);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const [command] = args._;
  const policyIds = { dynamic: args['dynamic-id'], public: args['public-id'] };
  const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
  const assign = Object.fromEntries(String(args.assign || '').split(',').filter(Boolean).map(pair => pair.split('=')));

  switch (command) {
    case 'render': {
      const webFunction = args['web-origin'] ? { domainName: args['web-origin'], originAccessControlId: args.oac } : null;
      const config = renderDistributionConfig(readJson(args.live), {
        policyIds, assign, temporary: Boolean(args.temporary), webFunction, testDistribution: Boolean(args['test-distribution'])
      });
      const errors = validateDistributionConfig(config, { policyIds, testDistribution: Boolean(args['test-distribution']) });
      if (errors.length) throw new Error(`rendered config is invalid:\n- ${errors.join('\n- ')}`);
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      break;
    }
    case 'validate': {
      const errors = validateDistributionConfig(readJson(args.config), { policyIds, testDistribution: Boolean(args['test-distribution']) });
      if (errors.length) {
        console.error(`invalid:\n- ${errors.join('\n- ')}`);
        process.exit(1);
      }
      console.log('valid');
      break;
    }
    case 'policy-spec':
      process.stdout.write(`${JSON.stringify(POLICY_SPECS[args._[1]], null, 2)}\n`);
      break;
    case 'check-policy': {
      const errors = checkPolicy(unwrapPolicy(readJson(args.config)), args.spec);
      if (errors.length) {
        console.error(`${args.spec} policy differs:\n- ${errors.join('\n- ')}`);
        process.exit(1);
      }
      console.log(`${args.spec} policy matches`);
      break;
    }
    default:
      console.error('usage: edge-config.mjs render|validate|policy-spec|check-policy …');
      process.exit(2);
  }
}

function unwrapPolicy(json) {
  return json.CachePolicy?.CachePolicyConfig || json.CachePolicyConfig || json;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
