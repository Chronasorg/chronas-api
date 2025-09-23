#!/usr/bin/env node

/**
 * Test Environment Setup Script
 * 
 * Sets up the test environment for Postman automation
 * Creates test users, validates environment variables, and prepares test data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3001',
  testUser: {
    email: 'postman@aui.de',
    password: 'password123',
    username: 'postman-test-user',
    firstName: 'Postman',
    lastName: 'Test'
  }
};

/**
 * Check if server is running
 */
async function checkServer() {
  try {
    const response = await axios.get(`${TEST_CONFIG.baseUrl}/v1/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Create test user if it doesn't exist
 */
async function createTestUser() {
  try {
    console.log('🔧 Setting up test user...');
    
    // Check if user already exists
    try {
      const userResponse = await axios.get(`${TEST_CONFIG.baseUrl}/v1/users/${TEST_CONFIG.testUser.email}`);
      if (userResponse.status === 200) {
        console.log('✅ Test user already exists');
        return;
      }
    } catch (error) {
      // User doesn't exist, create it
    }

    // Create the test user
    const createResponse = await axios.post(`${TEST_CONFIG.baseUrl}/v1/users/`, {
      email: TEST_CONFIG.testUser.email,
      password: TEST_CONFIG.testUser.password,
      username: TEST_CONFIG.testUser.username,
      firstName: TEST_CONFIG.testUser.firstName,
      lastName: TEST_CONFIG.testUser.lastName
    });

    if (createResponse.status === 200 || createResponse.status === 201) {
      console.log('✅ Test user created successfully');
    } else {
      console.log('⚠️ Test user creation returned unexpected status:', createResponse.status);
    }
  } catch (error) {
    console.log('⚠️ Could not create test user (this may be expected):', error.message);
  }
}

/**
 * Validate environment files
 */
function validateEnvironments() {
  console.log('🔍 Validating Postman environment files...');
  
  const environments = [
    'PostmanTests/chronas-local.postman_environment.json',
    'PostmanTests/chronas-dev.postman_environment.json',
    'PostmanTests/chronas-api.postman_environment.json'
  ];

  let allValid = true;

  environments.forEach(envFile => {
    const fullPath = path.resolve(__dirname, '..', envFile);
    if (fs.existsSync(fullPath)) {
      try {
        const env = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        console.log(`✅ ${envFile} - Valid`);
        
        // Check for required variables
        const values = env.values || [];
        const hasBaseUrl = values.some(v => v.key === 'baseUrl');
        if (!hasBaseUrl) {
          console.log(`⚠️ ${envFile} - Missing baseUrl variable`);
        }
      } catch (error) {
        console.log(`❌ ${envFile} - Invalid JSON:`, error.message);
        allValid = false;
      }
    } else {
      console.log(`❌ ${envFile} - File not found`);
      allValid = false;
    }
  });

  return allValid;
}

/**
 * Validate collections
 */
function validateCollections() {
  console.log('🔍 Validating Postman collection files...');
  
  const collections = [
    'PostmanTests/chronas-enhanced.postman_collection.json',
    'PostmanTests/chronas.postman_collection.json'
  ];

  let allValid = true;

  collections.forEach(collectionFile => {
    const fullPath = path.resolve(__dirname, '..', collectionFile);
    if (fs.existsSync(fullPath)) {
      try {
        const collection = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const itemCount = collection.item ? collection.item.length : 0;
        console.log(`✅ ${collectionFile} - Valid (${itemCount} test groups)`);
      } catch (error) {
        console.log(`❌ ${collectionFile} - Invalid JSON:`, error.message);
        allValid = false;
      }
    } else {
      console.log(`❌ ${collectionFile} - File not found`);
      allValid = false;
    }
  });

  return allValid;
}

/**
 * Create results directory
 */
function createResultsDirectory() {
  const resultsDir = path.resolve(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
    console.log('📁 Created test-results directory');
  } else {
    console.log('📁 Test-results directory already exists');
  }
}

/**
 * Main setup function
 */
async function main() {
  console.log('🚀 Setting up Postman test environment...\n');

  // Validate files
  const environmentsValid = validateEnvironments();
  const collectionsValid = validateCollections();

  if (!environmentsValid || !collectionsValid) {
    console.error('\n❌ Environment setup failed - missing or invalid files');
    process.exit(1);
  }

  // Create results directory
  createResultsDirectory();

  // Check if server is running for local setup
  const serverRunning = await checkServer();
  if (serverRunning) {
    console.log('✅ Server is running - setting up test data...');
    await createTestUser();
  } else {
    console.log('⚠️ Server is not running - skipping test data setup');
    console.log('   Run "npm start" in another terminal to start the server');
  }

  console.log('\n✅ Test environment setup complete!');
  console.log('\nAvailable test commands:');
  console.log('  npm run test:postman          - Run enhanced tests with auto server start');
  console.log('  npm run test:postman:basic    - Run basic tests with auto server start');
  console.log('  npm run test:postman:dev      - Run tests against dev environment');
  console.log('  npm run test:postman:prod     - Run tests against production environment');
  console.log('  npm run test:postman:manual   - Run tests manually (server must be running)');
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { createTestUser, validateEnvironments, validateCollections };