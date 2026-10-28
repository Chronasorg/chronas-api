import { describe, it } from 'mocha';
import { expect } from 'chai';
import { spawn } from 'child_process';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

/**
 * issue-32-borders.js --direct writes the provinces document through the
 * MetadataDynamo model in a short-lived local process. The API's scheduler
 * never sees that write, and the process would exit long before its 15 s
 * timer. So the script invalidates /v1/metadata* itself and waits for
 * CloudFront to accept it, exiting 1 when it doesn't. Run here as its own
 * process with the real CloudFront client against a fake CloudFront API;
 * DynamoDB is a fake document client preloaded into the process.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = pathToFileURL(path.join(ROOT, 'scripts/data-validation/issue-32-borders.js')).href;

const NS = 'http://cloudfront.amazonaws.com/doc/2020-05-31/';
async function startFakeCloudFront({ status }) {
  const requests = [];
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.writeHead(status, { 'Content-Type': 'text/xml' });
      res.end(status === 201
        ? `<?xml version="1.0" encoding="UTF-8"?><Invalidation xmlns="${NS}"><Id>I2DIRECT</Id><Status>InProgress</Status>`
          + '<CreateTime>2026-10-28T00:00:00Z</CreateTime><InvalidationBatch><Paths><Quantity>0</Quantity></Paths>'
          + '<CallerReference>x</CallerReference></InvalidationBatch></Invalidation>'
        : `<?xml version="1.0"?><ErrorResponse xmlns="${NS}"><Error><Type>Sender</Type><Code>AccessDenied</Code>`
          + '<Message>User is not authorized to perform: cloudfront:CreateInvalidation</Message></Error><RequestId>r1</RequestId></ErrorResponse>');
    });
  });
  await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${fake.address().port}`, requests, close: () => new Promise(resolve => fake.close(resolve)) };
}

// A DynamoDB document client with one provinces document; every put is
// printed, so the output shows the write before the invalidation.
const FAKE_DYNAMO = `
  const items = new Map([['provinces', { _id: 'provinces', type: 'g', data: { type: 'FeatureCollection', features: [] } }]]);
  globalThis.__TEST_DYNAMO_DOC_CLIENT = {
    send: async (command) => {
      if (command.constructor.name === 'GetCommand') return { Item: items.get(command.input.Key._id) };
      if (command.constructor.name === 'PutCommand') {
        items.set(command.input.Item._id, command.input.Item);
        console.log('PUT ' + command.input.Item._id);
        return {};
      }
      throw new Error('unexpected ' + command.constructor.name);
    }
  };
`;

// What main() does with --direct, minus the API reads and the geometry,
// and without the 10 s settle wait.
const DRIVER = `
  const { writeProvincesDirect } = await import(${JSON.stringify(SCRIPT)});
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Lausitz' }, geometry: null }] };
  if (!(await writeProvincesDirect(fc, { distributionId: 'ETEST', settleMs: 0 }))) process.exitCode = 1;
`;

function runDirectWrite(cloudFrontUrl) {
  const child = spawn(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(FAKE_DYNAMO)}`,
    '--input-type=module', '-e', DRIVER
  ], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      AWS_ENDPOINT_URL_CLOUDFRONT: cloudFrontUrl,
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  return new Promise(resolve => child.once('exit', code => resolve({ code, stdout, stderr })));
}

describe('## issue-32-borders.js --direct invalidates CloudFront before it exits', function () {
  this.timeout(30000);

  it('sends one invalidation of /v1/metadata* after the write and exits 0 once CloudFront accepted it', async () => {
    const cloudFront = await startFakeCloudFront({ status: 201 });
    try {
      const { code, stdout, stderr } = await runDirectWrite(cloudFront.url);
      expect(code, stderr).to.equal(0);
      expect(cloudFront.requests).to.have.length(1);
      expect(cloudFront.requests[0]).to.include({ method: 'POST', url: '/2020-05-31/distribution/ETEST/invalidation' });
      expect(cloudFront.requests[0].body).to.include('<Quantity>1</Quantity>').and.include('<Path>/v1/metadata*</Path>');
      const lines = stdout.trim().split('\n');
      expect(lines[0]).to.equal('PUT provinces');
      expect(lines.findIndex(l => l.startsWith('Invalidated /v1/metadata* on ETEST: invalidation I2DIRECT, InProgress.'))).to.be.above(0);
    } finally {
      await cloudFront.close();
    }
  });

  it('exits 1 and prints the manual command when CloudFront refuses', async () => {
    const cloudFront = await startFakeCloudFront({ status: 403 });
    try {
      const { code, stdout, stderr } = await runDirectWrite(cloudFront.url);
      expect(code).to.equal(1);
      expect(stdout).to.include('PUT provinces');
      expect(cloudFront.requests).to.have.length(1);
      expect(stderr).to.include('CloudFront invalidation failed: AccessDenied')
        .and.include('aws cloudfront create-invalidation --distribution-id ETEST --paths "/v1/metadata*"');
    } finally {
      await cloudFront.close();
    }
  });
});
