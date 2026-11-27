import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { setupDynamoLocal, clearTable, seedTable } from '../helpers/dynamodb-local.js';
import { useSchedulerForTests } from '../../helpers/edge-invalidation.js';
import MetadataDynamo, { metadataCache } from '../../models/dynamo/metadata.dynamo.js';
import RevisionDynamo from '../../models/dynamo/revision.dynamo.js';

/**
 * #164: PUT /v1/metadata/:id on a document as large as `provinces` (about
 * 740 KB of GeoJSON) answered 500 and saved nothing, because the revision
 * written first carried the changed `data` twice and exceeded DynamoDB's
 * 400 KB item limit. The revision now gzips large bodies.
 */

const SECRET = process.env.JWT_SECRET || 'test-secret-key';
const ADMIN = jwt.sign({ id: 'admin@chronas.org', username: 'admin', privilege: 5 }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });

function provinces(shift) {
  const features = [];
  for (let i = 0; features.length * 150 < 740 * 1024; i++) {
    features.push({
      type: 'Feature',
      properties: { name: `Province ${i}` },
      geometry: { type: 'Point', coordinates: [(i + shift) % 180, i % 90] }
    });
  }
  return { type: 'FeatureCollection', features };
}

describe('## PUT /v1/metadata/:id with a large document (#164)', function () {
  this.timeout(30000);
  let app;
  let previous;

  before(async () => {
    await setupDynamoLocal();
    app = (await import('../../../config/express.js')).default;
    previous = useSchedulerForTests({
      markDirty: () => {}, markDirtyDeferred: () => {}, flush: async () => {}, active: () => true
    });
  });

  after(() => {
    useSchedulerForTests(previous);
  });

  beforeEach(async () => {
    metadataCache.clear();
    await clearTable('chronas-metadata');
    await clearTable('chronas-revisions');
    await clearTable('chronas-users');
    await seedTable('chronas-users', [
      { _id: 'admin@chronas.org', email: 'admin@chronas.org', username: 'admin', privilege: 5 }
    ]);
    // Through the model, so the seed is gzipped like the production item.
    await new MetadataDynamo({ _id: 'provinces', type: 'g', data: provinces(0) }).save();
  });

  it('saves the document and its revision', async () => {
    const next = provinces(1);
    const res = await request(app).put('/v1/metadata/provinces').set('Authorization', `Bearer ${ADMIN}`)
      .send({ _id: 'provinces', data: next });
    expect(res.status).to.equal(200);

    metadataCache.clear();
    const stored = await MetadataDynamo.findById('provinces').exec();
    expect(stored.data).to.deep.equal(next);

    const revision = await RevisionDynamo.findOne({ entityId: 'provinces' }).exec();
    expect(revision.type).to.equal('UPDATE');
    expect(revision.resource).to.equal('metadata');
    expect(JSON.parse(revision.nextBody).data).to.deep.equal(next);
    expect(JSON.parse(revision.prevBody).data).to.deep.equal(provinces(0));
  });
});
