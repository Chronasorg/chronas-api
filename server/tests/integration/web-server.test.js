import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import path from 'path';

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

async function startServer(env) {
  const port = await freePort();
  const child = spawn(process.execPath, ['web-server.js'], {
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
