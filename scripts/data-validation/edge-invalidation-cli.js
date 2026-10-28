/**
 * CloudFront invalidation for admin scripts that write to DynamoDB through
 * the server models (for example issue-32-borders.js --direct) instead of
 * through the API.
 *
 * The API invalidates the edge copies of what it writes, about 15 s later,
 * in the environment that handled the write (server/helpers/edge-invalidation.js).
 * A script's process gets none of that: without CLOUDFRONT_DISTRIBUTION_ID
 * its model writes mark nothing, and with it the process exits before the
 * 15 s timer fires. So a script that writes through a model calls
 * invalidateAfterDirectWrites() after its last write, and exits non-zero
 * when it returns false.
 *
 * It can't reach the API environments' in-process caches: an environment
 * that cached the old data keeps serving it until its entry expires (1 h
 * for area years and metadata lists).
 */

import { invalidateNow, RESOURCE_PATHS, SETTLE_MS } from '../../server/helpers/edge-invalidation.js';

/** The API's CloudFront distribution (api.chronas.org and the new frontend's API host). */
export const DEFAULT_DISTRIBUTION_ID = 'E1KTIK2H0W8J2Q';

/** `--distribution-id <id>` (or `=<id>`), else CLOUDFRONT_DISTRIBUTION_ID, else E1KTIK2H0W8J2Q. */
export function distributionIdFrom(argv = process.argv.slice(2), env = process.env) {
  const i = argv.findIndex(arg => arg === '--distribution-id' || arg.startsWith('--distribution-id='));
  if (i === -1) return env.CLOUDFRONT_DISTRIBUTION_ID || DEFAULT_DISTRIBUTION_ID;
  const value = argv[i] === '--distribution-id' ? argv[i + 1] : argv[i].slice('--distribution-id='.length);
  if (!value || value.startsWith('--')) throw new Error('--distribution-id needs a value');
  return value;
}

/** The AWS CLI command that sends the same invalidation by hand. */
export function manualInvalidationCommand(distributionId, paths) {
  return `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths ${paths.map(p => `"${p}"`).join(' ')}`;
}

/**
 * After a script's last direct write: wait SETTLE_MS, as the API does, so
 * that DynamoDB's eventually consistent reads return the new data when the
 * edge fetches again, then invalidate the resources' paths and wait until
 * CloudFront has accepted it. Prints what it did. On failure prints the
 * manual command and returns false.
 * @param resources 'areas' | 'markers' | 'metadata'
 * @returns {Promise<boolean>} whether CloudFront accepted the invalidation
 */
export async function invalidateAfterDirectWrites(resources, {
  distributionId = null,
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
  error = console.error,
  settleMs = SETTLE_MS,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  send
} = {}) {
  const paths = [...new Set(resources.map(resource => RESOURCE_PATHS[resource] ?? String(resource)))].sort();
  let distribution = distributionId;
  try {
    distribution ||= distributionIdFrom(argv, env);
    log(`Waiting ${settleMs / 1000} s so DynamoDB reads return the new data, then invalidating ${paths.join(' ')} on ${distribution} ...`);
    await wait(settleMs);
    const result = await invalidateNow(resources, { distributionId: distribution, ...(send ? { send } : {}) });
    log(`Invalidated ${result.paths.join(' ')} on ${distribution}: invalidation ${result.id}, ${result.status}. CloudFront usually completes it within 10-100 s:`);
    log(`  aws cloudfront get-invalidation --distribution-id ${distribution} --id ${result.id}`);
    log('API environments that cached the old data keep serving it until their in-process copy expires (up to 1 h).');
    return true;
  } catch (e) {
    distribution ||= DEFAULT_DISTRIBUTION_ID;
    error(`CloudFront invalidation failed: ${e?.name || 'Error'}: ${e?.message ?? String(e)}`);
    error('The write is saved, but CloudFront keeps serving its copies until they expire (up to 1 day on ChronasApiPublicV3, 7 days on V4). Invalidate by hand:');
    error(`  ${manualInvalidationCommand(distribution, paths)}`);
    return false;
  }
}
