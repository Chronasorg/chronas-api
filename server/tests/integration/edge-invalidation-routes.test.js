import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { useSchedulerForTests } from '../../helpers/edge-invalidation.js';
import { areaCache } from '../../models/dynamo/area.dynamo.js';
import { metadataCache } from '../../models/dynamo/metadata.dynamo.js';

/**
 * Every write route that changes public map data marks the resources whose
 * edge copies it changes (server/helpers/edge-invalidation.js), through the
 * model that writes. The process scheduler is replaced by a recorder, so
 * nothing is sent anywhere.
 */

const SECRET = process.env.JWT_SECRET || 'test-secret-key';
const sign = (username, privilege) => jwt.sign({ id: `${username}@chronas.org`, username, privilege }, SECRET, { algorithm: 'HS256' });
const ADMIN = sign('admin', 5);
const EDITOR = sign('editor', 3);
const VOTER = sign('voter', 1);

const KIEV = ['RUS', 'slavic', 'orthodox', 'Kiev', 1000];
const areaYears = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({
  _id: String(from + i), year: from + i, data: { Kiev: [...KIEV], Thrace: ['BYZ', 'greek', 'orthodox', 'Constantinople', 500] }
}));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function recorder() {
  const marks = [];
  return {
    marks,
    markDirty: (...resources) => marks.push(...resources.map(resource => ({ resource, deferred: false }))),
    markDirtyDeferred: (...resources) => marks.push(...resources.map(resource => ({ resource, deferred: true }))),
    flush: async () => {},
    active: () => true
  };
}

