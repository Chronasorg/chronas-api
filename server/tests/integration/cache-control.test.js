import { describe, it, before, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { readdir, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { useSchedulerForTests } from '../../helpers/edge-invalidation.js';
import { areaCache } from '../../models/dynamo/area.dynamo.js';
import { metadataCache } from '../../models/dynamo/metadata.dynamo.js';

/**
 * Cache-Control contract for CloudFront. Every response is `no-store` except
 * the public map-data reads, which are identity-independent and must never sit
 * behind JWT middleware: CloudFront keys them by Authorization, but a handler
 * that varied by user would still be cached for that token.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '../..');
const SECRET = process.env.JWT_SECRET || 'test-secret-key';
const ADMIN = jwt.sign({ id: 'admin@chronas.org', username: 'admin', privilege: 5 }, SECRET, { algorithm: 'HS256' });
const GARBAGE_TOKEN = 'Bearer not-a-jwt';

// Every place that sets a `public` Cache-Control, by file: the calls of
// publicCacheControl (server/helpers/edge-cache.js, which builds the header)
// and any literal public header. A new one needs a route below, and must not
// use expressJwt on its GET route.
const PUBLIC_HEADER_HELPER = 'helpers/edge-cache.js';
const MINUTE = 60 * 1000;
const PUBLIC_HEADER_SITES = {
  'controllers/area.controller.js': 1,
  'controllers/marker.controller.js': 1,
  'controllers/metadata.controller.js': 5
};

const PUBLIC_READS = [
  '/v1/areas/1000',
  '/v1/markers?types=e&year=1066',
  '/v1/metadata',
  '/v1/metadata/religion',
  '/v1/metadata?type=g&f=ruler,religion',
  '/v1/metadata?type=e&end=10&subtype=ew',
  '/v1/metadata/culture/getLinked?source=1:e_Some_Event'
];

// Browser max-age, and the edge lifetime each read keeps while the API
// doesn't invalidate CloudFront (edge-invalidation.js); with invalidation
// every one gets 7 days.
const LIFETIMES = {
  '/v1/areas/1000': [86400, 604800],
  '/v1/markers?types=e&year=1066': [300, 3600],
  '/v1/metadata': [300, 3600],
  '/v1/metadata/religion': [3600, 86400],
  '/v1/metadata?type=g&f=ruler,religion': [3600, 86400],
  '/v1/metadata?type=e&end=10&subtype=ew': [1800, 43200],
  '/v1/metadata/culture/getLinked?source=1:e_Some_Event': [0, 3600]
};

async function listJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  }));
  return files.flat();
}

describe('## Cache-Control headers', () => {
  let app;

  before(async function () {
    this.timeout(30000);
    await setupDynamoLocal();
    app = (await import('../../../config/express.js')).default;
  });

  beforeEach(async function () {
    this.timeout(15000);
    await clearTable('chronas-areas');
    await seedTable('chronas-areas', [{ _id: '1000', year: 1000, data: { Kiev: ['RUS', 'slavic', 'orthodox', 'Kiev', 1000] } }]);
    await clearTable('chronas-markers');
    await seedTable('chronas-markers', [{ _id: 'Battle_of_Hastings', name: 'Battle of Hastings', type: 'e', year: 1066, coo: [0, 50] }]);
    await clearTable('chronas-metadata');
    await seedTable('chronas-metadata', [
      { _id: 'ruler', type: 'g', data: { ENG: ['Kingdom of England', 'rgb(181,0,51)', 'Kingdom_of_England', ''] } },
      { _id: 'religion', type: 'g', data: { orthodox: ['Orthodox', 'rgb(0,0,255)', 'Orthodoxy', 'christian', ''] } },
      { _id: 'culture', type: 'g', data: { slavic: ['Slavic', 'rgb(0,255,0)', 'Slavs', ''] } },
      { _id: 'e_Some_Event', type: 'e', subtype: 'ew', year: 1066, data: { title: 'Some event' } }
    ]);
    await clearTable('chronas-users');
    await seedTable('chronas-users', [{ _id: 'admin@chronas.org', email: 'admin@chronas.org', username: 'admin', privilege: 5 }]);
  });

  describe('# public map-data reads', () => {
    PUBLIC_READS.forEach((url) => {
      it(`GET ${url} is public and needs no token`, async () => {
        const anonymous = await request(app).get(url);
        expect(anonymous.status).to.equal(200);
        expect(anonymous.headers['cache-control']).to.match(/^public, max-age=\d+, s-maxage=\d+$/);

        // A JWT check on the route would turn a bad token into a 401.
        const withBadToken = await request(app).get(url).set('Authorization', GARBAGE_TOKEN);
        expect(withBadToken.status).to.equal(200);
      });
    });

    it('only the known handlers set a public Cache-Control', async () => {
      const found = {};
      for (const file of await listJsFiles(SERVER_DIR)) {
        const relative = path.relative(SERVER_DIR, file).split(path.sep).join('/');
        if (relative === PUBLIC_HEADER_HELPER) continue;
        const count = ((await readFile(file, 'utf8')).match(/publicCacheControl\(|['"`]public, /g) || []).length;
        if (count) found[relative] = count;
      }
      expect(found, 'add new public reads to PUBLIC_HEADER_SITES and PUBLIC_READS').to.deep.equal(PUBLIC_HEADER_SITES);
    });
  });

  describe('# edge lifetime', () => {
    const withInvalidation = async (active, fn) => {
      const previous = useSchedulerForTests({ markDirty() {}, markDirtyDeferred() {}, flush: async () => {}, active: () => active });
      try {
        await fn();
      } finally {
        useSchedulerForTests(previous);
      }
    };

    beforeEach(() => {
      areaCache.clear();
      metadataCache.clear();
    });

    it('every public read gets 7 days at the edge while writes invalidate it, and keeps its browser max-age', async () => {
      await withInvalidation(true, async () => {
        for (const url of PUBLIC_READS) {
          const res = await request(app).get(url);
          expect(res.headers['cache-control'], url).to.equal(`public, max-age=${LIFETIMES[url][0]}, s-maxage=604800`);
        }
      });
    });

    it('without invalidation each read keeps its previous edge lifetime', async () => {
      await withInvalidation(false, async () => {
        for (const url of PUBLIC_READS) {
          const res = await request(app).get(url);
          expect(res.headers['cache-control'], url).to.equal(`public, max-age=${LIFETIMES[url][0]}, s-maxage=${LIFETIMES[url][1]}`);
        }
      });
    });

    it('an area year served from an older in-process entry gets the time the entry has left', async () => {
      await withInvalidation(true, async () => {
        expect((await request(app).get('/v1/areas/1000')).headers['cache-control']).to.equal('public, max-age=86400, s-maxage=604800');
        // As if another environment's write had happened since this one read the year.
        const entry = areaCache.entries.get('1000');
        entry.dataAt -= 60 * MINUTE;
        entry.expiresAt = Date.now() + (120 * MINUTE);
        const res = await request(app).get('/v1/areas/1000');
        expect(res.status).to.equal(200);
        const sMaxAge = Number(res.headers['cache-control'].match(/s-maxage=(\d+)$/)[1]);
        expect(sMaxAge).to.be.within((120 * 60) - 5, 120 * 60);
      });
    });

    it('a metadata list served from an older in-process entry gets the time the entry has left', async () => {
      await withInvalidation(true, async () => {
        const url = '/v1/metadata?type=g&f=ruler,religion';
        expect((await request(app).get(url)).headers['cache-control']).to.equal('public, max-age=3600, s-maxage=604800');
        for (const entry of metadataCache.entries.values()) {
          entry.dataAt -= 10 * MINUTE;
          entry.expiresAt = Date.now() + (50 * MINUTE);
        }
        const sMaxAge = Number((await request(app).get(url)).headers['cache-control'].match(/s-maxage=(\d+)$/)[1]);
        expect(sMaxAge).to.be.within((50 * 60) - 5, 50 * 60);
      });
    });
  });

  describe('# everything else is no-store', () => {
    const cases = [
      ['GET', '/v1/health', null, 200],
      ['GET', '/v1/version', null, 200],
      ['GET', '/v1/areas', null, 200],
      ['GET', '/v1/markers/Battle_of_Hastings', null, 200],
      ['GET', '/v1/users/admin@chronas.org', ADMIN, 200],
      ['GET', '/v1/users/admin@chronas.org', null, 401],
      ['GET', '/v1/metadata/culture/getLinked', null, 400],
      ['PUT', '/v1/areas/1000', null, 401],
      ['GET', '/v1/areas/99999', null, 404],
      ['GET', '/v1/does-not-exist', null, 404],
      ['GET', '/v1/auth/login/google', null, 410],
      ['GET', '/v1/collections', null, 410]
    ];

    cases.forEach(([method, url, token, status]) => {
      it(`${method} ${url}${token ? ' (authenticated)' : ''} → ${status}, no-store`, async () => {
        let req = request(app)[method.toLowerCase()](url);
        if (token) req = req.set('Authorization', `Bearer ${token}`);
        const res = await req;
        expect(res.status).to.equal(status);
        expect(res.headers['cache-control']).to.equal('no-store');
      });
    });

    it('POST /v1/auth/login with a wrong password → 401, no-store', async () => {
      const res = await request(app).post('/v1/auth/login').send({ email: 'admin@chronas.org', password: 'wrong' });
      expect(res.status).to.equal(401);
      expect(res.headers['cache-control']).to.equal('no-store');
    });

    it('a CORS preflight is no-store', async () => {
      const res = await request(app)
        .options('/v1/auth/login')
        .set('Origin', 'https://chronas.org')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization');
      expect(res.status).to.equal(204);
      expect(res.headers['access-control-allow-headers']).to.equal('content-type,authorization');
      expect(res.headers['cache-control']).to.equal('no-store');
    });

    it('a 500 from a public path is no-store', async () => {
      const savedClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
      globalThis.__TEST_DYNAMO_DOC_CLIENT = { send: async () => { throw new Error('DynamoDB unavailable'); } };
      try {
        const res = await request(app).get('/v1/markers?types=e&year=1');
        expect(res.status).to.equal(500);
        expect(res.headers['cache-control']).to.equal('no-store');
      } finally {
        globalThis.__TEST_DYNAMO_DOC_CLIENT = savedClient;
      }
    });
  });
});
