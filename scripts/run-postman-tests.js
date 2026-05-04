#!/usr/bin/env node

/**
 * Postman Test Automation Script
 *
 * Runs newman against a remote environment (dev or prod). Local runs are no
 * longer supported — there is no in-memory test server now that the API is
 * DynamoDB-only.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLLECTIONS = {
  enhanced: 'PostmanTests/chronas-enhanced.postman_collection.json',
  basic: 'PostmanTests/chronas.postman_collection.json'
};

const ENVIRONMENTS = {
  dev: 'PostmanTests/chronas-dev.postman_environment.json',
  prod: 'PostmanTests/chronas-api.postman_environment.json'
};

async function runNewman(collection, environment, outputFile) {
  const newman = await import('newman');
  const collectionData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', collection), 'utf8'));
  const environmentData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', environment), 'utf8'));

  return new Promise((resolve, reject) => {
    console.log(`🧪 Running: ${collection} with ${environment}`);
    console.log(`📊 Results: ${outputFile}`);

    newman.default.run({
      collection: collectionData,
      environment: environmentData,
      reporters: ['cli'],
      reporter: {
        cli: { noAssertions: false, noSummary: false }
      },
      timeoutRequest: 10000,
      delayRequest: 100
    }, (err, summary) => {
      if (err) {
        console.error('❌ Newman error:', err.message);
        return reject(err);
      }

      try {
        const results = {
          run: {
            stats: summary.run.stats,
            timings: summary.run.timings,
            failures: summary.run.failures.map(f => ({
              source: { name: f.source?.name || f.parent?.name || 'Unknown' },
              error: { message: f.error?.message || 'Unknown error' }
            }))
          }
        };
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
      } catch (writeErr) {
        console.warn('⚠️ Could not save results file:', writeErr.message);
      }

      const { stats } = summary.run;
      console.log('\n📋 Test Summary:');
      console.log(`   Requests:   ${stats.requests.total - stats.requests.failed}/${stats.requests.total} passed`);
      console.log(`   Assertions: ${stats.assertions.total - stats.assertions.failed}/${stats.assertions.total} passed`);
      console.log(`   Duration:   ${summary.run.timings.completed - summary.run.timings.started}ms`);

      if (summary.run.failures.length > 0) {
        console.log('\n❌ Failures:');
        summary.run.failures.forEach((f, i) => {
          console.log(`   ${i + 1}. ${f.source?.name || f.parent?.name || 'Unknown'}: ${f.error?.message}`);
        });
      }

      resolve(stats.assertions.failed > 0 ? 1 : 0);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const environment = args[0] || 'dev';
  const collection = args[1] || 'enhanced';

  if (!ENVIRONMENTS[environment]) {
    console.error(`❌ Invalid environment: ${environment}. Available: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    process.exit(1);
  }

  if (!COLLECTIONS[collection]) {
    console.error(`❌ Invalid collection: ${collection}. Available: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  const outputFile = `postman-results-${environment}-${collection}.json`;

  try {
    const exitCode = await runNewman(COLLECTIONS[collection], ENVIRONMENTS[environment], outputFile);
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runNewman };
