import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import express from 'express';
import cors from 'cors';
import request from 'supertest';

import { corsOptions } from '../../../config/cors.js';

/**
 * Minimal Express app with the production CORS options from config/cors.js,
 * so the origin rules are tested without loading the full app.
 */
function createCorsTestApp() {
  const app = express();
  app.use(cors(corsOptions));
  app.get('/test', (req, res) => res.json({ ok: true }));
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
        // Answered normally but without CORS headers, so the browser blocks it.
        // Not a 500: CloudFront caches 5xx for the error-caching TTL.
        const res = await request(app)
          .get('/test')
          .set('Origin', origin)
          .expect(200);

        expect(res.headers).to.not.have.property('access-control-allow-origin');
        expect(res.headers).to.not.have.property('access-control-allow-credentials');
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

    it('should reflect the requested headers to an allowed origin', async () => {
      const res = await request(app)
        .options('/test')
        .set('Origin', 'https://chronas.org')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,authorization')
        .expect(204);

      expect(res.headers['access-control-allow-headers']).to.equal('content-type,authorization');
    });

    it('should answer a preflight from a blocked origin without CORS headers', async () => {
      const res = await request(app)
        .options('/test')
        .set('Origin', 'https://evil.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'content-type,authorization');

      expect(res.status).to.be.below(500);
      expect(res.headers).to.not.have.property('access-control-allow-origin');
      expect(res.headers).to.not.have.property('access-control-allow-headers');
    });
  });

  describe('# Custom ALLOWED_ORIGINS env override', () => {
    let customApp;
    let savedAllowedOrigins;

    before(() => {
      savedAllowedOrigins = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = 'https://custom.example.com,http://localhost:8080';
      customApp = createCorsTestApp();
    });

    after(() => {
      if (savedAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = savedAllowedOrigins;
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
        .expect(200);

      expect(res.headers).to.not.have.property('access-control-allow-origin');
    });
  });
});
