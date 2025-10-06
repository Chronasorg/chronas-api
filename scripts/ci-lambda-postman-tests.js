#!/usr/bin/env node

/**
 * CI/CD Lambda Postman Test Integration Script
 * 
 * Specifically designed for testing deployed Lambda functions in CI/CD pipelines
 * Handles API Gateway endpoint discovery and test execution
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get API Gateway endpoint from CloudFormation stack
 */
async function getApiEndpoint(stackName = 'ChronasApiLambdaStackV2', region = 'eu-west-1') {
  try {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const aws = spawn('aws', [
        'cloudformation', 'describe-stacks',
        '--stack-name', stackName,
        '--region', region,
        '--query', 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue',
        '--output', 'text'
      ]);

      let output = '';
      let error = '';

      aws.stdout.on('data', (data) => {
        output += data.toString();
      });

      aws.stderr.on('data', (data) => {
        error += data.toString();
      });

      aws.on('close', (code) => {
        if (code === 0) {
          const endpoint = output.trim();
          if (endpoint && endpoint !== 'None') {
            resolve(endpoint);
          } else {
            reject(new Error('API Gateway URL not found in stack outputs'));
          }
        } else {
          reject(new Error(`AWS CLI failed: ${error}`));
        }
      });
    });
  } catch (error) {
    throw new Error(`Failed to get API endpoint: ${error.message}`);
  }
}

/**
 * Wait for API to be ready
 */
async function waitForApiReady(baseUrl, maxAttempts = 30, delayMs = 2000) {
  console.log(`🔍 Waiting for API to be ready at ${baseUrl}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${baseUrl}/v1/health`, { 
        timeout: 5000,
        validateStatus: () => true // Accept any status code
      });
      
      if (response.status === 200) {
        console.log(`✅ API is ready (attempt ${attempt}/${maxAttempts})`);
        return true;
      } else {
        console.log(`⏳ API not ready yet (status: ${response.status}, attempt ${attempt}/${maxAttempts})`);
      }
    } catch (error) {
      console.log(`⏳ API not ready yet (${error.message}, attempt ${attempt}/${maxAttempts})`);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error(`API did not become ready after ${maxAttempts} attempts`);
}

/**
 * Create temporary environment file for the deployed API
 */
function createDeploymentEnvironment(apiEndpoint) {
  const envConfig = {
    id: 'chronas-lambda-ci',
    name: 'Chronas Lambda CI Environment',
    values: [
      {
        key: 'baseUrl',
        value: apiEndpoint,
        enabled: true
      },
      {
        key: 'apiVersion',
        value: 'v1',
        enabled: true
      },
      {
        key: 'timeout',
        value: '10000',
        enabled: true
      }
    ]
  };

  const envFile = path.resolve(__dirname, '..', 'PostmanTests', 'chronas-lambda-ci.postman_environment.json');
  fs.writeFileSync(envFile, JSON.stringify(envConfig, null, 2));
  console.log(`📝 Created temporary environment file: ${envFile}`);
  
  return envFile;
}

/**
 * Run newman with the deployed API
 */
