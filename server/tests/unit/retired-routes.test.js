import { describe, it } from 'mocha';
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';

import contactRoutes from '../../routes/contact.router.js';
import collectionRoutes from '../../routes/collection.route.js';
import gameRoutes from '../../routes/game.route.js';
import flagRoutes from '../../routes/flag.route.js';
import revisionRoutes from '../../routes/revision.route.js';

/**
 * Retired APIs answer 410 Gone for every method and sub-path, so old clients
 * get an explicit signal instead of a 404 or a silent no-op.
 */
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/v1/contact', contactRoutes);
  app.use('/v1/collections', collectionRoutes);
  app.use('/v1/game', gameRoutes);
  app.use('/v1/flags', flagRoutes);
  app.use('/v1/revisions', revisionRoutes);
  return app;
}

describe('## Retired routes return 410 Gone', () => {
  const app = createApp();

  it('POST /v1/contact returns 410 without sending mail', async () => {
    const res = await request(app)
      .post('/v1/contact')
      .send({ from: 'a@example.com', to: 'b@example.com', subject: 'hi', html: '<b>x</b>' });
    expect(res.status).to.equal(410);
    expect(res.body.message).to.equal('The contact API has been retired.');
  });

  it('GET and sub-paths of /v1/contact return 410', async () => {
    expect((await request(app).get('/v1/contact')).status).to.equal(410);
    expect((await request(app).post('/v1/contact/anything')).status).to.equal(410);
  });

  it('collections and game stay retired', async () => {
    expect((await request(app).get('/v1/collections')).status).to.equal(410);
    expect((await request(app).get('/v1/game/highscore')).status).to.equal(410);
  });

  it('every method of /v1/flags returns 410 without a token', async () => {
    const calls = [
      request(app).get('/v1/flags'),
      request(app).post('/v1/flags').send({ fullUrl: 'https://chronas.org/', subEntityId: 'x' }),
      request(app).put('/v1/flags/abc').send({ fixed: true }),
      request(app).delete('/v1/flags/abc')
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status, `${res.req.method} ${res.req.path}`).to.equal(410);
      expect(res.body.message).to.equal('The flags API has been retired.');
    }
  });

  it('the revision list and revision edits return 410; reading one needs an admin token', async () => {
    expect((await request(app).get('/v1/revisions')).status).to.equal(410);
    expect((await request(app).get('/v1/revisions?count=1&filter={}')).status).to.equal(410);
    expect((await request(app).put('/v1/revisions/abc')).status).to.equal(410);
    expect((await request(app).delete('/v1/revisions/abc')).status).to.equal(410);
    // Refused before the revision is loaded, so no database read happens.
    expect((await request(app).get('/v1/revisions/abc')).status).to.equal(401);
  });
});
