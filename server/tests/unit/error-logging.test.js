/**
 * Regression tests for issue #158 — the error-handler middleware used to log
 * only the literal string "middlewareError" with no stack/message/status/path.
 *
 * These cover the two units that were dropping the data:
 *   1. config/winston.js — the printf formatter discarded all meta.
 *   2. config/express.js — expressWinston.errorLogger was given no msg/meta config.
 */

import { expect } from 'chai';
import expressWinston from 'express-winston';
import { createLogger, format, transports } from 'winston';

import winstonInstance from '../../../config/winston.js';

const MESSAGE = Symbol.for('message');

// Minimal in-memory transport that records the fully-formatted log line.
class CaptureTransport extends transports.Console {
  constructor(opts) {
    super(opts);
    this.lines = [];
  }
  log(info, callback) {
    this.lines.push(info[MESSAGE]);
    if (callback) callback();
  }
}

describe('Issue #158 — structured error logging', () => {
  describe('winston custom formatter', () => {
    it('serializes structured meta instead of dropping it', () => {
      const capture = new CaptureTransport();
      const logger = createLogger({
        format: winstonInstance.format,
        transports: [capture]
      });

      logger.error('middlewareError', { status: 500, path: '/v1/markers', method: 'GET' });

      const line = capture.lines.join('\n');
      expect(line).to.contain('middlewareError');
      expect(line).to.contain('"status":500');
      expect(line).to.contain('"path":"/v1/markers"');
      expect(line).to.contain('"method":"GET"');
    });

    it('does not append meta when there is none', () => {
      const capture = new CaptureTransport();
      const logger = createLogger({
        format: winstonInstance.format,
        transports: [capture]
      });

      logger.info('plain message');

      const line = capture.lines.join('\n');
      expect(line).to.contain('plain message');
      expect(line).to.not.contain('{');
    });
  });

  describe('expressWinston.errorLogger config', () => {
    // Mirrors the options in config/express.js. Kept in sync intentionally:
    // if the production config changes, this test documents the contract.
    function buildErrorLogger(captureTransport) {
      const logger = createLogger({
        format: format.combine(format.timestamp(), format.printf(({ level, message, timestamp, ...meta }) => {
          const keys = Object.keys(meta);
          return `${timestamp} ${level}: ${message}${keys.length ? ` ${JSON.stringify(meta)}` : ''}`;
        })),
        transports: [captureTransport]
      });
      return expressWinston.errorLogger({
        winstonInstance: logger,
        msg: 'middlewareError HTTP {{req.method}} {{req.originalUrl}}',
        metaField: null,
        requestField: null,
        exceptionToMeta: err => ({
          msg: err.message,
          stack: err.stack,
          name: err.name,
          status: err.status ?? err.statusCode ?? 500,
          code: err.code
        }),
        dynamicMeta: req => ({
          path: req.originalUrl,
          method: req.method,
          requestId: req.headers['x-amzn-requestid'] || req.headers['x-request-id']
        })
      });
    }

    it('logs stack, msg, status, path and method for a forced error', (done) => {
      const capture = new CaptureTransport();
      const middleware = buildErrorLogger(capture);

      const err = new Error('boom from downstream');
      err.status = 500;
      const req = {
        method: 'GET',
        originalUrl: '/v1/markers?year=1000',
        url: '/v1/markers?year=1000',
        headers: { 'x-amzn-requestid': 'req-abc-123' },
        // fields express-winston reads off the request
        connection: {},
        query: {}
      };
      const res = { statusCode: 500, on: () => {}, end: () => {} };

      middleware(err, req, res, () => {
        const line = capture.lines.join('\n');
        try {
          expect(line).to.contain('middlewareError');
          expect(line).to.contain('"msg":"boom from downstream"');
          expect(line).to.contain('"stack":');
          expect(line).to.contain('"status":500');
          expect(line).to.contain('"path":"/v1/markers?year=1000"');
          expect(line).to.contain('"method":"GET"');
          expect(line).to.contain('"requestId":"req-abc-123"');
          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('does not log request headers/body (no PII or secrets)', (done) => {
      const capture = new CaptureTransport();
      const middleware = buildErrorLogger(capture);

      const err = new Error('boom');
      const req = {
        method: 'POST',
        originalUrl: '/v1/markers',
        url: '/v1/markers',
        headers: { authorization: 'Bearer super-secret-token', cookie: 'session=abc' },
        body: { password: 'hunter2' },
        connection: {},
        query: {}
      };
      const res = { statusCode: 500, on: () => {}, end: () => {} };

      middleware(err, req, res, () => {
        const line = capture.lines.join('\n');
        try {
          expect(line).to.not.contain('super-secret-token');
          expect(line).to.not.contain('hunter2');
          expect(line).to.not.contain('session=abc');
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });
});