async function runLambdaTests(apiEndpoint, collection = 'enhanced') {
  const collections = {
    enhanced: 'PostmanTests/chronas-enhanced.postman_collection.json',
    basic: 'PostmanTests/chronas.postman_collection.json'
  };

  if (!collections[collection]) {
    throw new Error(`Invalid collection: ${collection}`);
  }

  // Create temporary environment for the deployed API
  const envFile = createDeploymentEnvironment(apiEndpoint);
  
  const outputFile = `test-results/postman-lambda-ci-${collection}.json`;
  const htmlFile = `test-results/postman-lambda-ci-${collection}.html`;
  
  // Ensure test-results directory exists
  const resultsDir = path.resolve(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const args = [
      'run', collections[collection],
      '-e', envFile,
      '--reporters', 'cli,json,htmlextra',
      '--reporter-json-export', outputFile,
      '--reporter-htmlextra-export', htmlFile,
      '--timeout-request', '15000',
      '--delay-request', '200',
      '--color', 'on',
      '--bail', // Stop on first failure for faster feedback
      '--verbose'
    ];

    console.log(`🧪 Running Lambda Postman tests: ${collection}`);
    console.log(`📊 Results will be saved to: ${outputFile}`);

    const newman = spawn('npx', ['newman', ...args], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    newman.on('close', (code) => {
      // Clean up temporary environment file
      try {
        fs.unlinkSync(envFile);
        console.log('🧹 Cleaned up temporary environment file');
      } catch (error) {
        console.warn('⚠️ Could not clean up temporary environment file:', error.message);
      }

      if (code === 0) {
        console.log('✅ Lambda Postman tests completed successfully');
      } else {
        console.log(`⚠️ Lambda Postman tests completed with issues (exit code ${code})`);
      }
      
      resolve(code);
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
      return { success: false, summary: null };
    }

    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const { run } = results;

    console.log('\n📋 Lambda Test Summary:');
    console.log(`Total Requests: ${run.stats.requests.total}`);
    console.log(`Passed: ${run.stats.requests.total - run.stats.requests.failed}`);
    console.log(`Failed: ${run.stats.requests.failed}`);
    console.log(`Total Assertions: ${run.stats.assertions.total}`);
    console.log(`Assertion Failures: ${run.stats.assertions.failed}`);

    const success = run.stats.requests.failed === 0 && run.stats.assertions.failed === 0;

    if (run.failures && run.failures.length > 0) {
      console.log('\n❌ Failed Tests:');
      run.failures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.source.name || 'Unknown'}`);
        console.log(`   Error: ${failure.error.message}`);
      });
    }

    console.log(`\n⏱️ Total Time: ${run.timings.completed - run.timings.started}ms`);
    
    if (success) {
      console.log('🎉 All Lambda tests passed!');
    } else {
      console.log('❌ Some Lambda tests failed');
    }

    return {
      success,
      summary: {
        totalRequests: run.stats.requests.total,
        failedRequests: run.stats.requests.failed,
        totalAssertions: run.stats.assertions.total,
        failedAssertions: run.stats.assertions.failed,
        totalTime: run.timings.completed - run.timings.started,
        failures: run.failures || []
      }
    };
  } catch (error) {
    console.error('❌ Failed to parse results:', error.message);
    return { success: false, summary: null };
  }
}

/**
 * Main execution for CI/CD
 */
async function main() {
  const args = process.argv.slice(2);
  const collection = args[0] || 'enhanced';
  const stackName = args[1] || 'ChronasApiLambdaStackV2';
  const region = args[2] || 'eu-west-1';

  console.log('🚀 Starting Lambda CI/CD Postman Test Execution');
  console.log(`Collection: ${collection}`);
  console.log(`Stack: ${stackName}`);
  console.log(`Region: ${region}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Get API endpoint from CloudFormation
    console.log('🔍 Discovering API Gateway endpoint...');
    const apiEndpoint = await getApiEndpoint(stackName, region);
    console.log(`📡 Found API endpoint: ${apiEndpoint}`);

    // Wait for API to be ready
    await waitForApiReady(apiEndpoint);

    // Run the tests
    const exitCode = await runLambdaTests(apiEndpoint, collection);
    
    // Display and analyze results
    const resultsFile = path.resolve(__dirname, '..', `test-results/postman-lambda-ci-${collection}.json`);
    const { success, summary } = displayResults(resultsFile);
    
    // Generate summary for CI/CD systems
    if (summary) {
      const summaryFile = path.resolve(__dirname, '..', `test-results/lambda-test-summary-${collection}.json`);
      const fullSummary = {
        timestamp: new Date().toISOString(),
        apiEndpoint,
        collection,
        success,
        ...summary
      };
      
      fs.writeFileSync(summaryFile, JSON.stringify(fullSummary, null, 2));
      console.log(`📋 Lambda test summary saved to: ${summaryFile}`);
    }

    // Exit with appropriate code
    const finalExitCode = success ? 0 : (exitCode || 1);
    console.log(`\n🏁 Lambda tests completed with exit code: ${finalExitCode}`);
    process.exit(finalExitCode);
    
  } catch (error) {
    console.error('❌ Lambda CI test execution failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { getApiEndpoint, waitForApiReady, runLambdaTests, displayResults };