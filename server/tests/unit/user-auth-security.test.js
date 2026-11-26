import { describe, it, before, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { getDocClient } from '../../models/dynamo/dynamo-client.js';

/**
 * Account and permission rules for /v1/auth, the retired account APIs, and
 * writes. Each case below is a request an attacker could send; all must be
 * refused. Since 2026-11-26 every authenticated route is for admins only and
 * needs a token that expires.
 */

const SECRET = process.env.JWT_SECRET || 'test-secret-key';
const PASSWORDS = { admin: 'admin-pass', alice: 'alice-pass', bob: 'bob-pass', editor: 'editor-pass' };

function token(id, privilege, extra = {}, options = { expiresIn: '1h' }) {
  return jwt.sign({ id, username: id.split('@')[0], privilege, ...extra }, SECRET, { algorithm: 'HS256', ...options });
}

function claims(jwtString) {
  return jwt.verify(jwtString, SECRET);
}

async function getUser(id) {
  const { Item } = await getDocClient().send(new GetCommand({ TableName: 'chronas-users', Key: { _id: id } }));
  return Item;
}

async function getMetadata(id) {
  const { Item } = await getDocClient().send(new GetCommand({ TableName: 'chronas-metadata', Key: { _id: id } }));
  return Item;
}

describe('## User and auth route security', () => {
  let app;
  let UserDynamo;
  let isPasswordHash;

  const ADMIN = token('admin@chronas.org', 5);
  const ALICE = token('alice@example.com', 1);
  const ADMIN_FOREVER = token('admin@chronas.org', 5, {}, {});
  const EDITOR = token('editor@chronas.org', 3);

  before(async function () {
    this.timeout(30000);
    await setupDynamoLocal();
    app = (await import('../helpers/test-app.js')).default;
    const userModule = await import('../../models/dynamo/user.dynamo.js');
    UserDynamo = userModule.default;
    ({ isPasswordHash } = userModule);
  });

  beforeEach(async function () {
    this.timeout(15000);
    const hash = pw => bcrypt.hash(pw, 4);
    await clearTable('chronas-users');
    await seedTable('chronas-users', [
      { _id: 'admin@chronas.org', email: 'admin@chronas.org', username: 'admin', privilege: 5, karma: 10, loginCount: 0, password: await hash(PASSWORDS.admin) },
      { _id: 'alice@example.com', email: 'alice@example.com', username: 'alice', privilege: 1, karma: 3, loginCount: 0, password: await hash(PASSWORDS.alice) },
      { _id: 'bob@example.com', email: 'bob@example.com', username: 'bob', privilege: 1, karma: 0, loginCount: 0, password: await hash(PASSWORDS.bob) },
      { _id: 'editor@chronas.org', email: 'editor@chronas.org', username: 'editor', privilege: 3, karma: 0, loginCount: 0, password: await hash(PASSWORDS.editor) }
    ]);
    await clearTable('chronas-metadata');
    await seedTable('chronas-metadata', [
      { _id: 'ruler', type: 'g', data: { ENG: ['Kingdom of England', 'rgb(181,0,51)', 'Kingdom_of_England', ''] } },
      { _id: 'e_Some_Event', type: 'e', data: { title: 'Some event' } }
    ]);
  });

  describe('retired account APIs', () => {
    it('signup answers 410 and creates no account', async () => {
      for (const path of ['/v1/auth/signup', '/v1/auth/SIGNUP', '/v1/auth/signup/']) {
        const res = await request(app).post(path)
          .send({ email: 'mallory@example.com', password: 'x', username: 'mallory', privilege: 5 });
        expect(res.status, path).to.equal(410);
        expect(res.body.token, path).to.equal(undefined);
      }
      expect(await getUser('mallory@example.com')).to.equal(undefined);
    });

    it('token refresh answers 410, even for an admin token', async () => {
      const res = await request(app).post('/v1/auth/refresh').set('Authorization', `Bearer ${ADMIN}`);
      expect(res.status).to.equal(410);
      expect(res.body.token).to.equal(undefined);
    });

    it('every /v1/users route answers 410 and changes nothing, even for an admin', async () => {
      const before = await getUser('bob@example.com');
      const admin = { Authorization: `Bearer ${ADMIN}` };
      const calls = [
        request(app).post('/v1/users').send({ email: 'evil@example.com', password: 'x', privilege: 5 }),
        request(app).get('/v1/users/highscore?top=-1').set(admin),
        request(app).get('/v1/users/sustainers').set(admin),
        request(app).get('/v1/USERS/bob@example.com').set(admin),
        request(app).put('/v1/users/bob@example.com').set(admin).send({ password: 'pwned' }),
        request(app).delete('/v1/users/bob@example.com').set(admin)
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status, `${res.req.method} ${res.req.path}`).to.equal(410);
        expect(res.body).to.not.have.property('email');
      }
      expect(await getUser('bob@example.com')).to.deep.equal(before);
      expect(await getUser('evil@example.com')).to.equal(undefined);
    });
  });

  describe('login', () => {
    it('issues a token that expires in 12 hours, with the stored privilege', async () => {
      const res = await request(app).post('/v1/auth/login')
        .send({ email: 'alice@example.com', password: PASSWORDS.alice });
      expect(res.status).to.equal(200);
      const { exp, iat, privilege } = claims(res.body.token);
      expect(exp - iat).to.equal(12 * 60 * 60);
      expect(privilege).to.equal(1);
      expect((await getUser('alice@example.com')).loginCount).to.equal(1);
    });

    it('login for an account without a password looks like a wrong password', async () => {
      await new UserDynamo({ _id: 'nopass@example.com', email: 'nopass@example.com', authType: 'google' }).save();
      const noPassword = await request(app).post('/v1/auth/login').send({ email: 'nopass@example.com', password: 'guess-123' });
      const wrongPassword = await request(app).post('/v1/auth/login').send({ email: 'alice@example.com', password: 'guess-123' });
      const noAccount = await request(app).post('/v1/auth/login').send({ email: 'nobody@example.com', password: 'guess-123' });
      expect(noPassword.status).to.equal(401);
      for (const res of [noPassword, noAccount]) {
        expect(res.status).to.equal(wrongPassword.status);
        expect(res.body.message).to.equal(wrongPassword.body.message);
      }
    });
  });

  describe('tokens', () => {
    it('a token without an expiry is refused, even an admin token', async () => {
      const res = await request(app).put('/v1/metadata/ruler').set('Authorization', `Bearer ${ADMIN_FOREVER}`)
        .send({ data: {} });
      expect(res.status).to.equal(401);
      expect(res.body.message).to.equal('Token expired, log in again.');
      expect((await getMetadata('ruler')).data).to.have.property('ENG');
    });

    it('an expired token is refused', async () => {
      const expired = token('admin@chronas.org', 5, { exp: Math.floor(Date.now() / 1000) - 60 }, {});
      const res = await request(app).put('/v1/metadata/ruler').set('Authorization', `Bearer ${expired}`)
        .send({ data: {} });
      expect(res.status).to.equal(401);
      expect((await getMetadata('ruler')).data).to.have.property('ENG');
    });

    it('a token signed with another secret is refused', async () => {
      const forged = jwt.sign({ id: 'admin@chronas.org', username: 'admin', privilege: 5 }, 'not-the-secret', { algorithm: 'HS256', expiresIn: '1h' });
      expect((await request(app).put('/v1/metadata/ruler').set('Authorization', `Bearer ${forged}`).send({ data: {} })).status).to.equal(401);
    });
  });

  describe('UserDynamo.save()', () => {
    it('refuses to store a plaintext password', async () => {
      const user = new UserDynamo({ _id: 'plain@example.com', email: 'plain@example.com', password: 'plaintext' });
      let error;
      try { await user.save(); } catch (e) { error = e; }
      expect(error).to.be.instanceOf(Error);
      expect(await getUser('plain@example.com')).to.equal(undefined);
    });

    it('stores passwords set through setPassword() and accounts without a password', async () => {
      const user = new UserDynamo({ _id: 'hashed@example.com', email: 'hashed@example.com' });
      await user.setPassword('hashed-pass-1');
      await user.save();
      expect(isPasswordHash((await getUser('hashed@example.com')).password)).to.equal(true);

      await new UserDynamo({ _id: 'oauth@example.com', email: 'oauth@example.com', authType: 'google' }).save();
      expect(await getUser('oauth@example.com')).to.not.equal(undefined);
    });
  });

  describe('social logins', () => {
    it('are retired: every provider route answers 410 without redirecting', async () => {
      for (const path of ['/v1/auth/login/google', '/v1/auth/login/google?code=abc', '/v1/auth/login/facebook', '/v1/auth/login/github', '/v1/auth/login/twitter', '/v1/auth/login/GOOGLE']) {
        const res = await request(app).get(path);
        expect(res.status, path).to.equal(410);
        expect(res.headers.location, path).to.equal(undefined);
      }
    });
  });

  describe('writes are for admins only', () => {
    const SINGLE = { subEntityId: 'POW', nextBody: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', ''] };
    const auth = jwtString => ({ Authorization: `Bearer ${jwtString}` });
    const SUBSCRIBER = token('alice@example.com', 1, { subscription: 'patreon' });

    it('privilege 3, a subscriber and privilege 1 cannot write metadata', async () => {
      for (const who of [EDITOR, SUBSCRIBER, ALICE]) {
        expect((await request(app).delete('/v1/metadata/ruler').set(auth(who))).status).to.equal(401);
        expect((await request(app).put('/v1/metadata/ruler').set(auth(who)).send({ data: {} })).status).to.equal(401);
        expect((await request(app).put('/v1/metadata/ruler/single').set(auth(who)).send(SINGLE)).status).to.equal(401);
        expect((await request(app).post('/v1/metadata').set(auth(who))
          .send({ _id: 'ruler', parentId: 'ENG', childId: '4', childValue: 'injected' })).status).to.equal(401);
        expect((await request(app).put('/v1/metadata/e_Some_Event').set(auth(who)).send({ type: 'g' })).status).to.equal(401);
      }
      const ruler = await getMetadata('ruler');
      expect(ruler.data.ENG).to.have.length(4);
      expect(ruler.data).to.not.have.property('POW');
      expect((await getMetadata('e_Some_Event')).type).to.equal('e');
    });

    it('privilege 3 and a subscriber cannot write areas or markers', async () => {
      for (const who of [EDITOR, SUBSCRIBER]) {
        expect((await request(app).put('/v1/areas').set(auth(who)).send({ start: 1000, end: 1000, provinces: ['Kiev'], ruler: 'X' })).status).to.equal(401);
        expect((await request(app).post('/v1/markers').set(auth(who)).send({ _id: 'x', name: 'x', type: 'c', coo: [0, 0], year: 1 })).status).to.equal(401);
      }
    });

    it('a PUT cannot move a document onto another id', async () => {
      const res = await request(app).put('/v1/metadata/e_Some_Event').set(auth(ADMIN))
        .send({ _id: 'ruler', type: 'e', data: { x: 1 } });
      expect(res.status).to.equal(400);
      const ruler = await getMetadata('ruler');
      expect(ruler.type).to.equal('g');
      expect(ruler.data).to.have.property('ENG');
    });

    it('admins can change single entries, the dictionary editing workflow', async () => {
      const res = await request(app).put('/v1/metadata/ruler/single').set(auth(ADMIN)).send(SINGLE);
      expect(res.status).to.not.equal(401);
      expect((await getMetadata('ruler')).data).to.have.property('POW');
    });

    it('admins can replace a type g document', async () => {
      const res = await request(app).put('/v1/metadata/ruler').set(auth(ADMIN))
        .send({ data: { ENG: ['England', 'rgb(1,2,3)', 'England', ''] } });
      expect(res.status).to.equal(200);
      expect((await getMetadata('ruler')).data.ENG[0]).to.equal('England');
    });

    it('votes answer 410 and change no score', async () => {
      for (const path of ['/v1/metadata/e_Some_Event/upvote', '/v1/metadata/e_Some_Event/downvote', '/v1/metadata/e_Some_Event/UPVOTE/']) {
        expect((await request(app).put(path).set(auth(ADMIN))).status, path).to.equal(410);
      }
      expect((await request(app).put('/v1/metadata/e_Some_Event/upvote')).status).to.equal(410);
      expect((await getMetadata('e_Some_Event')).score).to.equal(undefined);
    });
  });
});
