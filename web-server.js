/**
 * Entry point for the Lambda Web Function runtime
 * (AWS_LAMBDA_NODEJS_ENTRYPOINT=web-server.js). The Event Function keeps
 * using lambda-handler.js.
 *
 * Lambda routes requests to an environment as soon as the server listens and
 * requires that within 10 s, so the server listens first and every request
 * waits for the app (secrets, then the Express import). If startup failed,
 * requests get a 503 and a new attempt starts, at most every 5 s.
 */

import http from 'node:http';

import { createApp } from './config/bootstrap.js';

const RETRY_AFTER_MS = 5000;
const SHUTDOWN_GRACE_MS = 900; // Lambda allows about 1 s after SIGTERM

const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT || '127.0.0.1:3000';
const separator = endpoint.lastIndexOf(':');
const host = endpoint.slice(0, separator);
const port = Number(endpoint.slice(separator + 1));

let app = null;
let starting = null;
let lastFailureAt = 0;

function start() {
  starting = createApp()
    .then((created) => {
      app = created;
      return created;
    })
    .catch((error) => {
      lastFailureAt = Date.now();
      console.error('Startup failed:', error.name, error.message);
      throw error;
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

function ready() {
  if (app) return Promise.resolve(app);
  if (starting) return starting;
  if (Date.now() - lastFailureAt < RETRY_AFTER_MS) return Promise.reject(new Error('startup failed recently'));
  return start();
}

const server = http.createServer((req, res) => {
  ready().then(
    created => created(req, res),
    () => {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '5' });
      res.end(JSON.stringify({ message: 'Service is starting, try again shortly.' }));
    }
  );
});

server.listen(port, host, () => {
  console.log(`Listening on ${host}:${port}`);
  start().catch(() => {});
});

process.on('SIGTERM', () => {
  server.close();
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
});
