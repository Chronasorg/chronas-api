import { describe, it, before, afterEach } from 'mocha';
import { expect } from 'chai';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import path from 'path';

import { setupDynamoLocal } from '../helpers/dynamodb-local.js';

/**
 * web-server.js, the Lambda Web Function entry, started as its own process the
 * way the runtime starts it: it must listen right away, hold or refuse
 * requests until the app is ready, and exit promptly on SIGTERM.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function freePort() {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function startServer(env, { entry = 'web-server.js', nodeArgs = [] } = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [...nodeArgs, entry], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', AWS_LAMBDA_HTTP_ENDPOINT: `127.0.0.1:${port}`, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const started = Date.now();
  while (!output.includes('Listening on')) {
    if (child.exitCode !== null) throw new Error(`web-server exited: ${output}`);
    if (Date.now() - started > 10000) throw new Error(`web-server did not listen within 10 s: ${output}`);
    await new Promise(r => setTimeout(r, 25));
  }
  return { child, base: `http://127.0.0.1:${port}`, listenMs: Date.now() - started, output: () => output };
}

// A TCP server that accepts connections and never answers: a stalled AWS endpoint.
async function startStalledEndpoint() {
  const sockets = new Set();
  const stalled = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => stalled.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${stalled.address().port}`,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise(resolve => stalled.close(resolve));
    }
  };
}

const exitOf = child => (child.exitCode !== null
  ? Promise.resolve(child.exitCode)
  : new Promise(resolve => child.once('exit', code => resolve(code))));

// Code run in the server process before index.js (node --import), to raise a
// failure no handler catches.
const preload = source => ['--import', `data:text/javascript,${encodeURIComponent(source)}`];

describe('## web-server.js (Web Function entry)', function () {
  this.timeout(30000);
  let server;

  afterEach(() => {
    if (server && server.child.exitCode === null) server.child.kill('SIGKILL');
  });

  it('listens within the 10 s window and serves the app', async () => {
    server = await startServer({ JWT_SECRET: 'test-secret' });
    expect(server.listenMs).to.be.below(10000);

    const res = await fetch(`${server.base}/v1/health`);
    expect(res.status).to.equal(200);
    expect(res.headers.get('cache-control')).to.equal('no-store');
    expect(await res.text()).to.equal('Health OK');
  });

  it('answers 503 no-store while the secret cannot be loaded', async () => {
    // Secrets Manager endpoint that refuses connections; no environment secret.
    server = await startServer({
      SECRET_CONFIG_NAME: '/chronas/secrets',
      AWS_REGION: 'eu-west-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
      AWS_ENDPOINT_URL_SECRETS_MANAGER: 'http://127.0.0.1:9'
    });

    const res = await fetch(`${server.base}/v1/health`);
    expect(res.status).to.equal(503);
    expect(res.headers.get('cache-control')).to.equal('no-store');
    expect(res.headers.get('retry-after')).to.equal('5');
  });

  it('times out a stalled Secrets Manager and answers 503 within about 6 s', async () => {
    const stalled = await startStalledEndpoint();
    try {
      server = await startServer({
        SECRET_CONFIG_NAME: '/chronas/secrets',
        AWS_REGION: 'eu-west-1',
        AWS_ACCESS_KEY_ID: 'fake',
        AWS_SECRET_ACCESS_KEY: 'fake',
        AWS_ENDPOINT_URL_SECRETS_MANAGER: stalled.url
      });
      const sentAt = Date.now();
      const res = await fetch(`${server.base}/v1/health`, { signal: AbortSignal.timeout(15000) });
      expect(res.status).to.equal(503);
      expect(Date.now() - sentAt).to.be.below(8000);
      expect(server.output()).to.contain('Startup failed: TimeoutError');
    } finally {
      await stalled.close();
    }
  });

  it('exits within about 1 s of SIGTERM', async () => {
    server = await startServer({ JWT_SECRET: 'test-secret' });
    await fetch(`${server.base}/v1/health`);

    const exited = new Promise(resolve => server.child.once('exit', resolve));
    const sentAt = Date.now();
    server.child.kill('SIGTERM');
    await exited;
    expect(Date.now() - sentAt).to.be.below(1500);
  });
});

describe('## index.js keeps serving when one request fails', function () {
  this.timeout(60000);
  let server;
  let env;

  before(async () => {
    await setupDynamoLocal();
    env = {
      JWT_SECRET: 'test-secret',
      DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
      AWS_REGION: 'eu-west-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake'
    };
  });

  afterEach(() => {
    if (server && server.child.exitCode === null) server.child.kill('SIGKILL');
  });

  it('answers the retired aggregation routes with 410 next to other requests', async () => {
    server = await startServer(env, { entry: 'index.js' });
    const [aggregate, health, area] = await Promise.all([
      fetch(`${server.base}/v1/areas/aggregateMetaCoo`),
      fetch(`${server.base}/v1/health`),
      fetch(`${server.base}/v1/areas/aggregateProvinces`)
    ]);
    expect([aggregate.status, health.status, area.status]).to.deep.equal([410, 200, 410]);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(server.child.exitCode).to.equal(null);
    expect((await fetch(`${server.base}/v1/health`)).status).to.equal(200);
  });

  it('logs an unhandled rejection and keeps serving', async () => {
    server = await startServer(env, {
      entry: 'index.js',
      nodeArgs: preload('setTimeout(() => Promise.reject(new Error("probe rejection")), 300);')
    });
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(server.child.exitCode).to.equal(null);
    expect(server.output()).to.contain('unhandledRejection').and.contain('probe rejection');
    expect((await fetch(`${server.base}/v1/health`)).status).to.equal(200);
  });

  it('exits with code 1 about 1 s after an uncaught exception', async () => {
    server = await startServer(env, {
      entry: 'index.js',
      nodeArgs: preload('setTimeout(() => { throw new Error("probe exception"); }, 300);')
    });
    const code = await exitOf(server.child);
    expect(code).to.equal(1);
    expect(server.output()).to.contain('uncaughtException').and.contain('probe exception');
  });

  it('answers a 500 with one http5xx line within about 16 s when DynamoDB stalls', async () => {
    const stalled = await startStalledEndpoint();
    try {
      server = await startServer({ ...env, DYNAMODB_ENDPOINT: stalled.url }, { entry: 'index.js' });
      const sentAt = Date.now();
      const res = await fetch(`${server.base}/v1/areas/1000`, { signal: AbortSignal.timeout(30000) });
      const elapsed = Date.now() - sentAt;
      expect(res.status).to.equal(500);
      expect(elapsed).to.be.within(14000, 20000);
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(server.output().match(/http5xx/g)).to.have.length(1);
      expect(server.output()).to.match(/route: '\/v1\/areas\/:areaId'/);
    } finally {
      await stalled.close();
    }
  });
});
