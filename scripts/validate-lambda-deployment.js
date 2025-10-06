#!/usr/bin/env node

/**
 * Lambda Deployment Validation Script
 * 
 * Validates that the Lambda function is properly deployed and accessible
 * before running comprehensive tests
 */

import { spawn } from 'child_process';
import axios from 'axios';

/**
 * Get API Gateway endpoint from CloudFormation stack
 */
async function getApiEndpoint(stackName = 'ChronasApiLambdaStackV2', region = 'eu-west-1') {
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
}

/**
 * Validate basic API endpoints
 */
async function validateEndpoints(baseUrl) {
  const endpoints = [
    { path: '/v1/health', name: 'Health Check' },
    { path: '/v1/welcome', name: 'Welcome Endpoint' },
    { path: '/v1/version', name: 'Version Endpoint' }
  ];

  const results = [];

  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 Testing ${endpoint.name}: ${baseUrl}${endpoint.path}`);
      
      const response = await axios.get(`${baseUrl}${endpoint.path}`, {
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });

      const success = response.status >= 200 && response.status < 400;
      
      results.push({
        endpoint: endpoint.path,
        name: endpoint.name,
        status: response.status,
        success,
        responseTime: response.headers['x-response-time'] || 'N/A',
        data: success ? 'OK' : response.data
      });

      if (success) {
        console.log(`✅ ${endpoint.name}: ${response.status} (${response.headers['x-response-time'] || 'N/A'})`);
      } else {
        console.log(`❌ ${endpoint.name}: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: ${error.message}`);
      results.push({
        endpoint: endpoint.path,
        name: endpoint.name,
        status: 0,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Main validation
 */
async function main() {
  const args = process.argv.slice(2);
  const stackName = args[0] || 'ChronasApiLambdaStackV2';
  const region = args[1] || 'eu-west-1';

  console.log('🔍 Lambda Deployment Validation');
  console.log(`Stack: ${stackName}`);
  console.log(`Region: ${region}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Get API endpoint
    console.log('📡 Discovering API Gateway endpoint...');
    const apiEndpoint = await getApiEndpoint(stackName, region);
    console.log(`✅ Found API endpoint: ${apiEndpoint}\n`);

    // Validate endpoints
    console.log('🧪 Validating API endpoints...');
    const results = await validateEndpoints(apiEndpoint);

    // Summary
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    
    console.log(`\n📊 Validation Summary:`);
    console.log(`Successful: ${successful}/${total}`);
    console.log(`API Endpoint: ${apiEndpoint}`);

    if (successful === total) {
      console.log('🎉 All validations passed! Lambda deployment is healthy.');
      process.exit(0);
    } else {
      console.log('❌ Some validations failed. Check the deployment.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { getApiEndpoint, validateEndpoints };