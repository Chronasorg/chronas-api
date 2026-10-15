/**
 * Slow-request warning for the Lambda Web Function.
 *
 * Web Functions publish no latency metric, so a request slower than 5 s gets
 * one console.warn line (kept at applicationLogLevel WARN). Nothing is
 * measured per request otherwise: the old per-request process.memoryUsage()
 * sampling and the X-Response-Time / X-Memory-Usage headers came from the
 * classic Lambda setup, and the headers ended up on edge-cached responses.
 */

import { routeTemplate } from './http-5xx-log.js';

const SLOW_REQUEST_MS = 5000;

export function createPerformanceMiddleware({ slowRequestMs = SLOW_REQUEST_MS } = {}) {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      if (durationMs <= slowRequestMs) return;
      console.warn({ msg: 'slowRequest', method: req.method, route: routeTemplate(req), status: res.statusCode, durationMs });
    });
    next();
  };
}

export default { createPerformanceMiddleware };
