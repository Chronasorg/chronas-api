import { describe, it, before, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { getDocClient } from '../../models/dynamo/dynamo-client.js';

/**
 * Account and permission rules for /v1/users, /v1/auth and type-g metadata.
 * Each case below is a request an attacker could send; all must be refused.
 */

const SECRET = process.env.JWT_SECRET || 'test-secret-key';
const PASSWORDS = { admin: 'admin-pass', alice: 'alice-pass', bob: 'bob-pass', editor: 'editor-pass' };

function token(id, privilege, extra = {}) {
  return jwt.sign({ id, username: id.split('@')[0], privilege, ...extra }, SECRET, { algorithm: 'HS256' });
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

  describe('account creation', () => {
    it('POST /v1/users is gone, in any letter case or with a trailing slash', async () => {
      for (const path of ['/v1/users', '/v1/users/', '/v1/USERS']) {
        const res = await request(app).post(path)
          .send({ username: 'evil', email: 'evil@example.com', password: 'x', privilege: 5, signup: true });
        expect(res.status, path).to.equal(404);
        expect(res.body.token, path).to.equal(undefined);
      }
      expect(await getUser('evil@example.com')).to.equal(undefined);
    });

    it('POST /v1/users with thirdParty never logs in as an existing user', async () => {
      const res = await request(app).post('/v1/users')
        .send({ username: 'x', email: 'alice@example.com', thirdParty: true });
      expect(res.status).to.equal(404);
      expect(res.headers.location).to.equal(undefined);
    });

    it('signup rejects privilege and thirdParty in the body', async () => {
      const base = { email: 'mallory@example.com', password: 'pw-123456', username: 'mallory' };
      expect((await request(app).post('/v1/auth/signup').send({ ...base, privilege: 5 })).status).to.equal(400);
      expect((await request(app).post('/v1/auth/signup').send({ ...base, thirdParty: true })).status).to.equal(400);
      expect(await getUser('mallory@example.com')).to.equal(undefined);
    });

    it('signup stores a bcrypt hash, issues a privilege-1 token, and the password logs in', async () => {
      const signup = await request(app).post('/v1/auth/signup')
        .send({ email: 'Carol@Example.com', password: 'carol-pass-1', username: 'carol' });
      expect(signup.status).to.equal(200);
      expect(claims(signup.body.token).privilege).to.equal(1);

      const stored = await getUser('carol@example.com');
      expect(isPasswordHash(stored.password)).to.equal(true);
      expect(stored.privilege).to.equal(1);
      expect(stored.loginCount).to.equal(1);
      expect(stored.subscription).to.equal('-1');

      const login = await request(app).post('/v1/auth/login')
        .send({ email: 'carol@example.com', password: 'carol-pass-1' });
      expect(login.status).to.equal(200);
    });

    it('login for an account without a password looks like a wrong password', async () => {
      await new UserDynamo({ _id: 'nopass@example.com', email: 'nopass@example.com', authType: 'google' }).save();
      const noPassword = await request(app).post('/v1/auth/login').send({ email: 'nopass@example.com', password: 'guess-123' });
      const wrongPassword = await request(app).post('/v1/auth/login').send({ email: 'alice@example.com', password: 'guess-123' });
      expect(noPassword.status).to.equal(401);
      expect(noPassword.status).to.equal(wrongPassword.status);
      expect(noPassword.body.message).to.equal(wrongPassword.body.message);
    });

    it('signup refuses an email that already has an account', async () => {
      const res = await request(app).post('/v1/auth/signup')
        .send({ email: 'alice@example.com', password: 'other-pass', username: 'alice2' });
      expect(res.status).to.equal(400);
      expect(await bcrypt.compare(PASSWORDS.alice, (await getUser('alice@example.com')).password)).to.equal(true);
    });
  });

  describe('other users\' accounts', () => {
    it('a user cannot read, change or delete another user', async () => {
      const before = await getUser('bob@example.com');
      const auth = { Authorization: `Bearer ${ALICE}` };

      expect((await request(app).get('/v1/users/bob@example.com').set(auth)).status).to.equal(401);
      expect((await request(app).get('/v1/USERS/BOB@example.com').set(auth)).status).to.equal(401);
      expect((await request(app).put('/v1/users/bob@example.com').set(auth).send({ password: 'pwned' })).status).to.equal(401);
      expect((await request(app).put('/v1/users/bob@example.com').set(auth).send({ username: 'pwned' })).status).to.equal(401);
      expect((await request(app).delete('/v1/users/bob@example.com').set(auth)).status).to.equal(401);

      expect(await getUser('bob@example.com')).to.deep.equal(before);
    });

    it('asking for an unknown email looks the same as asking for someone else', async () => {
      const auth = { Authorization: `Bearer ${ALICE}` };
      const known = await request(app).get('/v1/users/bob@example.com').set(auth);
      const unknown = await request(app).get('/v1/users/nobody@example.com').set(auth);
      expect(unknown.status).to.equal(known.status);
    });

    it('requests without a token are refused before the user is looked up', async () => {
      expect((await request(app).get('/v1/users/bob@example.com')).status).to.equal(401);
      expect((await request(app).get('/v1/users/nobody@example.com')).status).to.equal(401);
    });
  });

  describe('own account', () => {
    it('GET returns the profile without the password', async () => {
      const res = await request(app).get('/v1/users/alice@example.com').set('Authorization', `Bearer ${ALICE}`);
      expect(res.status).to.equal(200);
      expect(res.body.email).to.equal('alice@example.com');
      expect(res.body.id).to.equal('alice@example.com');
      expect(res.body).to.not.have.property('password');
    });

    it('owners cannot grant themselves subscription, privilege, karma or a new email', async () => {
      const res = await request(app).put('/v1/users/alice@example.com')
        .set('Authorization', `Bearer ${ALICE}`)
        .send({ subscription: 'patreon', patreon: 1, privilege: 5, karma: 999, email: 'admin@chronas.org', username: 'alice2' });
      expect(res.status).to.equal(200);
      expect(res.body).to.not.have.property('password');

      const stored = await getUser('alice@example.com');
      expect(stored.username).to.equal('alice2');
      expect(stored.privilege).to.equal(1);
      expect(stored.karma).to.equal(3);
      expect(stored.email).to.equal('alice@example.com');
      expect(stored).to.not.have.property('subscription');
      expect(stored).to.not.have.property('patreon');
    });

    it('changing your own password needs the current one', async () => {
      const auth = { Authorization: `Bearer ${ALICE}` };
      const url = '/v1/users/alice@example.com';
      expect((await request(app).put(url).set(auth).send({ password: 'new-pass-1' })).status).to.equal(401);
      expect((await request(app).put(url).set(auth).send({ password: 'new-pass-1', currentPassword: 'wrong' })).status).to.equal(401);
      expect((await request(app).put(url).set(auth).send({ password: 'new-pass-1', currentPassword: PASSWORDS.alice })).status).to.equal(200);

      expect(isPasswordHash((await getUser('alice@example.com')).password)).to.equal(true);
      expect((await request(app).post('/v1/auth/login').send({ email: 'alice@example.com', password: 'new-pass-1' })).status).to.equal(200);
      expect((await request(app).post('/v1/auth/login').send({ email: 'alice@example.com', password: PASSWORDS.alice })).status).to.equal(401);
    });
  });

  describe('admins', () => {
    it('can change another user\'s privilege and password, and delete them', async () => {
      const auth = { Authorization: `Bearer ${ADMIN}` };
      const put = await request(app).put('/v1/users/bob@example.com').set(auth).send({ privilege: 3, password: 'reset-pass-1' });
      expect(put.status).to.equal(200);
      const stored = await getUser('bob@example.com');
      expect(stored.privilege).to.equal(3);
      expect(await bcrypt.compare('reset-pass-1', stored.password)).to.equal(true);

      const del = await request(app).delete('/v1/users/bob@example.com').set(auth);
      expect(del.status).to.equal(200);
      expect(del.body).to.not.have.property('password');
      expect(await getUser('bob@example.com')).to.equal(undefined);
    });

    it('a subscription claim alone does not make someone an admin of user accounts', async () => {
      const subscriber = token('alice@example.com', 1, { subscription: 'patreon' });
      const res = await request(app).put('/v1/users/bob@example.com').set('Authorization', `Bearer ${subscriber}`).send({ username: 'x' });
      expect(res.status).to.equal(401);
    });
  });

  describe('token refresh', () => {
    it('issues the privilege stored in the database, not the one in the old token', async () => {
      const inflated = token('alice@example.com', 5, { subscription: 'patreon' });
      const res = await request(app).post('/v1/auth/refresh').set('Authorization', `Bearer ${inflated}`);
      expect(res.status).to.equal(200);
      expect(claims(res.body.token).privilege).to.equal(1);
      expect(claims(res.body.token).subscription).to.equal('-1');
    });

    it('refuses tokens of deleted users', async () => {
      const ghost = token('ghost@example.com', 5);
      expect((await request(app).post('/v1/auth/refresh').set('Authorization', `Bearer ${ghost}`)).status).to.equal(401);
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

  describe('type g metadata', () => {
    const SINGLE = { subEntityId: 'POW', nextBody: ['Powhatan', 'rgb(150,150,150)', 'Powhatan', ''] };
    const EDITOR_AUTH = () => ({ Authorization: `Bearer ${EDITOR}` });

    it('privilege 3 cannot delete or replace a type g document, even without a type in the body', async () => {
      expect((await request(app).delete('/v1/metadata/ruler').set(EDITOR_AUTH())).status).to.equal(401);
      expect((await request(app).put('/v1/metadata/ruler').set(EDITOR_AUTH()).send({ data: {} })).status).to.equal(401);
      expect((await request(app).put('/v1/metadata/ruler').set(EDITOR_AUTH()).send({ type: 'e', data: {} })).status).to.equal(401);

      const stored = await getMetadata('ruler');
      expect(stored.type).to.equal('g');
      expect(stored.data).to.have.property('ENG');
    });

    it('a PUT cannot move a document onto another id', async () => {
      const res = await request(app).put('/v1/metadata/e_Some_Event').set(EDITOR_AUTH())
        .send({ _id: 'ruler', type: 'e', data: { x: 1 } });
      expect(res.status).to.equal(400);
      const ruler = await getMetadata('ruler');
      expect(ruler.type).to.equal('g');
      expect(ruler.data).to.have.property('ENG');
    });

    it('only admins can change the type of a document', async () => {
      expect((await request(app).put('/v1/metadata/e_Some_Event').set(EDITOR_AUTH()).send({ type: 'g' })).status).to.equal(401);
      expect((await getMetadata('e_Some_Event')).type).to.equal('e');
    });

    it('privilege 3 cannot write into a type g document through POST', async () => {
      const res = await request(app).post('/v1/metadata').set(EDITOR_AUTH())
        .send({ _id: 'ruler', parentId: 'ENG', childId: '4', childValue: 'injected' });
      expect(res.status).to.equal(401);
      expect((await getMetadata('ruler')).data.ENG).to.have.length(4);
    });

    it('editors can still change single entries, which is the dictionary editing workflow', async () => {
      const res = await request(app).put('/v1/metadata/ruler/single').set(EDITOR_AUTH()).send(SINGLE);
      expect(res.status).to.not.equal(401);
      expect((await getMetadata('ruler')).data).to.have.property('POW');
    });

    it('privilege 5 can replace a type g document', async () => {
      const res = await request(app).put('/v1/metadata/ruler').set('Authorization', `Bearer ${ADMIN}`)
        .send({ data: { ENG: ['England', 'rgb(1,2,3)', 'England', ''] } });
      expect(res.status).to.equal(200);
      expect((await getMetadata('ruler')).data.ENG[0]).to.equal('England');
    });
  });

  describe('profile field validation', () => {
    it('rejects non-string profile fields', async () => {
      const res = await request(app).put('/v1/users/alice@example.com').set('Authorization', `Bearer ${ALICE}`)
        .send({ username: { $ne: null } });
      expect(res.status).to.equal(400);
      expect((await getUser('alice@example.com')).username).to.equal('alice');
    });

    it('rejects a username that belongs to someone else', async () => {
      const res = await request(app).put('/v1/users/alice@example.com').set('Authorization', `Bearer ${ALICE}`)
        .send({ username: 'bob' });
      expect(res.status).to.equal(400);
      expect((await getUser('alice@example.com')).username).to.equal('alice');
    });

    it('admins cannot change an email, which is the account id', async () => {
      await request(app).put('/v1/users/bob@example.com').set('Authorization', `Bearer ${ADMIN}`)
        .send({ email: 'other@example.com' });
      expect((await getUser('bob@example.com')).email).to.equal('bob@example.com');
    });

    it('signup needs an email address', async () => {
      const res = await request(app).post('/v1/auth/signup').send({ email: 'google12345', password: 'pw-123456', username: 'x' });
      expect(res.status).to.equal(400);
    });
  });
});
