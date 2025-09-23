#!/usr/bin/env node

/**
 * CI/CD Postman Test Integration Script
 * 
 * Designed for automated testing in CI/CD pipelines
 * Handles test execution, result parsing, and exit codes
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run tests with specific configuration for CI/CD
 */
async function runCITests(environment = 'local', collection = 'enhanced') {
  const outputFile = `test-results/postman-ci-${environment}-${collection}.json`;
  const htmlFile = `test-results/postman-ci-${environment}-${collection}.html`;
  
  // Ensure test-results directory exists
  const resultsDir = path.resolve(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const args = [
      'scripts/run-postman-tests.js',
      environment,
      collection,
      '--auto-start'
    ];

    console.log(`🤖 Running CI Postman tests: ${environment}/${collection}`);

    const testProcess = spawn('node', args, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CI: 'true'
      }
    });

    testProcess.on('close', (code) => {
      console.log(`\n📊 CI Test Results:`);
      console.log(`Exit Code: ${code}`);
      
      // Parse results if available
      const resultsPath = path.resolve(__dirname, '..', outputFile);
      if (fs.existsSync(resultsPath)) {
        try {
          const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
          const { run } = results;
          
          console.log(`Total Requests: ${run.stats.requests.total}`);
          console.log(`Failed Requests: ${run.stats.requests.failed}`);
          console.log(`Total Assertions: ${run.stats.assertions.total}`);
          console.log(`Failed Assertions: ${run.stats.assertions.failed}`);
          
          // Determine if tests should be considered successful
          const hasFailures = run.stats.requests.failed > 0 || run.stats.assertions.failed > 0;
          
          if (hasFailures) {
            console.log('❌ Tests completed with failures');
            resolve(1); // Return failure code
          } else {
            console.log('✅ All tests passed successfully');
            resolve(0); // Return success code
          }
        } catch (error) {
          console.error('⚠️ Could not parse test results:', error.message);
          resolve(code); // Return original exit code
        }
      } else {
        console.log('⚠️ No results file found');
        resolve(code); // Return original exit code
      }
    });

    testProcess.on('error', (error) => {
      console.error('❌ Failed to run CI tests:', error);
      reject(error);
    });
  });
}

/**
 * Generate test summary for CI/CD reporting
 */
function generateTestSummary(resultsFile) {
  if (!fs.existsSync(resultsFile)) {
    return null;
  }

  try {
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const { run } = results;

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: run.stats.requests.total,
        failedRequests: run.stats.requests.failed,
        totalAssertions: run.stats.assertions.total,
        failedAssertions: run.stats.assertions.failed,
        totalTime: run.timings.completed - run.timings.started
      },
      failures: run.failures || [],
      success: run.stats.requests.failed === 0 && run.stats.assertions.failed === 0
    };
  } catch (error) {
    console.error('Error generating test summary:', error.message);
    return null;
  }
}

/**
 * Main CI execution
 */
async function main() {
  const args = process.argv.slice(2);
  const environment = args[0] || 'local';
  const collection = args[1] || 'enhanced';

  console.log('🤖 Starting CI/CD Postman Test Execution');
  console.log(`Environment: ${environment}`);
  console.log(`Collection: ${collection}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    const exitCode = await runCITests(environment, collection);
    
    // Generate summary for CI/CD systems
    const resultsFile = path.resolve(__dirname, '..', `test-results/postman-ci-${environment}-${collection}.json`);
    const summary = generateTestSummary(resultsFile);
    
    if (summary) {
      const summaryFile = path.resolve(__dirname, '..', `test-results/test-summary-${environment}-${collection}.json`);
      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
      console.log(`📋 Test summary saved to: ${summaryFile}`);
    }

    process.exit(exitCode);
  } catch (error) {
    console.error('❌ CI test execution failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runCITests, generateTestSummary };