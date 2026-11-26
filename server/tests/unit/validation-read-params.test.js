import { describe, it, before, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import {
  markerListParams, metadataListParams, linkedSourceParam, MAX_LIST_LENGTH
} from '../../helpers/read-params.js';
import DynamoQuery, { DEFAULT_PAGE_SIZE } from '../../models/dynamo/dynamo-query.js';

/**
 * Public list reads check their parameters before DynamoDB (pentest F3, F4,
 * F14). The URLs below are the ones that answered 500 in production during
 * the pentest (CloudWatch, 2026-11-24); they must answer 400 now. The URLs
 * the frontends and data scripts really send must keep answering 200.
 */
const PENTEST_500S = [
  '/v1/markers?wikis=ok%25ZZ,Rome',
  '/v1/markers?wikis=%25E0%25A4%25A',
  '/v1/markers?wikis=%25',
  '/v1/markers?limit=abc',
  '/v1/markers?count=%24%7B7%2A7%7D',
  '/v1/markers?limit=-1',
  '/v1/markers?count=-1',
  '/v1/markers?year=1e200&types=c&limit=3',
  '/v1/markers?year=1e999&types=c&limit=3',
  '/v1/markers?year=-1e400',
  '/v1/markers?year=1500&types=c&delta=1e999&limit=3',
  '/v1/markers?end=1000&year=1500',
  `/v1/markers?wikis=Rome,${'a'.repeat(1100)}`,
  '/v1/metadata?year=1e200',
  '/v1/metadata?type=false&year=1000',
  `/v1/metadata/links/getLinked?source=1:${'a'.repeat(1100)}`,
  `/v1/metadata/links/getLinked?source=${'A'.repeat(300)}`,
  '/v1/metadata/links/getLinked?source=1:a&source=1:b',
  '/v1/metadata/links/getLinked?source=a&source=b',
];

// Duplicates and empty list entries are normalized instead of refused.
const NORMALIZED = [
  '/v1/markers?wikis=a&wikis=a&limit=1',
  '/v1/markers?wikis=Rome,Rome',
  '/v1/metadata?f=ruler&f=ruler',
  '/v1/metadata?f=ruler,',
];

const REAL_CLIENT_URLS = [
  // chronas-frontend (src/api/endpoints.ts)
  '/v1/markers?types=c&year=-5000&end=2100&limit=10000',
  '/v1/markers?year=1066&limit=500',
  '/v1/markers?year=1066&type=e',
  '/v1/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral',
  '/v1/metadata?type=g&locale=de&f=ruler_de,culture_de,religion_de,religionGeneral_de',
  '/v1/metadata?type=e&end=3000&subtype=ew,ei,ps',
  '/v1/metadata/links/getLinked?source=1:e_Some_Event',
  // old.chronas.org
  '/v1/metadata?year=1066',
  '/v1/metadata?type=e&search=Some',
  '/v1/metadata?type=e&end=10000&subtype=ew',
  '/v1/markers?types=a,ar,at,b,c,ca,cp,e,m,op,p,r,s,si&year=714&count=3000',
  '/v1/markers?migration=true&year=1066',
  '/v1/markers?both=true&search=Hastings',
  '/v1/metadata/links/getLinked?source=1:ae|ruler|ENG',
  // data-validation scripts (limit above the cap is clamped)
  '/v1/markers?types=c&year=-5000&end=2100&limit=50000',
  '/v1/metadata?type=g&f=ruler',
  // Postman
  '/v1/markers/?count=1',
  '/v1/metadata/',
];

describe('## Public list reads check their parameters', () => {
  let app;

  // Starts its own dynalite and clears tables, like user-auth-security: the
  // file name keeps it after statistics-cache, whose root hook seeds the
  // shared dynalite once for the whole run.
  before(async function () {
    this.timeout(30000);
    await setupDynamoLocal();
    app = (await import('../helpers/test-app.js')).default;
  });

  beforeEach(async function () {
    this.timeout(15000);
    await clearTable('chronas-markers');
    await seedTable('chronas-markers', [
      { _id: 'Battle_of_Hastings', name: 'Battle of Hastings', type: 'e', year: 1066, coo: [0, 50] },
      { _id: 'Rome', name: 'Rome', type: 'c', year: -753, coo: [12.5, 41.9] },
    ]);
    await clearTable('chronas-metadata');
    await seedTable('chronas-metadata', [
      { _id: 'ruler', type: 'g', data: { ENG: ['Kingdom of England', 'rgb(181,0,51)', 'Kingdom_of_England', ''] } },
      { _id: 'e_Some_Event', type: 'e', subtype: 'ew', year: 1066, data: { title: 'Some event' } },
    ]);
  });

  describe('# over HTTP', () => {
    for (const url of PENTEST_500S) {
      it(`${url.slice(0, 80)} → 400`, async () => {
        const res = await request(app).get(url);
        expect(res.status).to.equal(400);
      });
    }

    for (const url of NORMALIZED) {
      it(`${url} → 200 (duplicates and empty entries dropped)`, async () => {
        expect((await request(app).get(url)).status).to.equal(200);
      });
    }

    for (const url of REAL_CLIENT_URLS) {
      it(`${url.slice(0, 90)} → 200`, async () => {
        expect((await request(app).get(url)).status).to.equal(200);
      });
    }

    it('F3: a type=false query no longer empties the year list for later requests', async () => {
      expect((await request(app).get('/v1/metadata?type=false&year=1066')).status).to.equal(400);
      const res = await request(app).get('/v1/metadata?year=1066');
      expect(res.status).to.equal(200);
      expect(res.body.map(item => item._id)).to.include('e_Some_Event');
    });

    it('a marker wiki list is decoded once and looked up without duplicates', async () => {
      const res = await request(app).get('/v1/markers?wikis=Rome,Rome,Battle_of_Hastings');
      expect(res.status).to.equal(200);
      expect(res.body.map(m => m._id).sort()).to.deep.equal(['Battle_of_Hastings', 'Rome']);
    });
  });

  describe('# getLinked checks source before any read', () => {
    for (const path of ['/v1/metadata/links/getLinked', '/v1/metadata/ruler/getLinked', '/v1/metadata/no-such-doc/getLinked']) {
      it(`${path} with a bad source → 400 and no DynamoDB call`, async () => {
        const calls = [];
        const saved = globalThis.__TEST_DYNAMO_DOC_CLIENT;
        globalThis.__TEST_DYNAMO_DOC_CLIENT = { send: async (command) => { calls.push(command.constructor.name); return {}; } };
        try {
          for (const query of ['?source=a&source=b', '?source=noprefix', `?source=1:${'a'.repeat(1100)}`]) {
            const res = await request(app).get(`${path}${query}`);
            expect(res.status, query).to.equal(400);
          }
        } finally {
          globalThis.__TEST_DYNAMO_DOC_CLIENT = saved;
        }
        expect(calls).to.deep.equal([]);
      });
    }

    it('a valid source works on any path, without loading the path document', async () => {
      for (const path of ['/v1/metadata/links/getLinked', '/v1/metadata/no-such-doc/getLinked']) {
        const res = await request(app).get(`${path}?source=1:e_Some_Event`);
        expect(res.status, path).to.equal(200);
        expect(res.body).to.have.keys(['map', 'media']);
      }
    });
  });

  describe('# parameter functions', () => {
    it('clamps sizes instead of refusing them', () => {
      expect(markerListParams({ limit: '50000' }).length).to.equal(MAX_LIST_LENGTH);
      expect(markerListParams({ count: '3000' }).length).to.equal(3000);
      expect(markerListParams({}).length).to.equal(2000);
      expect(metadataListParams({ end: '999999', start: '999999' })).to.include({ end: MAX_LIST_LENGTH, start: MAX_LIST_LENGTH });
    });

    it('keeps "no value" apart from values', () => {
      const p = markerListParams({ year: '0' });
      expect(p.year).to.equal(0);
      expect(markerListParams({}).year).to.equal(false);
      expect(metadataListParams({ year: '0' }).year).to.equal(false);
      expect(metadataListParams({}).type).to.equal(false);
    });

    it('refuses parameters given twice where only one makes sense', () => {
      expect(() => markerListParams({ year: ['1', '2'] })).to.throw('year may be given only once');
      expect(() => metadataListParams({ type: ['e', 'g'] })).to.throw();
      expect(() => linkedSourceParam({ source: ['1:a', '1:b'] })).to.throw();
    });

    it('accepts only the metadata types that exist', () => {
      for (const type of ['i', 'ap', 'e', 'g', 'a_ruler', 'a_culture', 'a_religion', 'a_religionGeneral']) {
        expect(metadataListParams({ type }).type).to.equal(type);
      }
      for (const type of ['false', 'x', '$ne', 'e,g']) {
        expect(() => metadataListParams({ type }), type).to.throw();
      }
    });
  });

  describe('# markers read cap', () => {
    const ALL_TYPES = ['a', 'at', 'e', 'm', 'op', 'p', 'r', 's', 'c', 'ca', 'w'];

    // A fake index: `perType` items per type, served in pages of at most the
    // request's Limit (DynamoDB returns at most Limit items for a key condition).
    function fakeIndex(perType) {
      const stats = { read: 0, queries: 0, maxLimit: 0 };
      const client = {
        send: async (command) => {
          const { Limit, ExclusiveStartKey, ExpressionAttributeValues } = command.input;
          stats.queries += 1;
          stats.maxLimit = Math.max(stats.maxLimit, Limit);
          const type = ExpressionAttributeValues[':t'];
          const from = ExclusiveStartKey ? ExclusiveStartKey.n : 0;
          const n = Math.min(Limit, perType - from);
          stats.read += n;
          const Items = Array.from({ length: n }, (_, i) => ({ _id: `${type}${from + i}`, name: 'x', type, year: 1 }));
          return { Items, LastEvaluatedKey: from + n < perType ? { n: from + n } : undefined };
        }
      };
      return { client, stats };
    }

    async function withClient(client, fn) {
      const saved = globalThis.__TEST_DYNAMO_DOC_CLIENT;
      globalThis.__TEST_DYNAMO_DOC_CLIENT = client;
      try { return await fn(); } finally { globalThis.__TEST_DYNAMO_DOC_CLIENT = saved; }
    }

    it('reads at most MAX_QUERY_ITEMS in one request, across all eleven types in parallel', async () => {
      const { MAX_QUERY_ITEMS, QUERY_PAGE_ITEMS } = await import('../../models/dynamo/marker.dynamo.js');
      const Marker = (await import('../../models/marker.model.js')).default;
      const { client, stats } = fakeIndex(1000000);
      const markers = await withClient(client, () => Marker.list({ typeArray: ALL_TYPES, year: -5000, end: 2100, length: 10 }));
      expect(markers).to.have.length(10);
      expect(stats.read).to.equal(MAX_QUERY_ITEMS);
      expect(stats.maxLimit).to.be.at.most(QUERY_PAGE_ITEMS);
    });

    it('still returns every type of an ordinary year request', async () => {
      const Marker = (await import('../../models/marker.model.js')).default;
      const { client, stats } = fakeIndex(40);
      const markers = await withClient(client, () => Marker.list({ typeArray: ALL_TYPES, year: 1066, length: 2000 }));
      expect(markers).to.have.length(ALL_TYPES.length * 40);
      expect(new Set(markers.map(m => m.type))).to.have.property('size', ALL_TYPES.length);
      expect(stats.queries).to.equal(ALL_TYPES.length);
    });

    it('reads all 4,663 cities, as chronas.org asks for them', async () => {
      const Marker = (await import('../../models/marker.model.js')).default;
      const { client } = fakeIndex(4663);
      const markers = await withClient(client, () => Marker.list({ typeArray: ['c'], year: -5000, end: 2100, length: 10000 }));
      expect(markers).to.have.length(4663);
    });
  });

  describe('# DynamoQuery limit and skip', () => {
    it('treat a limit that is not a positive integer as the default page size', () => {
      for (const n of [0, -1, 'abc', Number.NaN, 1.5, Infinity]) {
        expect(new DynamoQuery(null).limit(n)._limit, String(n)).to.equal(DEFAULT_PAGE_SIZE);
      }
      expect(new DynamoQuery(null).limit(25)._limit).to.equal(25);
      expect(new DynamoQuery(null).limit(undefined)._limit).to.equal(null);
    });

    it('treat a negative or non-integer skip as 0', () => {
      for (const n of [-5, 'abc', Number.NaN, 1.5]) {
        expect(new DynamoQuery(null).skip(n)._skip, String(n)).to.equal(0);
      }
      expect(new DynamoQuery(null).skip(10)._skip).to.equal(10);
    });
  });
});
