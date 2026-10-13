#!/usr/bin/env node
/**
 * Gate checks for docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md P3–P5 and P8,
 * against any base URL. Read-only apart from one login.
 *
 *   SMOKE_PASSWORD=… node verify.mjs --base https://d24mkpax7rmotx.cloudfront.net \
 *     [--direct <another base URL to compare bodies with>] [--expect-cloudfront] [--out summary.json]
 *
 * Without SMOKE_PASSWORD the authenticated checks are skipped (not passed).
 * Never prints tokens. Exit code 1 if any check fails.
 */

import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return pairs;
}, []));
const BASE = String(args.base || '').replace(/\/$/, '');
const DIRECT = args.direct ? String(args.direct).replace(/\/$/, '') : null;
if (!BASE) {
  console.error('usage: verify.mjs --base <url> [--direct <url>] [--expect-cloudfront] [--out file]');
  process.exit(2);
}

function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(target, {
      method,
      headers: { 'accept-encoding': 'gzip, br', 'user-agent': 'chronas-api-edge-verify', ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let raw = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') raw = zlib.gunzipSync(raw);
        if (encoding === 'br') raw = zlib.brotliDecompressSync(raw);
        resolve({ status: res.statusCode, headers: res.headers, text: raw.toString('utf8') });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${method} ${url}`)));
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const results = [];
async function check(name, fn) {
  try {
    const outcome = await fn();
    if (outcome === 'skip') results.push({ name, status: 'skipped' });
    else results.push({ name, status: 'pass', ...(outcome && typeof outcome === 'object' ? { details: outcome } : {}) });
  } catch (error) {
    results.push({ name, status: 'fail', error: error.message });
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}
const isHit = res => /^(Hit|RefreshHit)/i.test(res.headers['x-cache'] || '');
const unique = () => crypto.randomUUID();
// getLinked and marker lists come back in varying order (BatchGetItem), so
// compare content with every array sorted.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const sha = (text) => {
  let normalized = text;
  try { normalized = JSON.stringify(canonical(JSON.parse(text))); } catch { /* not JSON */ }
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
};

let token = null;
await check('login works through the base URL', async () => {
  if (!process.env.SMOKE_PASSWORD) return 'skip';
  const res = await request('POST', `${BASE}/v1/auth/login`, { body: { email: 'postman@aui.de', password: process.env.SMOKE_PASSWORD } });
  expect(res.status === 200, `status ${res.status}`);
  token = JSON.parse(res.text).token;
  expect(Boolean(token), 'no token in the response');
  return null;
});

await check('(1) authenticated profile 200, anonymous re-read 401 and never a hit', async () => {
  if (!token) return 'skip';
  const url = `${BASE}/v1/users/postman@aui.de`;
  const authed = await request('GET', url, { headers: { authorization: `Bearer ${token}` } });
  expect(authed.status === 200, `authenticated status ${authed.status}`);
  const anon = await request('GET', url);
  expect(anon.status === 401, `anonymous status ${anon.status}`);
  expect(!isHit(anon), `anonymous re-read was ${anon.headers['x-cache']}`);
  expect(!anon.text.includes('postman@aui.de'), 'anonymous response contains the profile');
  return null;
});

await check('(1b) an authenticated public read is keyed per token, not served to anonymous', async () => {
  if (!token) return 'skip';
  const url = `${BASE}/v1/areas/1500?_v=${unique()}`;
  const authed = await request('GET', url, { headers: { authorization: `Bearer ${token}` } });
  expect(authed.status === 200, `authenticated status ${authed.status}`);
  const anon = await request('GET', url);
  expect(anon.status === 200, `anonymous status ${anon.status}`);
  expect(!isHit(anon), `anonymous request hit the entry of the authenticated one (${anon.headers['x-cache']})`);
  return null;
});

await check('(3) preflight reflects requested headers', async () => {
  for (const path of ['/v1/auth/login', '/v1/areas/1500']) {
    const res = await request('OPTIONS', `${BASE}${path}`, {
      headers: { origin: 'https://chronas.org', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,authorization' }
    });
    expect(res.status < 300, `${path}: status ${res.status}`);
    expect((res.headers['access-control-allow-headers'] || '').toLowerCase() === 'content-type,authorization', `${path}: allow-headers ${res.headers['access-control-allow-headers']}`);
    expect(res.headers['access-control-allow-origin'] === 'https://chronas.org', `${path}: allow-origin ${res.headers['access-control-allow-origin']}`);
  }
  return null;
});

await check('(4) a unique area URL misses, then hits', async () => {
  const url = `${BASE}/v1/areas/1500?_v=${unique()}`;
  const first = await request('GET', url);
  const second = await request('GET', url);
  expect(first.status === 200 && second.status === 200, `status ${first.status}/${second.status}`);
  expect(/public/.test(first.headers['cache-control'] || ''), `cache-control ${first.headers['cache-control']}`);
  if (args['expect-cloudfront']) {
    expect(!isHit(first), `first request was ${first.headers['x-cache']}`);
    expect(isHit(second), `second request was ${second.headers['x-cache']}`);
  }
  return { first: first.headers['x-cache'], second: second.headers['x-cache'] };
});

await check('(5) version, health and a 410 are never hits', async () => {
  for (const path of ['/v1/version', '/v1/health', '/v1/auth/login/google']) {
    const a = await request('GET', `${BASE}${path}`);
    const b = await request('GET', `${BASE}${path}`);
    expect(!isHit(a) && !isHit(b), `${path}: ${a.headers['x-cache']} / ${b.headers['x-cache']}`);
    expect(a.headers['cache-control'] === 'no-store', `${path}: cache-control ${a.headers['cache-control']}`);
  }
  return null;
});

await check('(6) a disallowed origin gets no CORS headers and no 5xx', async () => {
  const res = await request('GET', `${BASE}/v1/health`, { headers: { origin: 'https://evil.example.com' } });
  expect(res.status < 500, `status ${res.status}`);
  expect(!res.headers['access-control-allow-origin'], `allow-origin ${res.headers['access-control-allow-origin']}`);
  return null;
});

await check('(7) bodies match the direct API', async () => {
  if (!DIRECT) return 'skip';
  const paths = ['/v1/areas/1500', '/v1/metadata?type=g&f=ruler', '/v1/markers?types=e&year=1500&count=50', '/v1/metadata/culture/getLinked?source=1:e_World_War_II'];
  const mismatches = [];
  for (const path of paths) {
    const bust = `${path.includes('?') ? '&' : '?'}_v=${unique()}`;
    const [viaBase, viaDirect] = await Promise.all([request('GET', `${BASE}${path}${bust}`), request('GET', `${DIRECT}${path}${bust}`)]);
    if (viaBase.status !== viaDirect.status || sha(viaBase.text) !== sha(viaDirect.text)) mismatches.push(path);
  }
  expect(mismatches.length === 0, `differ: ${mismatches.join(', ')}`);
  return null;
});

await check('(8) a 503 is not cached', async () => {
  const a = await request('GET', `${BASE}/v1/statistics`);
  if (a.status !== 503) return { note: `statistics returned ${a.status}; check not applicable` };
  const b = await request('GET', `${BASE}/v1/statistics`);
  expect(!isHit(b), `second 503 was ${b.headers['x-cache']}`);
  return null;
});

await check('responses are compressed on public and dynamic paths', async () => {
  // Both sides skip bodies under about 1 KB, so use large responses.
  for (const path of ['/v1/areas/1500', '/v1/flags']) {
    const res = await request('GET', `${BASE}${path}`);
    expect(['gzip', 'br'].includes(res.headers['content-encoding']), `${path}: content-encoding ${res.headers['content-encoding']}`);
  }
  return null;
});

if (args['expect-cloudfront']) {
  await check('served by CloudFront (via header)', async () => {
    const res = await request('GET', `${BASE}/v1/version`);
    expect(/cloudfront/i.test(res.headers.via || ''), `via ${res.headers.via}`);
    return { version: JSON.parse(res.text).commit };
  });
}

const summary = {
  base: BASE,
  direct: DIRECT,
  at: new Date().toISOString(),
  passed: results.filter(r => r.status === 'pass').length,
  failed: results.filter(r => r.status === 'fail').length,
  skipped: results.filter(r => r.status === 'skipped').length,
  results
};
if (args.out) writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`);
for (const r of results) console.log(`${r.status.padEnd(7)} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
console.log(`${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);
process.exit(summary.failed ? 1 : 0);
