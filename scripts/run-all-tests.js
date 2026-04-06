#!/usr/bin/env node

/**
 * Run All Tests
 *
 * Runs unit/integration tests (mocha) and Postman/Newman tests sequentially.
 * All tests use in-memory MongoDB — no external database needed.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function runCommand(label, command, args) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${'='.repeat(60)}\n`);

    const proc = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '1' }
    });

    proc.on('close', (code) => {
      resolve({ label, code });
    });

    proc.on('error', (err) => {
      console.error(`Failed to run ${label}:`, err.message);
      resolve({ label, code: 1 });
    });
  });
}

async function main() {
  console.log('Running all tests (unit + integration + Postman)\n');

  const results = [];

  // 1. Unit & Integration tests (mocha with in-memory MongoDB)
  const mocha = await runCommand(
    'Unit & Integration Tests (Mocha)',
    'npx',
    ['cross-env', 'NODE_ENV=test', 'mocha',
      '--require', 'server/tests/helpers.js',
      '--reporter', 'spec',
      '--colors',
      'server/tests',
      '--recursive',
      '--exit',
      '--timeout', '30000'
    ]
  );
  results.push(mocha);

  // 2. Postman/Newman tests (against in-memory test server)
  const postman = await runCommand(
    'Postman/Newman API Tests',
    'node',
    ['scripts/run-postman-tests.js', 'local', 'enhanced', '--auto-start']
  );
  results.push(postman);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  Test Results Summary');
  console.log(`${'='.repeat(60)}\n`);

  let allPassed = true;
  for (const r of results) {
    const status = r.code === 0 ? 'PASS' : 'FAIL';
    const icon = r.code === 0 ? '\u2705' : '\u274C';
    console.log(`  ${icon} ${r.label}: ${status}`);
    if (r.code !== 0) allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log('All test suites passed!');
  } else {
    console.log('Some test suites failed.');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
