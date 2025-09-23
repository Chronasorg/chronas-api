#!/usr/bin/env node

/**
 * Postman Test Automation Script
 * 
 * Runs Postman collections with newman and provides detailed reporting
 * Handles server lifecycle management for local testing
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
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
    const response = await axios.get(`${baseUrl}/v1/health`, { timeout: 2000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Start the server for testing
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting server for testing...');
    
    const server = spawn('npm', ['start'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverReady = false;
    
    // Check server readiness
    const checkServer = async () => {
      if (await isServerRunning('http://localhost:3001')) {
        if (!serverReady) {
          serverReady = true;
          console.log('✅ Server is ready for testing');
          resolve(server);
        }
      }
    };

    // Start checking after 2 seconds, then every 1 second
    setTimeout(() => {
      const interval = setInterval(async () => {
        await checkServer();
        if (serverReady) {
          clearInterval(interval);
        }
      }, 1000);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!serverReady) {
          clearInterval(interval);
          server.kill();
          reject(new Error('Server failed to start within 30 seconds'));
        }
      }, 30000);
    }, 2000);

    server.on('error', (error) => {
      console.error('❌ Failed to start server:', error);
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
    
    // Force kill after 5 seconds if not stopped
    setTimeout(() => {
      if (!server.killed) {
        server.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * Run newman with specified collection and environment
 */
async function runNewman(collection, environment, outputFile) {
  return new Promise((resolve, reject) => {
    const args = [
      'run', collection,
      '-e', environment,
      '--reporters', 'cli,json,htmlextra',
      '--reporter-json-export', outputFile,
      '--reporter-htmlextra-export', outputFile.replace('.json', '.html'),
      '--timeout-request', '10000',
      '--delay-request', '100',
      '--color', 'on'
    ];

    console.log(`🧪 Running Postman tests: ${collection} with ${environment}`);
    console.log(`📊 Results will be saved to: ${outputFile}`);

    const newman = spawn('npx', ['newman', ...args], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    newman.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Postman tests completed successfully');
        resolve(code);
      } else {
        console.log(`⚠️ Postman tests completed with issues (exit code ${code})`);
        // Don't reject on test failures, just resolve with the code
        resolve(code);
      }
    });

    newman.on('error', (error) => {
      console.error('❌ Failed to start newman:', error);
      reject(error);
    });
  });
}

/**
 * Parse and display test results
 */
function displayResults(resultsFile) {
  try {
    if (!fs.existsSync(resultsFile)) {
      console.log('⚠️ Results file not found');
      return;
    }

    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const { run } = results;

    console.log('\n📋 Test Summary:');
    console.log(`Total Requests: ${run.stats.requests.total}`);
    console.log(`Passed: ${run.stats.requests.total - run.stats.requests.failed}`);
    console.log(`Failed: ${run.stats.requests.failed}`);
    console.log(`Total Assertions: ${run.stats.assertions.total}`);
    console.log(`Assertion Failures: ${run.stats.assertions.failed}`);

    if (run.failures && run.failures.length > 0) {
      console.log('\n❌ Failed Tests:');
      run.failures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.source.name || 'Unknown'}`);
        console.log(`   Error: ${failure.error.message}`);
      });
    }

    console.log(`\n⏱️ Total Time: ${run.timings.completed - run.timings.started}ms`);
  } catch (error) {
    console.error('❌ Failed to parse results:', error.message);
  }
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
    console.error(`❌ Invalid environment: ${environment}`);
    console.log(`Available environments: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    process.exit(1);
  }

  if (!COLLECTIONS[collection]) {
    console.error(`❌ Invalid collection: ${collection}`);
    console.log(`Available collections: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  const outputFile = `postman-results-${environment}-${collection}.json`;
  let server = null;

  try {
    // For local environment, check if we need to start the server
    if (environment === 'local' && autoStart) {
      const baseUrl = 'http://localhost:3001';
      const serverRunning = await isServerRunning(baseUrl);
      
      if (!serverRunning) {
        server = await startServer();
        // Give server a moment to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('✅ Server is already running');
      }
    }

    // Run the tests
    const exitCode = await runNewman(COLLECTIONS[collection], ENVIRONMENTS[environment], outputFile);
    
    // Display results
    displayResults(outputFile);
    
    // Exit with the same code as newman
    process.exit(exitCode);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  } finally {
    // Always stop the server if we started it
    if (server) {
      stopServer(server);
    }
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runNewman, displayResults };