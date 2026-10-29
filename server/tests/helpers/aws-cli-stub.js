/**
 * A stand-in for the AWS CLI, for testing infra/api-edge scripts without AWS:
 * jwt-secret-ssm.sh (server/tests/integration/jwt-secret-ssm.test.js) and
 * web-function.sh rollback (web-function-rollback.test.js).
 *
 * State lives in $STUB_STATE: secret-string.txt (the SecretString of the
 * Secrets Manager secret) and, once created, parameter.json
 * ({ Type, KeyId, Tier, Version, Value }). Every argv is appended to
 * calls.log, so a test can check that no value reached a command line.
 * Calls without --profile $STUB_PROFILE fail, STUB_HANG=<command> makes
 * that command wait STUB_HANG_MS (default 5000) first, and STUB_PUT_ERROR
 * makes put-parameter fail.
 *
 * For web-function.sh: endpoint.txt (the routed revision id),
 * revisions/<id>.json (get-web-function-revision output), secret.json
 * (describe-secret output; missing = ResourceNotFoundException),
 * policies.json ({ name: id } of the custom cache policies) and
 * distribution-config.json (get-distribution-config output). STUB_FAIL=<command>
 * makes that command fail with AccessDenied.
 */
import fs from 'fs';
import path from 'path';

const state = process.env.STUB_STATE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(state, 'calls.log'), `${JSON.stringify(args)}\n`);

const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const FLAGS = new Set(['--with-decryption']);
const words = [];
for (let i = 0; i < args.length; i += 1) {
  if (!args[i].startsWith('--')) words.push(args[i]);
  else if (!FLAGS.has(args[i])) i += 1;
}
const [service, command] = words;

function fail(code, message) {
  process.stderr.write(`An error occurred (${code}) when calling the operation: ${message}\n`);
  process.exit(254);
}

if (option('--profile') !== process.env.STUB_PROFILE) fail('Stub', 'unexpected profile');
if (process.env.STUB_HANG === command) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.STUB_HANG_MS || 5000));
}

const parameterFile = path.join(state, 'parameter.json');
const parameter = () => (fs.existsSync(parameterFile) ? JSON.parse(fs.readFileSync(parameterFile, 'utf8')) : null);
const print = (text) => {
  process.stdout.write(`${text}\n`);
  process.exit(0);
};

if (service === 'configure' && command === 'get') {
  if (process.env.STUB_CLI_HISTORY) print(process.env.STUB_CLI_HISTORY);
  process.exit(1);
}
if (service === 'sts' && command === 'get-caller-identity') print(process.env.STUB_ACCOUNT || '937826731833');
if (service === 'secretsmanager' && command === 'get-secret-value') {
  if (option('--query') !== 'SecretString' || option('--output') !== 'json') fail('Stub', 'unexpected output');
  print(JSON.stringify(fs.readFileSync(path.join(state, 'secret-string.txt'), 'utf8'), null, 4));
}
if (service === 'ssm' && command === 'describe-parameters') {
  const p = parameter();
  if (option('--output') === 'text') print(p ? [p.Type, p.KeyId ?? 'None', p.Tier, p.Version].join('\t') : 'None');
  const metadata = p ? [{ Name: '/chronas/jwt-secret', Type: p.Type, KeyId: p.KeyId, Tier: p.Tier, Version: p.Version }] : [];
  print(JSON.stringify({ Parameters: metadata }, null, 4));
}
if (service === 'ssm' && command === 'get-parameter') {
  const p = parameter();
  if (!p) fail('ParameterNotFound', '');
  if (!args.includes('--with-decryption')) fail('Stub', 'expected --with-decryption');
  if (option('--query') !== 'Parameter.Value' || option('--output') !== 'json') fail('Stub', 'unexpected output');
  print(JSON.stringify(p.Value, null, 4));
}
if (service === 'ssm' && command === 'put-parameter') {
  if (parameter()) fail('ParameterAlreadyExists', 'The parameter already exists.');
  const file = option('--cli-input-json').replace(/^file:\/\//, '');
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  // STUB_PUT_ERROR=<code>: fail with a message that quotes the value.
  if (process.env.STUB_PUT_ERROR) fail(process.env.STUB_PUT_ERROR, `Value '${input.Value}' was not accepted`);
  fs.writeFileSync(path.join(state, 'put-input.json'), JSON.stringify({
    mode: (fs.statSync(file).mode & 0o777).toString(8),
    keys: Object.keys(input).sort(),
    Tags: input.Tags
  }));
  fs.writeFileSync(parameterFile, JSON.stringify({ Type: input.Type, KeyId: input.KeyId, Tier: input.Tier, Version: 1, Value: input.Value }));
  print('1');
}
if (process.env.STUB_FAIL === command) fail('AccessDenied', `stub refuses ${command}`);
const stateFile = name => path.join(state, name);
const readState = name => (fs.existsSync(stateFile(name)) ? fs.readFileSync(stateFile(name), 'utf8') : null);
if (service === 'lambda-web') {
  if (command === 'help') process.exit(0);
  if (command === 'get-web-function-endpoint') {
    if (option('--query') !== 'revisionWeights[0].revisionId') fail('Stub', 'unexpected query');
    print(readState('endpoint.txt').trim());
  }
  if (command === 'get-web-function-revision') {
    const revision = readState(path.join('revisions', `${option('--revision-id')}.json`));
    if (!revision) fail('ResourceNotFoundException', 'Revision not found');
    print(revision.trim());
  }
  if (command === 'update-web-function-endpoint') {
    fs.writeFileSync(stateFile('endpoint.txt'), JSON.parse(option('--revision-weights'))[0].revisionId);
    print('InProgress');
  }
  if (command === 'wait') process.exit(0);
}
if (service === 'secretsmanager' && command === 'describe-secret') {
  const secret = readState('secret.json');
  if (!secret) fail('ResourceNotFoundException', 'Secrets Manager can\'t find the specified secret.');
  print(secret.trim());
}
if (service === 'cloudfront' && command === 'list-cache-policies') {
  const name = /Name=='([^']+)'/.exec(option('--query') || '')?.[1];
  const policies = JSON.parse(readState('policies.json') || '{}');
  print(policies[name] || 'None');
}
if (service === 'cloudfront' && command === 'get-distribution-config') print(readState('distribution-config.json').trim());
fail('Stub', `unhandled: ${args.join(' ')}`);
