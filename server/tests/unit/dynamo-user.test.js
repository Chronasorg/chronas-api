import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/users-sample.json');
const TABLE = 'chronas-users';

let UserDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  const mod = await import('../../models/dynamo/user.dynamo.js');
  UserDynamo = mod.default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('UserDynamo (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('.findById()', () => {
    it('returns user by email ID', async () => {
      const user = await UserDynamo.findById('admin@chronas.org');
      expect(user).to.not.be.null;
      expect(user.username).to.equal('admin');
      expect(user.privilege).to.equal(5);
    });

    it('returns null for non-existent user', async () => {
      const user = await UserDynamo.findById('nobody@nowhere.com');
      expect(user).to.be.null;
    });
  });

  describe('.get()', () => {
    it('returns user for valid id', async () => {
      const user = await UserDynamo.get('testuser@test.de');
      expect(user.username).to.equal('testUser');
    });

    it('throws for missing user', async () => {
      try {
        await UserDynamo.get('nonexistent@test.com');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/not found/i);
      }
    });
  });

  describe('.findOne()', () => {
    it('finds by email', async () => {
      const user = await UserDynamo.findOne({ email: 'editor@chronas.org' });
      expect(user).to.not.be.null;
      expect(user.username).to.equal('editor');
    });

    it('finds by username via GSI', async () => {
      const user = await UserDynamo.findOne({ username: 'googleUser' });
      expect(user).to.not.be.null;
      expect(user._id).to.equal('oauth@gmail.com');
    });

    it('returns null for non-existent username', async () => {
      const user = await UserDynamo.findOne({ username: 'nobody' });
      expect(user).to.be.null;
    });

    it('supports .select("+password").exec() chain (auth login pattern)', async () => {
      const user = await UserDynamo.findOne({ email: 'admin@chronas.org' })
        .select('+password')
        .exec();
      expect(user).to.not.be.null;
      expect(user.username).to.equal('admin');
      expect(user.password).to.be.a('string');
      const match = await user.comparePassword('test123');
      expect(match).to.equal(true);
    });
  });

  describe('.findByEmail()', () => {
    it('finds by email (lowercased)', async () => {
      const user = await UserDynamo.findByEmail('Admin@Chronas.org');
      expect(user).to.not.be.null;
      expect(user.username).to.equal('admin');
    });
  });

  describe('.list()', () => {
    it('returns users sorted by karma desc', async () => {
      const users = await UserDynamo.list({ limit: 5 });
      expect(users).to.have.lengthOf(5);
      for (let i = 1; i < users.length; i++) {
        expect(users[i - 1].karma).to.be.at.least(users[i].karma);
      }
    });

    it('respects limit', async () => {
      const users = await UserDynamo.list({ limit: 2 });
      expect(users).to.have.lengthOf(2);
    });
  });

  describe('.aggregate().exec() chain (statistics pattern)', () => {
    it('groups by authType via .exec()', async () => {
      const result = await UserDynamo.aggregate([{ $group: { _id: '$authType', count: { $sum: 1 } } }]).exec();
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('.comparePassword()', () => {
    it('returns true for correct password', async () => {
      const user = await UserDynamo.findById('admin@chronas.org');
      const match = await user.comparePassword('test123');
      expect(match).to.equal(true);
    });

    it('returns false for wrong password', async () => {
      const user = await UserDynamo.findById('admin@chronas.org');
      const match = await user.comparePassword('wrongpassword');
      expect(match).to.equal(false);
    });

    it('throws when no password set (OAuth user)', async () => {
      const user = await UserDynamo.findById('oauth@gmail.com');
      try {
        await user.comparePassword('anything');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.match(/no password/i);
      }
    });
  });

  describe('new UserDynamo().save()', () => {
    it('creates a new user', async () => {
      const u = new UserDynamo({
        _id: 'new@test.com', username: 'newuser', email: 'new@test.com',
        privilege: 1, karma: 0
      });
      await u.save();
      const fetched = await UserDynamo.findById('new@test.com');
      expect(fetched.username).to.equal('newuser');
    });
  });

  describe('.countDocuments().exec()', () => {
    it('returns count via .exec() chain', async () => {
      const count = await UserDynamo.countDocuments().exec();
      expect(count).to.equal(fixtures.length);
    });
  });

  describe('.deleteOne()', () => {
    it('removes a user', async () => {
      const user = await UserDynamo.findById('newbie@test.com');
      await user.deleteOne();
      expect(await UserDynamo.findById('newbie@test.com')).to.be.null;
    });
  });
});
