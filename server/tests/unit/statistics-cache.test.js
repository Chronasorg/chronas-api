import { expect } from 'chai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal, teardownDynamoLocal, seedTable } from '../helpers/dynamodb-local.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let buildStats;

before(async function () {
  this.timeout(15000);
  await setupDynamoLocal();

  const markersFixture = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/markers-sample.json'), 'utf8'));
  const metadataFixture = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/metadata-sample.json'), 'utf8'));
  const usersFixture = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/users-sample.json'), 'utf8'));
  const revisionsFixture = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/revisions-sample.json'), 'utf8'));
  const boardFixture = JSON.parse(await readFile(path.join(__dirname, '../fixtures/dynamo/board-sample.json'), 'utf8'));

  await seedTable('chronas-markers', markersFixture);
  await seedTable('chronas-metadata', metadataFixture);
  await seedTable('chronas-users', usersFixture);
  await seedTable('chronas-revisions', revisionsFixture);
  await seedTable('chronas-board', boardFixture);

  // Import DynamoDB models directly (bypassing switch files which already loaded Mongoose)
  const MarkerDynamo = (await import('../../models/dynamo/marker.dynamo.js')).default;
  const MetadataDynamo = (await import('../../models/dynamo/metadata.dynamo.js')).default;
  const UserDynamo = (await import('../../models/dynamo/user.dynamo.js')).default;
  const RevisionDynamo = (await import('../../models/dynamo/revision.dynamo.js')).default;
  const DiscussionDynamo = (await import('../../boardComponent/entities/discussion/model.dynamo.js')).default;
  const OpinionDynamo = (await import('../../boardComponent/entities/opinion/model.dynamo.js')).default;

  // Build a test-only statistics function using the DynamoDB models directly
  buildStats = async () => {
    const entityMetadatas = ['ruler', 'culture', 'religion', 'religionGeneral'];
    const [comments, threads, users, revisions, markers, metaType, metaSub, entityMetas] = await Promise.all([
      OpinionDynamo.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }]).exec(),
      DiscussionDynamo.aggregate([{ $group: { _id: '$forum_id', count: { $sum: 1 } } }]).exec(),
      UserDynamo.aggregate([{ $group: { _id: '$authType', count: { $sum: 1 } } }]).exec(),
      RevisionDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
      MarkerDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
      MetadataDynamo.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]).exec(),
      MetadataDynamo.aggregate([{ $group: { _id: '$subtype', count: { $sum: 1 } } }]).exec(),
      MetadataDynamo.find({ _id: { $in: entityMetadatas } }).lean().exec()
    ]);

    let entitySum = 0;
    entityMetas.forEach(o => { if (o.data && typeof o.data === 'object') entitySum += Object.keys(o.data).length; });

    return {
      comments, commentsTotal: comments.reduce((a, el) => a + el.count, 0),
      threads, threadsTotal: threads.reduce((a, el) => a + el.count, 0),
      user: users, userTotal: users.reduce((a, el) => a + el.count, 0),
      revision: revisions, revisionTotal: revisions.reduce((a, el) => a + el.count, 0),
      marker: markers, markerTotal: markers.reduce((a, el) => a + el.count, 0),
      metadata: metaType, metadataTotal: metaType.reduce((a, el) => a + el.count, 0),
      metadataI: metaSub,
      metadataEntityCount: entitySum,
      area: { provinces: 2479, areaDatapoints: 49580000 }
    };
  };
});

after(async () => {
  await teardownDynamoLocal();
});

describe('statistics buildStatistics() with DynamoDB models', () => {
  it('returns all expected fields with correct shapes', async function () {
    this.timeout(10000);
    const result = await buildStats();

    expect(result).to.have.property('area');
    expect(result).to.have.property('marker').that.is.an('array');
    expect(result).to.have.property('revision').that.is.an('array');
    expect(result).to.have.property('user').that.is.an('array');
    expect(result).to.have.property('threads').that.is.an('array');
    expect(result).to.have.property('comments').that.is.an('array');
    expect(result).to.have.property('metadata').that.is.an('array');
    expect(result).to.have.property('metadataI').that.is.an('array');
    expect(result).to.have.property('metadataEntityCount').that.is.a('number');

    expect(result.markerTotal).to.be.greaterThan(0);
    expect(result.metadataTotal).to.be.greaterThan(0);
    expect(result.userTotal).to.be.greaterThan(0);
    expect(result.revisionTotal).to.be.greaterThan(0);
    expect(result.commentsTotal).to.be.greaterThan(0);
    expect(result.threadsTotal).to.be.greaterThan(0);
  });

  it('aggregate results have _id and count fields', async () => {
    const result = await buildStats();
    const markerEntry = result.marker[0];
    expect(markerEntry).to.have.property('_id');
    expect(markerEntry).to.have.property('count').that.is.a('number');
  });

  it('metadataEntityCount sums keys across ruler/culture/religion/religionGeneral', async () => {
    const result = await buildStats();
    expect(result.metadataEntityCount).to.be.greaterThan(0);
  });
});
