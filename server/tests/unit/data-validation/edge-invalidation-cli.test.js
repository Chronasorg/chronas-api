import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';

import {
  DEFAULT_DISTRIBUTION_ID, distributionIdFrom, manualInvalidationCommand, invalidateAfterDirectWrites
} from '../../../../scripts/data-validation/edge-invalidation-cli.js';
import { writeProvincesDirect } from '../../../../scripts/data-validation/issue-32-borders.js';
import { SETTLE_MS } from '../../../helpers/edge-invalidation.js';
import { decodeFromRead } from '../../../models/dynamo/compression.js';

/**
 * Admin scripts that write through the server models bypass the API, so
 * nothing else invalidates the CloudFront copies of what they wrote: they
 * invalidate after their last write, and fail loudly when that doesn't work.
 */

function recorder({ fail = null } = {}) {
  const out = { log: [], error: [], waited: [], sent: [] };
  return {
    out,
    options: {
      log: line => out.log.push(line),
      error: line => out.error.push(line),
      wait: async (ms) => { out.waited.push(ms); },
      send: async (input) => {
        out.sent.push(input);
        if (fail) throw fail;
        return { Invalidation: { Id: 'I2ABC', Status: 'InProgress' } };
      }
    }
  };
}

const accessDenied = () => Object.assign(new Error('User is not authorized to perform cloudfront:CreateInvalidation'), { name: 'AccessDenied' });

