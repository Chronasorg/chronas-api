#!/usr/bin/env node

/**
 * Test Environment Setup Script
 *
 * Validates that the Postman collections and environment files are present
 * and parseable, and creates the `test-results/` directory used by the
 * Newman runner.
 *
 * There is no local API server to seed or talk to — the API is DynamoDB-only
 * and Postman tests now run against the deployed dev/prod environments only.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validate environment files
 */
function validateEnvironments() {
  console.log('🔍 Validating Postman environment files...');

  const environments = [
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

  const environmentsValid = validateEnvironments();
  const collectionsValid = validateCollections();

  if (!environmentsValid || !collectionsValid) {
    console.error('\n❌ Environment setup failed - missing or invalid files');
    process.exit(1);
  }

  createResultsDirectory();

  console.log('\n✅ Test environment setup complete!');
  console.log('\nAvailable test commands:');
  console.log('  npm run test:postman:dev      - Run tests against dev environment');
  console.log('  npm run test:postman:prod     - Run tests against production environment');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { validateEnvironments, validateCollections };
