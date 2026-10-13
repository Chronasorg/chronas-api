import { describe, it } from 'mocha';
import { expect } from 'chai';
import express from 'express';
import request from 'supertest';

import contactRoutes from '../../routes/contact.router.js';
import collectionRoutes from '../../routes/collection.route.js';
import gameRoutes from '../../routes/game.route.js';

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
});
