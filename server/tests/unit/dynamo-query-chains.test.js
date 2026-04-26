import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let MarkerDynamo, MetadataDynamo, AreaDynamo, FlagDynamo, UserDynamo, RevisionDynamo, ForumDynamo, OpinionDynamo;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();

  const markers = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/markers-sample.json'), 'utf8'));
  const metadata = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/metadata-sample.json'), 'utf8'));
  const areas = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/areas-sample.json'), 'utf8'));
  const flags = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/flags-sample.json'), 'utf8'));
  const users = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/users-sample.json'), 'utf8'));
  const revisions = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/revisions-sample.json'), 'utf8'));
  const board = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/board-sample.json'), 'utf8'));

  await seedTable('chronas-markers', markers);
  await seedTable('chronas-metadata', metadata);
  await seedTable('chronas-areas', areas);
  await seedTable('chronas-flags', flags);
  await seedTable('chronas-users', users);
  await seedTable('chronas-revisions', revisions);
  await seedTable('chronas-board', board);

  MarkerDynamo = (await import('../../models/dynamo/marker.dynamo.js')).default;
  MetadataDynamo = (await import('../../models/dynamo/metadata.dynamo.js')).default;
  AreaDynamo = (await import('../../models/dynamo/area.dynamo.js')).default;
  FlagDynamo = (await import('../../models/dynamo/flag.dynamo.js')).default;
  UserDynamo = (await import('../../models/dynamo/user.dynamo.js')).default;
  RevisionDynamo = (await import('../../models/dynamo/revision.dynamo.js')).default;
  ForumDynamo = (await import('../../boardComponent/entities/forum/model.dynamo.js')).default;
  OpinionDynamo = (await import('../../boardComponent/entities/opinion/model.dynamo.js')).default;
});

after(async () => {
  await teardownDynamoLocal();
});

describe('QueryProxy chain patterns (matches exact controller call sites)', () => {

  describe('Marker.findById(id).lean().exec().then() — marker.controller:40', () => {
    it('returns plain object via lean chain', async () => {
      const marker = await MarkerDynamo.findById('Battle_of_Hastings').lean().exec();
      expect(marker).to.not.be.null;
      expect(marker.name).to.equal('Battle of Hastings');
    });

    it('returns null for missing marker', async () => {
      const marker = await MarkerDynamo.findById('nonexistent').lean().exec();
      expect(marker).to.be.null;
    });
  });

  describe('Metadata.findById(id).exec().then() — metadata.controller:105', () => {
    it('returns metadata via exec chain', async () => {
      const meta = await MetadataDynamo.findById('ruler').exec();
      expect(meta).to.not.be.null;
      expect(meta.data).to.have.property('RUS');
    });
  });

  describe('Metadata.findById(id).lean().exec() — area.controller:68', () => {
    it('returns lean metadata', async () => {
      const meta = await MetadataDynamo.findById('religion').lean().exec();
      expect(meta).to.not.be.null;
      expect(meta.data).to.have.property('orthodox');
    });
  });

  describe('Area.findOne({year}).exec().then() — area.controller:438', () => {
    it('returns area via findOne exec chain', async () => {
      const area = await AreaDynamo.findOne({ year: 1000 }).exec();
      expect(area).to.not.be.null;
      expect(area.data).to.have.property('Kiev');
    });
  });

  describe('Flag.findOne({fullUrl}).then() — flag.controller:11', () => {
    it('works with .then() directly (no exec)', async () => {
      const flag = await FlagDynamo.findOne({ fullUrl: '%2Fv1%2Fmarkers%2FBattle_of_Hastings' });
      expect(flag).to.not.be.null;
      expect(flag._id).to.equal('flag-001');
    });
  });

  describe('Flag.findOne({fullUrl}).lean().exec() — flag.controller:46', () => {
    it('works with lean.exec chain', async () => {
      const flag = await FlagDynamo.findOne({ fullUrl: '%2Fv1%2Fmarkers%2FBattle_of_Hastings' }).lean().exec();
      expect(flag).to.not.be.null;
    });
  });

  describe('User.findById(id).exec() — user.controller:53', () => {
    it('returns user via exec chain', async () => {
      const user = await UserDynamo.findById('admin@chronas.org').exec();
      expect(user).to.not.be.null;
      expect(user.username).to.equal('admin');
    });
  });

  describe('User.findOne({email}).select("+password").exec() — auth.controller:21', () => {
    it('returns user with password via full auth chain', async () => {
      const user = await UserDynamo.findOne({ email: 'admin@chronas.org' }).select('+password').exec();
      expect(user).to.not.be.null;
      expect(user.password).to.be.a('string');
      const match = await user.comparePassword('test123');
      expect(match).to.equal(true);
    });
  });

  describe('User.findOne({username}).exec() — user.controller:166', () => {
    it('returns user by username via exec chain', async () => {
      const user = await UserDynamo.findOne({ username: 'admin' }).exec();
      expect(user).to.not.be.null;
      expect(user._id).to.equal('admin@chronas.org');
    });
  });

  describe('User.findOne({username}).lean().exec() — board/user/controller:40', () => {
    it('returns lean user by username', async () => {
      const user = await UserDynamo.findOne({ username: 'editor' }).lean().exec();
      expect(user).to.not.be.null;
    });
  });

  describe('User.findOne({email}) with await (no chain) — user.controller:16', () => {
    it('works with plain await', async () => {
      const user = await UserDynamo.findOne({ email: 'admin@chronas.org' });
      expect(user).to.not.be.null;
      expect(user.username).to.equal('admin');
    });
  });

  describe('Revision.findById(id).then() — revision.controller:26', () => {
    it('works with .then() directly', async () => {
      const rev = await RevisionDynamo.findById('rev-001');
      expect(rev).to.not.be.null;
      expect(rev.type).to.equal('PUT');
    });
  });

  describe('Forum.findOne({forum_slug}).exec() — forum/controller:46', () => {
    it('returns forum via exec chain', async () => {
      const forum = await ForumDynamo.findOne({ forum_slug: 'general' }).exec();
      expect(forum).to.not.be.null;
      expect(forum.forum_name).to.equal('General Discussion');
    });
  });

  describe('Opinion.findOne({_id}).exec().then() — opinion/controller:93', () => {
    it('returns opinion instance with .save()', async () => {
      const opinion = await OpinionDynamo.findOne({ _id: 'o001' }).exec();
      expect(opinion).to.not.be.null;
      expect(opinion.score).to.equal(5);
      expect(typeof opinion.save).to.equal('function');
    });
  });
});
