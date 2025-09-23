#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * 
 * Runs unit tests, integration tests, and Postman API tests
 */

import { spawn } from 'child_process';
import { runNewman, displayResults } from './run-postman-tests.js';

/**
 * Run a command and return a promise
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Main test execution
 */
async function main() {
  const args = process.argv.slice(2);
  const skipUnit = args.includes('--skip-unit');
  const skipPostman = args.includes('--skip-postman');
  const environment = args.find(arg => ['local', 'dev', 'prod'].includes(arg)) || 'local';

  console.log('🧪 Starting comprehensive test suite...\n');

  try {
    // Run unit and integration tests
    if (!skipUnit) {
      console.log('📋 Step 1: Running unit and integration tests...');
      await runCommand('npm', ['test'], { cwd: process.cwd() });
      console.log('✅ Unit and integration tests completed\n');
    }

    // Run Postman tests
    if (!skipPostman) {
      console.log(`📋 Step 2: Running Postman API tests (${environment} environment)...`);
      
      if (environment === 'local') {
        console.log('⚠️ Note: Make sure the API server is running locally on port 3001');
        console.log('   Run: npm start (in another terminal)\n');
      }

      const outputFile = `postman-results-${environment}-enhanced.json`;
      await runNewman(
        'PostmanTests/chronas-enhanced.postman_collection.json',
        `PostmanTests/chronas-${environment}.postman_environment.json`,
        outputFile
      );
      
      displayResults(outputFile);
      console.log('✅ Postman API tests completed\n');
    }

    console.log('🎉 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default main;