// The legacy admin client (admin-on-rest) sends the revision record as the
// body of a revert; the revert handlers expect a body.
describe('## Edge invalidation: write routes mark what they change', function () {
  this.timeout(30000);
  let app;
  let rec;
  let previous;

  before(async () => {
    await setupDynamoLocal();
    app = (await import('../../../config/express.js')).default;
    rec = recorder();
    previous = useSchedulerForTests(rec);
  });

  after(() => {
    useSchedulerForTests(previous);
  });

  beforeEach(async () => {
    areaCache.clear();
    metadataCache.clear();
    await clearTable('chronas-areas');
    await seedTable('chronas-areas', areaYears(1000, 1012));
    await clearTable('chronas-markers');
    await seedTable('chronas-markers', [
      { _id: 'Battle_of_Hastings', name: 'Battle of Hastings', type: 'e', year: 1066, coo: [0, 50] }
    ]);
    await clearTable('chronas-metadata');
    await seedTable('chronas-metadata', [
      { _id: 'culture', type: 'g', data: { slavic: ['Slavic', 'rgb(0,255,0)', 'Slavs', ''] } },
      { _id: 'e_Some_Event', type: 'e', subtype: 'ew', year: 1066, score: 0, data: { title: 'Some event' } },
      { _id: 'e_Kiev_War', type: 'e', subtype: 'ew', year: 1001, score: 0, data: { title: 'A war', participants: [['RUS'], ['BYZ']] } }
    ]);
    await clearTable('chronas-links');
    await clearTable('chronas-revisions');
    await clearTable('chronas-users');
    await seedTable('chronas-users', ['admin', 'editor', 'voter'].map(username => ({
      _id: `${username}@chronas.org`, email: `${username}@chronas.org`, username, privilege: 1
    })));
    rec.marks.length = 0;
  });

  // Waits until the background writes some handlers run after answering
  // have marked, then returns what was marked, as sorted unique names.
  async function marked({ expect: expected = null, deferred = false } = {}) {
    const names = () => [...new Set(rec.marks.filter(m => m.deferred === deferred).map(m => m.resource))].sort();
    for (let i = 0; i < 40 && expected && JSON.stringify(names()) !== JSON.stringify(expected); i += 1) await wait(50);
    await wait(100);
    return names();
  }

  describe('# areas', () => {
    it('PUT /v1/areas (a few years) → areas', async () => {
      const res = await request(app).put('/v1/areas').set('Authorization', `Bearer ${EDITOR}`)
        .send({ start: 1000, end: 1001, provinces: ['Kiev'], religion: 'catholic' });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['areas'] })).to.deep.equal(['areas']);
    });

    it('PUT /v1/areas (more than 10 years, written after the answer) → areas, once per year', async () => {
      // Answers before the years are written (its status is not what this tests).
      await request(app).put('/v1/areas').set('Authorization', `Bearer ${EDITOR}`)
        .send({ start: 1000, end: 1012, provinces: ['Kiev'], religion: 'catholic' });
      for (let i = 0; i < 60 && rec.marks.length < 13; i += 1) await wait(50);
      expect(await marked()).to.deep.equal(['areas']);
      expect(rec.marks.length).to.equal(13);
    });

    it('PUT /v1/areas that changes nothing marks nothing', async () => {
      const res = await request(app).put('/v1/areas').set('Authorization', `Bearer ${EDITOR}`)
        .send({ start: 1000, end: 1001, provinces: ['Kiev'], religion: 'orthodox' });
      expect(res.status).to.equal(200);
      expect(await marked()).to.deep.equal([]);
    });

    it('POST /v1/areas → areas', async () => {
      const res = await request(app).post('/v1/areas').set('Authorization', `Bearer ${ADMIN}`)
        .send({ year: '2500', data: { Kiev: [...KIEV] } });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['areas'] })).to.deep.equal(['areas']);
    });

    it('PUT /v1/areas/replace → areas', async () => {
      const res = await request(app).put('/v1/areas/replace').set('Authorization', `Bearer ${EDITOR}`)
        .send({ start: 1000, end: 1003, ruler: 'RUS', replaceWith: 'KIE' });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['areas'] })).to.deep.equal(['areas']);
      expect(rec.marks.length).to.equal(4);
    });

    it('PUT /v1/areas/:areaId → areas', async () => {
      const res = await request(app).put('/v1/areas/1000').set('Authorization', `Bearer ${EDITOR}`)
        .send({ data: { Kiev: ['KIE', 'slavic', 'orthodox', 'Kiev', 1000] } });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['areas'] })).to.deep.equal(['areas']);
    });

    it('DELETE /v1/areas/:areaId → areas, and the year leaves the in-process cache', async () => {
      expect((await request(app).get('/v1/areas/1012')).status).to.equal(200);
      expect(areaCache.get('1012')).to.not.equal(undefined);
      const res = await request(app).delete('/v1/areas/1012').set('Authorization', `Bearer ${ADMIN}`);
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['areas'] })).to.deep.equal(['areas']);
      expect(areaCache.get('1012')).to.equal(undefined);
      expect((await request(app).get('/v1/areas/1012')).status).to.equal(404);
    });

    it('a write without a token marks nothing', async () => {
      const res = await request(app).put('/v1/areas').send({ start: 1000, end: 1000, provinces: ['Kiev'], religion: 'catholic' });
      expect(res.status).to.equal(401);
      expect(await marked()).to.deep.equal([]);
    });
  });

  describe('# markers (getLinked embeds them, so metadata too)', () => {
    it('POST /v1/markers → markers, metadata', async () => {
      const res = await request(app).post('/v1/markers').set('Authorization', `Bearer ${EDITOR}`)
        .send({ wiki: 'Test_Marker', name: 'Test marker', type: 'e', year: 1066, coo: [1, 51] });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['markers', 'metadata'] })).to.deep.equal(['markers', 'metadata']);
    });

    it('PUT /v1/markers/:markerId → markers, metadata', async () => {
      const res = await request(app).put('/v1/markers/Battle_of_Hastings').set('Authorization', `Bearer ${EDITOR}`)
        .send({ name: 'Battle of Hastings (1066)' });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['markers', 'metadata'] })).to.deep.equal(['markers', 'metadata']);
    });

    it('PUT /v1/markers/:markerId with a new wiki (rename, links move) → markers, metadata', async () => {
      await seedTable('chronas-links', [
        { entityRef: '0:Battle_of_Hastings', markers: [], metadata: [['e_Some_Event', 'e']] },
        { entityRef: '1:e_Some_Event', markers: [['Battle_of_Hastings', 'e']], metadata: [] }
      ]);
      const res = await request(app).put('/v1/markers/Battle_of_Hastings').set('Authorization', `Bearer ${EDITOR}`)
        .send({ wiki: 'Battle_of_Hastings_1066' });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['markers', 'metadata'] })).to.deep.equal(['markers', 'metadata']);
      // save, delete, and three link writes
      expect(rec.marks.length).to.be.at.least(5);
    });

    it('DELETE /v1/markers/:markerId → markers, metadata', async () => {
      const res = await request(app).delete('/v1/markers/Battle_of_Hastings').set('Authorization', `Bearer ${EDITOR}`);
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['markers', 'metadata'] })).to.deep.equal(['markers', 'metadata']);
    });
  });

  describe('# metadata', () => {
    it('POST /v1/metadata → metadata', async () => {
      const res = await request(app).post('/v1/metadata').set('Authorization', `Bearer ${EDITOR}`)
        .send({ _id: 'e_New_Event', type: 'e', subtype: 'ew', year: 1100, data: { title: 'New' } });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    it('PUT /v1/metadata/:metadataId → metadata', async () => {
      const res = await request(app).put('/v1/metadata/e_Some_Event').set('Authorization', `Bearer ${EDITOR}`)
        .send({ data: { title: 'Some event, edited' } });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    it('DELETE /v1/metadata/:metadataId → metadata', async () => {
      const res = await request(app).delete('/v1/metadata/e_Some_Event').set('Authorization', `Bearer ${EDITOR}`);
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    it('PUT /v1/metadata/:metadataId/single → metadata', async () => {
      const res = await request(app).put('/v1/metadata/culture/single').set('Authorization', `Bearer ${EDITOR}`)
        .send({ subEntityId: 'nordic', nextBody: ['Nordic', 'rgb(10,20,30)', 'North_Germanic_peoples', ''] });
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    it('PUT /v1/metadata/:metadataId/single with a malformed body marks nothing', async () => {
      const res = await request(app).put('/v1/metadata/culture/single').set('Authorization', `Bearer ${EDITOR}`)
        .send({ subEntityId: 'nordic' });
      expect(res.status).to.equal(400);
      expect(await marked()).to.deep.equal([]);
    });

    const link = {
      linkedItemType1: 'metadata', linkedItemKey1: 'e_Some_Event',
      linkedItemType2: 'markers', linkedItemKey2: 'Battle_of_Hastings'
    };

    it('PUT /v1/metadata/:metadataId/addLink → metadata', async () => {
      const res = await request(app).put('/v1/metadata/links/addLink').set('Authorization', `Bearer ${EDITOR}`).send(link);
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    it('PUT /v1/metadata/:metadataId/removeLink → metadata', async () => {
      await seedTable('chronas-links', [
        { entityRef: '1:e_Some_Event', markers: [['Battle_of_Hastings', 'e']], metadata: [] },
        { entityRef: '0:Battle_of_Hastings', markers: [], metadata: [['e_Some_Event', 'e']] }
      ]);
      const res = await request(app).put('/v1/metadata/links/removeLink').set('Authorization', `Bearer ${EDITOR}`).send(link);
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    for (const vote of ['upvote', 'downvote']) {
      it(`PUT /v1/metadata/:metadataId/${vote} (any account) → metadata, deferred`, async () => {
        const res = await request(app).put(`/v1/metadata/e_Some_Event/${vote}`).set('Authorization', `Bearer ${VOTER}`);
        expect(res.status).to.equal(200);
        expect(await marked({ expect: ['metadata'], deferred: true })).to.deep.equal(['metadata']);
        expect(await marked()).to.deep.equal([]);
      });
    }
  });

  describe('# revisions', () => {
    it('PUT /v1/revisions/:revisionId (revert an area range) → areas', async () => {
      await seedTable('chronas-revisions', [{
        _id: 'rev-areas', entityId: 'MANY', type: 'UPDATE', resource: 'areas', user: 'editor', reverted: false,
        prevBody: JSON.stringify({ '1000-1001': { Kiev: [undefined, undefined, 'pagan'] } }),
        nextBody: JSON.stringify({ '1000-1001': { Kiev: [undefined, undefined, 'orthodox'] } }),
        timestamp: new Date().toISOString()
      }]);
      const res = await request(app).put('/v1/revisions/rev-areas').set('Authorization', `Bearer ${EDITOR}`).send({});
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['areas'] })).to.deep.equal(['areas']);
    });

    it('PUT /v1/revisions/:revisionId (revert a marker creation) → markers, metadata', async () => {
      await seedTable('chronas-revisions', [{
        _id: 'rev-marker', entityId: 'Battle_of_Hastings', type: 'CREATE', resource: 'markers', user: 'editor', reverted: false,
        nextBody: JSON.stringify({ wiki: 'Battle_of_Hastings' }), timestamp: new Date().toISOString()
      }]);
      const res = await request(app).put('/v1/revisions/rev-marker').set('Authorization', `Bearer ${EDITOR}`).send({});
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['markers', 'metadata'] })).to.deep.equal(['markers', 'metadata']);
    });

    it('PUT /v1/revisions/:revisionId (revert a dictionary entry) → metadata', async () => {
      await seedTable('chronas-revisions', [{
        _id: 'rev-single', entityId: 'culture', subEntityId: 'slavic', type: 'UPDATE', resource: 'metadata', user: 'editor', reverted: false,
        prevBody: JSON.stringify(['Slavs', 'rgb(0,200,0)', 'Slavs', '']), nextBody: JSON.stringify(['Slavic', 'rgb(0,255,0)', 'Slavs', '']),
        timestamp: new Date().toISOString()
      }]);
      const res = await request(app).put('/v1/revisions/rev-single').set('Authorization', `Bearer ${EDITOR}`).send({});
      expect(res.status).to.equal(200);
      expect(await marked({ expect: ['metadata'] })).to.deep.equal(['metadata']);
    });

    it('DELETE /v1/revisions/:revisionId deletes only the revision and marks nothing', async () => {
      await seedTable('chronas-revisions', [{
        _id: 'rev-delete', entityId: 'Battle_of_Hastings', type: 'CREATE', resource: 'markers', user: 'editor', reverted: false,
        nextBody: JSON.stringify({ wiki: 'Battle_of_Hastings' }), timestamp: new Date().toISOString()
      }]);
      const res = await request(app).delete('/v1/revisions/rev-delete').set('Authorization', `Bearer ${ADMIN}`);
      expect(res.status).to.equal(200);
      expect(await marked()).to.deep.equal([]);
    });
  });
});
