#!/usr/bin/env node

/**
 * Postman Test Automation Script
 *
 * Uses newman programmatic API (avoids Node 25 Buffer issue with CLI)
 * Handles server lifecycle management for local testing
 */

import { spawn } from 'child_process';
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
  local: 'PostmanTests/chronas-local.postman_environment.json',
  dev: 'PostmanTests/chronas-dev.postman_environment.json',
  prod: 'PostmanTests/chronas-api.postman_environment.json'
};

/**
 * Check if server is running
 */
async function isServerRunning(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start the test server with in-memory MongoDB
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting test server with in-memory MongoDB...');

    const server = spawn('node', ['scripts/start-test-server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: '3001' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    server.stdout.on('data', (data) => {
      process.stdout.write(`  [server] ${data}`);
    });
    server.stderr.on('data', (data) => {
      process.stderr.write(`  [server] ${data}`);
    });

    let serverReady = false;

    const checkServer = async () => {
      if (await isServerRunning('http://localhost:3001')) {
        if (!serverReady) {
          serverReady = true;
          console.log('✅ Test server is ready');
          resolve(server);
        }
      }
    };

    setTimeout(() => {
      const interval = setInterval(async () => {
        await checkServer();
        if (serverReady) clearInterval(interval);
      }, 1000);

      setTimeout(() => {
        if (!serverReady) {
          clearInterval(interval);
          server.kill();
          reject(new Error('Test server failed to start within 30 seconds'));
        }
      }, 30000);
    }, 2000);

    server.on('error', (error) => {
      console.error('❌ Failed to start test server:', error);
      reject(error);
    });
  });
}

/**
 * Stop the server
 */
function stopServer(server) {
  if (server && !server.killed) {
    console.log('🛑 Stopping server...');
    server.kill('SIGTERM');
    setTimeout(() => {
      if (!server.killed) server.kill('SIGKILL');
    }, 5000);
  }
}

/**
 * Run newman programmatically (avoids Node 25 Buffer CLI issue)
 */
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

      // Save results to JSON
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

      // Display summary
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

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const environment = args[0] || 'local';
  const collection = args[1] || 'enhanced';
  const autoStart = args.includes('--auto-start') || environment === 'local';

  if (!ENVIRONMENTS[environment]) {
    console.error(`❌ Invalid environment: ${environment}. Available: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    process.exit(1);
  }

  if (!COLLECTIONS[collection]) {
    console.error(`❌ Invalid collection: ${collection}. Available: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  const outputFile = `postman-results-${environment}-${collection}.json`;
  let server = null;

  try {
    if (environment === 'local' && autoStart) {
      const serverRunning = await isServerRunning('http://localhost:3001');
      if (!serverRunning) {
        server = await startServer();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('✅ Server is already running');
      }
    }

    const exitCode = await runNewman(COLLECTIONS[collection], ENVIRONMENTS[environment], outputFile);
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  } finally {
    if (server) stopServer(server);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runNewman };
