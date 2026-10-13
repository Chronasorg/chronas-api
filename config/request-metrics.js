/**
 * Request latency as a CloudWatch metric, written in embedded metric format
 * (EMF): one JSON line per request on stdout. Lambda Web Functions publish no
 * latency metric, and this gives both runtimes the same one to compare.
 *
 * Only Runtime and Version are dimensions, because every distinct
 * combination is a billed custom metric. Route (the Express route template,
 * never the raw path), method and status are plain fields, queryable in Logs
 * Insights at no metric cost. EMF must go to stdout directly: the Web
 * Function runtime wraps console output, and CloudWatch doesn't extract
 * metrics from the wrapped object.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { runtimeName } from './bootstrap.js';

export const NAMESPACE = 'Chronas/Api';

export function appVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), '../build-version.json');
    return JSON.parse(readFileSync(file, 'utf8')).commit || 'unknown';
  } catch {
    return 'local';
  }
}

export function routeTemplate(req) {
  return req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
}

export function createRequestMetrics({
  runtime = runtimeName(),
  version = appVersion(),
  write = line => process.stdout.write(line)
} = {}) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
      write(`${JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [{
            Namespace: NAMESPACE,
            Dimensions: [['Runtime', 'Version']],
            Metrics: [{ Name: 'LatencyMs', Unit: 'Milliseconds' }]
          }]
        },
        Runtime: runtime,
        Version: version,
        LatencyMs: Math.round(latencyMs * 10) / 10,
        Route: routeTemplate(req),
        Method: req.method,
        Status: res.statusCode,
        RequestId: req.get('lambda-web-request-id')
      })}\n`);
    });
    next();
  };
}
