/**
 * City name history (chronas-frontend #69): the optional `names` list of a
 * city marker reaches clients and survives edits, including a wiki change
 * (which copies the marker to a new id).
 */

import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { setupDynamoLocal, seedTable, clearTable } from '../helpers/dynamodb-local.js';
import { getDocClient } from '../../models/dynamo/dynamo-client.js';

const MARKERS = 'chronas-markers';
const TOKEN = jwt.sign(
  { id: 'curator@example.com', username: 'curator', privilege: 5 },
  process.env.JWT_SECRET || 'test-secret-key',
  { algorithm: 'HS256', expiresIn: '1h' }
);
const NAMES = [[1589, 1925, 'Tsaritsyn'], [1925, 1961, 'Stalingrad'], [1961, null, 'Volgograd']];

let app;
let before_ = [];

describe('integration: city marker name history', () => {
  before(async function () {
    this.timeout(30000);
    await setupDynamoLocal();
    before_ = (await getDocClient().send(new ScanCommand({ TableName: MARKERS })).catch(() => ({}))).Items || [];
    app = (await import('../helpers/test-app.js')).default;
  });

  after(async () => {
    await clearTable(MARKERS).catch(() => {});
    if (before_.length) await seedTable(MARKERS, before_).catch(() => {});
  });

  beforeEach(async function () {
    this.timeout(15000);
    await clearTable(MARKERS).catch(() => {});
    await seedTable(MARKERS, [
      { _id: 'Volgograd', name: 'Tsaritsyn', type: 'c', year: 1589, coo: [44.483, 48.7], names: NAMES },
      { _id: 'Samara', name: 'Samara', type: 'c', year: 1586, coo: [50.15, 53.2] }
    ]);
  });

  it('lists names with the city, and leaves cities without one unchanged', async () => {
    const res = await request(app).get('/v1/markers?types=c&year=-5000&end=2100&limit=100').expect(200);
    const byId = Object.fromEntries(res.body.map(m => [m._id, m]));
    expect(byId.Volgograd.names).to.deep.equal(NAMES);
    expect(byId.Samara).to.not.have.property('names');
  });

  it('includes names in the GeoJSON format', async () => {
    const res = await request(app).get('/v1/markers?types=c&year=-5000&end=2100&format=geojson').expect(200);
    const f = res.body.features.find(x => x.properties.id === 'Volgograd');
    expect(f.properties.names).to.deep.equal(NAMES);
  });

  it('keeps names on an edit and on a wiki change', async function () {
    this.timeout(15000);
    await request(app).put('/v1/markers/Volgograd').set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'Tsaritsyn', year: 1589 }).expect(200);
    expect((await request(app).get('/v1/markers/Volgograd').expect(200)).body.names).to.deep.equal(NAMES);

    await request(app).put('/v1/markers/Volgograd').set('Authorization', `Bearer ${TOKEN}`)
      .send({ wiki: 'Volgograd_(city)' });
    const moved = await request(app).get('/v1/markers/Volgograd_(city)');
    expect(moved.status).to.equal(200);
    expect(moved.body.names).to.deep.equal(NAMES);
  });
});
