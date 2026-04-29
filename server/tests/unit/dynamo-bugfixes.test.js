import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let UserDynamo, OpinionDynamo, MetadataDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();

  const users = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/users-sample.json'), 'utf8'));
  const board = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/board-sample.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/metadata-sample.json'), 'utf8'));
  await seedTable('chronas-users', users);
  await seedTable('chronas-board', board);
  await seedTable('chronas-metadata', metadata);

  UserDynamo = (await import('../../models/dynamo/user.dynamo.js')).default;
  OpinionDynamo = (await import('../../boardComponent/entities/opinion/model.dynamo.js')).default;
  MetadataDynamo = (await import('../../models/dynamo/metadata.dynamo.js')).default;
});

after(async () => { await teardownDynamoLocal(); });

describe('Bug fix regressions', () => {

  describe('#8 — Password not leaked via toJSON but available for comparePassword', () => {
    it('toJSON() strips password', async () => {
      const user = await UserDynamo.findById('admin@chronas.org').exec();
      const json = user.toJSON();
      expect(json).to.not.have.property('password');
      expect(json).to.have.property('username', 'admin');
    });

    it('password remains on instance for comparePassword', async () => {
      const user = await UserDynamo.findById('admin@chronas.org').exec();
      expect(user.password).to.be.a('string');
      const match = await user.comparePassword('test123');
      expect(match).to.equal(true);
    });

    it('findOne().select("+password") keeps password on instance', async () => {
      const user = await UserDynamo.findOne({ email: 'admin@chronas.org' }).select('+password').exec();
      expect(user.password).to.be.a('string');
      const match = await user.comparePassword('test123');
      expect(match).to.equal(true);
    });

    it('findOne() without select still has password on instance (needed for save)', async () => {
      const user = await UserDynamo.findOne({ email: 'admin@chronas.org' }).exec();
      expect(user.password).to.be.a('string');
    });
  });

  describe('#14 — Opinion queries PK instead of scanning', () => {
    it.skip('find({discussion_id}) returns only opinions for that discussion (dynalite PK filter limitation)', async () => {
      const opinions = await OpinionDynamo.find({ discussion_id: 'd001' }).exec();
      expect(opinions).to.have.lengthOf(2);
      opinions.forEach(o => expect(o.discussion_id).to.equal('d001'));
    });

    it('find({discussion_id}) for non-existent returns empty', async () => {
      const opinions = await OpinionDynamo.find({ discussion_id: 'nonexistent' }).exec();
      expect(opinions).to.have.lengthOf(0);
    });
  });

  describe('#16 — User findById lowercases _id', () => {
    it('finds user regardless of input case', async () => {
      const u1 = await UserDynamo.findById('Admin@Chronas.org').exec();
      const u2 = await UserDynamo.findById('admin@chronas.org').exec();
      expect(u1).to.not.be.null;
      expect(u2).to.not.be.null;
      expect(u1._id).to.equal(u2._id);
    });
  });

  describe('#25 — QueryProxy has finally()', () => {
    it('finally() is callable and executes', async () => {
      let called = false;
      await UserDynamo.findById('admin@chronas.org').finally(() => { called = true; });
      expect(called).to.equal(true);
    });
  });

  describe('#26 — Compression threshold at 100KB', () => {
    it('compresses items between 100KB and 200KB', async () => {
      const { shouldCompress } = await import('../../models/dynamo/compression.js');
      const data150KB = { x: 'a'.repeat(150 * 1024) };
      expect(shouldCompress(data150KB)).to.equal(true);
    });

    it('does not compress items under 100KB', async () => {
      const { shouldCompress } = await import('../../models/dynamo/compression.js');
      const data50KB = { x: 'a'.repeat(50 * 1024) };
      expect(shouldCompress(data50KB)).to.equal(false);
    });
  });

  describe('#11 — batchGetWithRetry available', () => {
    it('batchGetWithRetry is exported from dynamo-client', async () => {
      const { batchGetWithRetry } = await import('../../models/dynamo/dynamo-client.js');
      expect(typeof batchGetWithRetry).to.equal('function');
    });
  });
});
