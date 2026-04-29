import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/dynamo/board-sample.json');
const TABLE = 'chronas-board';

let ForumDynamo, DiscussionDynamo, OpinionDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();
  ForumDynamo = (await import('../../boardComponent/entities/forum/model.dynamo.js')).default;
  DiscussionDynamo = (await import('../../boardComponent/entities/discussion/model.dynamo.js')).default;
  OpinionDynamo = (await import('../../boardComponent/entities/opinion/model.dynamo.js')).default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('Board DynamoDB Models (DynamoDB Local, real data)', () => {
  let fixtures;

  beforeEach(async function () {
    this.timeout(10000);
    fixtures = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    await clearTable(TABLE);
    await seedTable(TABLE, fixtures);
  });

  describe('ForumDynamo', () => {
    it('find() returns all forums', async () => {
      const forums = await ForumDynamo.find().exec();
      expect(forums).to.have.lengthOf(2);
      expect(forums[0].forum_slug).to.be.a('string');
    });

    it('findOne({forum_slug}) returns correct forum', async () => {
      const forum = await ForumDynamo.findOne({ forum_slug: 'general' });
      expect(forum).to.not.be.null;
      expect(forum.forum_name).to.equal('General Discussion');
    });
  });

  describe('DiscussionDynamo', () => {
    it('find({forum_id}).exec() returns filtered discussions', async () => {
      const discs = await DiscussionDynamo.find({ forum_id: 'f001' }).exec();
      expect(discs).to.have.lengthOf(2);
    });

    it('find() with populate("user") denormalizes user data', async () => {
      const discs = await DiscussionDynamo.find({ forum_id: 'f001' }).populate('user').exec();
      expect(discs[0].user).to.be.an('object');
      expect(discs[0].user.username).to.be.a('string');
    });

    it('find() with populate("forum") denormalizes forum data', async () => {
      const discs = await DiscussionDynamo.find({ forum_id: 'f001' }).populate('forum').exec();
      expect(discs[0].forum).to.be.an('object');
      expect(discs[0].forum.forum_slug).to.equal('general');
    });

    it('find({qa_id}) queries via GSI-QA', async () => {
      const discs = await DiscussionDynamo.find({ qa_id: '1:ae|ruler|KHI' }).exec();
      expect(discs).to.have.lengthOf(1);
      expect(discs[0].title).to.equal('Test Thread');
    });

    it('find().sort({date: -1}) sorts newest first', async () => {
      const discs = await DiscussionDynamo.find({ forum_id: 'f001' }).sort({ date: -1 }).exec();
      expect(new Date(discs[0].date).getTime()).to.be.greaterThan(new Date(discs[1].date).getTime());
    });

    it('countDocuments({forum_id}).exec() returns count', async () => {
      const count = await DiscussionDynamo.countDocuments({ forum_id: 'f001' }).exec();
      expect(count).to.equal(2);
    });

    it('aggregate().exec() groups by forum_id', async () => {
      const result = await DiscussionDynamo.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }]).exec();
      expect(result).to.be.an('array');
      const f001 = result.find(r => r._id === 'f001');
      expect(f001.count).to.equal(2);
    });
  });

  describe('OpinionDynamo', () => {
    it('find({discussion_id}).exec() returns opinions for discussion', async () => {
      const ops = await OpinionDynamo.find({ discussion_id: 'd001' }).exec();
      expect(ops).to.have.lengthOf(2);
    });

    it('find().sort({date: -1}) sorts newest first', async () => {
      const ops = await OpinionDynamo.find({ discussion_id: 'd001' }).sort({ date: -1 }).exec();
      expect(new Date(ops[0].date).getTime()).to.be.greaterThan(new Date(ops[1].date).getTime());
    });

    it('find().populate("user") denormalizes user', async () => {
      const ops = await OpinionDynamo.find({ discussion_id: 'd001' }).populate('user').exec();
      expect(ops[0].user).to.be.an('object');
      expect(ops[0].user.username).to.be.a('string');
    });

    it('aggregate().exec() groups by forum_id', async () => {
      const result = await OpinionDynamo.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }]).exec();
      expect(result).to.be.an('array');
      const total = result.reduce((a, r) => a + r.count, 0);
      expect(total).to.equal(3);
    });

    it('new OpinionDynamo().save() creates opinion', async () => {
      const op = new OpinionDynamo({
        discussion_id: 'd001', user_id: 'newbie@test.com',
        user_username: 'newbie', content: { text: 'New comment' }, score: 0
      });
      await op.save();
      expect(op._id).to.be.a('string');
      const fetched = await OpinionDynamo.findById(op._id);
      expect(fetched.content.text).to.equal('New comment');
    });
  });
});