describe('## Edge invalidation for scripts that write through the models', () => {
  describe('# distribution id', () => {
    it('comes from --distribution-id, then CLOUDFRONT_DISTRIBUTION_ID, then E1KTIK2H0W8J2Q', () => {
      expect(DEFAULT_DISTRIBUTION_ID).to.equal('E1KTIK2H0W8J2Q');
      expect(distributionIdFrom(['--direct', '--distribution-id', 'EFLAG'], { CLOUDFRONT_DISTRIBUTION_ID: 'EENV' })).to.equal('EFLAG');
      expect(distributionIdFrom(['--distribution-id=EFLAG2'], {})).to.equal('EFLAG2');
      expect(distributionIdFrom(['--direct'], { CLOUDFRONT_DISTRIBUTION_ID: 'EENV' })).to.equal('EENV');
      expect(distributionIdFrom(['--direct'], {})).to.equal('E1KTIK2H0W8J2Q');
    });

    it('a flag without a value is an error, not the default', () => {
      expect(() => distributionIdFrom(['--distribution-id'], {})).to.throw('--distribution-id needs a value');
      expect(() => distributionIdFrom(['--distribution-id', '--direct'], {})).to.throw('--distribution-id needs a value');
      expect(() => distributionIdFrom(['--distribution-id='], {})).to.throw('--distribution-id needs a value');
    });
  });

  it('the manual command quotes each wildcard path for the shell', () => {
    expect(manualInvalidationCommand('E1KTIK2H0W8J2Q', ['/v1/metadata*']))
      .to.equal('aws cloudfront create-invalidation --distribution-id E1KTIK2H0W8J2Q --paths "/v1/metadata*"');
    expect(manualInvalidationCommand('E1', ['/v1/areas/*', '/v1/markers*']))
      .to.equal('aws cloudfront create-invalidation --distribution-id E1 --paths "/v1/areas/*" "/v1/markers*"');
  });

  it('the manual command names the profile the script ran with, so it reaches the same account', () => {
    expect(manualInvalidationCommand('E1KTIK2H0W8J2Q', ['/v1/metadata*'], { profile: 'chronas-prod' }))
      .to.equal('aws cloudfront create-invalidation --distribution-id E1KTIK2H0W8J2Q --paths "/v1/metadata*" --profile chronas-prod');
    expect(manualInvalidationCommand('E1', ['/v1/metadata*'], { profile: String.raw`it's mine` }))
      .to.equal(String.raw`aws cloudfront create-invalidation --distribution-id E1 --paths "/v1/metadata*" --profile 'it'\''s mine'`);
  });

  describe('# invalidateAfterDirectWrites', () => {
    it('waits SETTLE_MS, sends one invalidation, and prints what it invalidated', async () => {
      const { out, options } = recorder();
      const ok = await invalidateAfterDirectWrites(['metadata'], { ...options, argv: [], env: {} });
      expect(ok).to.equal(true);
      expect(out.waited).to.deep.equal([SETTLE_MS]);
      expect(out.sent).to.have.length(1);
      expect(out.sent[0].DistributionId).to.equal('E1KTIK2H0W8J2Q');
      expect(out.sent[0].InvalidationBatch.Paths).to.deep.equal({ Quantity: 1, Items: ['/v1/metadata*'] });
      expect(out.log.join('\n'))
        .to.include('Invalidated /v1/metadata* on E1KTIK2H0W8J2Q: invalidation I2ABC, InProgress.')
        .and.include('aws cloudfront get-invalidation --distribution-id E1KTIK2H0W8J2Q --id I2ABC')
        .and.include('up to 1 h');
      expect(out.error).to.deep.equal([]);
    });

    it('takes the distribution from the flag', async () => {
      const { out, options } = recorder();
      await invalidateAfterDirectWrites(['areas', 'metadata'], { ...options, argv: ['--distribution-id', 'EOTHER'], env: {} });
      expect(out.sent[0].DistributionId).to.equal('EOTHER');
      expect(out.sent[0].InvalidationBatch.Paths.Items).to.deep.equal(['/v1/areas/*', '/v1/metadata*']);
    });

    it('on failure prints the exact manual command and returns false, never throws', async () => {
      const { out, options } = recorder({ fail: accessDenied() });
      const ok = await invalidateAfterDirectWrites(['metadata'], { ...options, argv: [], env: {} });
      expect(ok).to.equal(false);
      expect(out.error[0]).to.equal('CloudFront invalidation failed: AccessDenied: User is not authorized to perform cloudfront:CreateInvalidation');
      expect(out.error).to.include('  aws cloudfront create-invalidation --distribution-id E1KTIK2H0W8J2Q --paths "/v1/metadata*"');
    });

    it('with AWS_PROFILE set, the printed commands use that profile', async () => {
      const failed = recorder({ fail: accessDenied() });
      await invalidateAfterDirectWrites(['metadata'], { ...failed.options, argv: [], env: { AWS_PROFILE: 'chronas-prod' } });
      expect(failed.out.error).to.include('  aws cloudfront create-invalidation --distribution-id E1KTIK2H0W8J2Q --paths "/v1/metadata*" --profile chronas-prod');
      const accepted = recorder();
      await invalidateAfterDirectWrites(['metadata'], { ...accepted.options, argv: [], env: { AWS_PROFILE: 'chronas-prod' } });
      expect(accepted.out.log).to.include('  aws cloudfront get-invalidation --distribution-id E1KTIK2H0W8J2Q --id I2ABC --profile chronas-prod');
    });
  });

  describe('# issue-32-borders.js --direct', () => {
    let savedClient;
    let items;
    let events;

    beforeEach(() => {
      savedClient = globalThis.__TEST_DYNAMO_DOC_CLIENT;
      items = new Map([['provinces', { _id: 'provinces', type: 'g', data: { type: 'FeatureCollection', features: [] } }]]);
      events = [];
      globalThis.__TEST_DYNAMO_DOC_CLIENT = {
        send: async (command) => {
          const { name } = command.constructor;
          if (name === 'GetCommand') return { Item: items.get(command.input.Key._id) };
          if (name === 'PutCommand') {
            events.push(`put ${command.input.Item._id}`);
            items.set(command.input.Item._id, command.input.Item);
            return {};
          }
          throw new Error(`unexpected ${name}`);
        }
      };
    });

    afterEach(() => {
      globalThis.__TEST_DYNAMO_DOC_CLIENT = savedClient;
    });

    const corrected = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Lausitz' }, geometry: null }] };

    it('writes the provinces document, then invalidates /v1/metadata* and reports success', async () => {
      const { out, options } = recorder();
      const send = async (input) => {
        // The write has landed when the invalidation goes out.
        events.push(`invalidate ${input.InvalidationBatch.Paths.Items.join(' ')}`);
        expect(decodeFromRead(items.get('provinces')).data).to.deep.equal(corrected);
        return options.send(input);
      };
      const ok = await writeProvincesDirect(corrected, { ...options, send, distributionId: 'ETEST', argv: [], env: {} });
      expect(ok).to.equal(true);
      expect(events).to.deep.equal(['put provinces', 'invalidate /v1/metadata*']);
      expect(out.sent[0].DistributionId).to.equal('ETEST');
      expect(out.waited).to.deep.equal([SETTLE_MS]);
    });

    it('a failed invalidation keeps the write and returns false (the script exits 1)', async () => {
      const { out, options } = recorder({ fail: accessDenied() });
      const ok = await writeProvincesDirect(corrected, { ...options, distributionId: 'ETEST', argv: [], env: {} });
      expect(ok).to.equal(false);
      expect(decodeFromRead(items.get('provinces')).data).to.deep.equal(corrected);
      expect(out.error).to.include('  aws cloudfront create-invalidation --distribution-id ETEST --paths "/v1/metadata*"');
    });

    it('a missing provinces document fails before anything is written or invalidated', async () => {
      items.clear();
      const { out, options } = recorder();
      const error = await writeProvincesDirect(corrected, { ...options, distributionId: 'ETEST', argv: [], env: {} }).catch(e => e);
      expect(error.message).to.equal('The provinces document does not exist');
      expect(events).to.deep.equal([]);
      expect(out.sent).to.deep.equal([]);
    });
  });
});
