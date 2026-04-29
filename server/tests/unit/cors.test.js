import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import express from 'express';
import cors from 'cors';
import request from 'supertest';

/**
 * Build a minimal Express app using the same CORS origin logic as config/express.js.
 * We replicate the callback here so we can test it in isolation without loading the
 * full app (which requires DB, sessions, etc.).
 */
function createCorsTestApp(envAllowedOrigins) {
  const app = express();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = (envAllowedOrigins || 'http://localhost:3000,http://localhost:5173').split(',');

      if (allowedOrigins.includes(origin) || /^https:\/\/([a-z0-9-]+\.)?chronas\.org$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));

  app.get('/test', (req, res) => res.json({ ok: true }));

  // Error handler so CORS errors return 500 instead of crashing
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err.message });
  });

  return app;
}

describe('## CORS Configuration', () => {
  let app;

  before(() => {
    app = createCorsTestApp();
  });

  describe('# Allowed *.chronas.org origins', () => {
    const allowedOrigins = [
      'https://chronas.org',
      'https://new.chronas.org',
      'https://de.chronas.org',
      'https://fr.chronas.org',
      'https://api.chronas.org',
      'https://my-test.chronas.org'
    ];

    allowedOrigins.forEach((origin) => {
      it(`should allow ${origin}`, async () => {
        const res = await request(app)
          .get('/test')
          .set('Origin', origin)
          .expect(200);

        expect(res.headers['access-control-allow-origin']).to.equal(origin);
        expect(res.headers['access-control-allow-credentials']).to.equal('true');
      });
    });
  });

  describe('# Allowed localhost origins', () => {
    const localhostOrigins = [
      'http://localhost:3000',
      'http://localhost:5173'
    ];

    localhostOrigins.forEach((origin) => {
      it(`should allow ${origin}`, async () => {
        const res = await request(app)
          .get('/test')
          .set('Origin', origin)
          .expect(200);

        expect(res.headers['access-control-allow-origin']).to.equal(origin);
      });
    });
  });

  describe('# No origin header (server-to-server / curl)', () => {
    it('should allow requests with no Origin header', async () => {
      const res = await request(app)
        .get('/test')
        .expect(200);

      expect(res.body.ok).to.equal(true);
    });
  });

  describe('# Blocked origins', () => {
    const blockedOrigins = [
      'https://evil.com',
      'https://notchronas.org',
      'https://chronas.org.evil.com',
      'https://fakechronas.org',
      'http://chronas.org',       // http not https
      'https://sub.sub.chronas.org' // nested subdomain
    ];

    blockedOrigins.forEach((origin) => {
      it(`should block ${origin}`, async () => {
        const res = await request(app)
          .get('/test')
          .set('Origin', origin)
          .expect(500);

        expect(res.body.error).to.equal('Not allowed by CORS');
      });
    });
  });

  describe('# CORS preflight (OPTIONS)', () => {
    it('should respond to preflight from allowed origin', async () => {
      const res = await request(app)
        .options('/test')
        .set('Origin', 'https://de.chronas.org')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).to.equal('https://de.chronas.org');
      expect(res.headers['access-control-allow-credentials']).to.equal('true');
    });

    it('should reject preflight from blocked origin', async () => {
      const res = await request(app)
        .options('/test')
        .set('Origin', 'https://evil.com')
        .set('Access-Control-Request-Method', 'GET')
        .expect(500);

      expect(res.body.error).to.equal('Not allowed by CORS');
    });
  });

  describe('# Custom ALLOWED_ORIGINS env override', () => {
    let customApp;

    before(() => {
      customApp = createCorsTestApp('https://custom.example.com,http://localhost:8080');
    });

    it('should allow a custom origin from env', async () => {
      const res = await request(customApp)
        .get('/test')
        .set('Origin', 'https://custom.example.com')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).to.equal('https://custom.example.com');
    });

    it('should still allow *.chronas.org with custom env', async () => {
      const res = await request(customApp)
        .get('/test')
        .set('Origin', 'https://de.chronas.org')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).to.equal('https://de.chronas.org');
    });

    it('should block default localhost:3000 when not in custom env', async () => {
      const res = await request(customApp)
        .get('/test')
        .set('Origin', 'http://localhost:3000')
        .expect(500);

      expect(res.body.error).to.equal('Not allowed by CORS');
    });
  });
});
