#!/usr/bin/env node

/**
 * Deployment Test Script
 * 
 * Tests the key components needed for GitHub Actions deployment
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🚀 Testing Deployment Components...\n');

// Test results
let passed = 0;
let failed = 0;

function testResult(success, message, details = null) {
  const icon = success ? '✅' : '❌';
  console.log(`${icon} ${message}`);
  
  if (details) {
    console.log(`   ${details}`);
  }
  
  if (success) {
    passed++;
  } else {
    failed++;
  }
}

// Test 1: Check if package.json has required scripts
function testPackageScripts() {
  console.log('📦 Testing Package Scripts:');
  
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const requiredScripts = ['test', 'test:integration', 'build:lambda', 'test:postman'];
  
  requiredScripts.forEach(script => {
    const exists = packageJson.scripts && packageJson.scripts[script];
    testResult(exists, `Script '${script}' available`);
  });
}

// Test 2: Check CDK structure
function testCDKStructure() {
  console.log('\n🏗️  Testing CDK Structure:');
  
  const cdkPath = path.resolve(projectRoot, '..', 'chronas-cdk');
  const cdkExists = fs.existsSync(cdkPath);
  testResult(cdkExists, 'CDK directory exists');
  
  if (cdkExists) {
    const cdkPackage = path.join(cdkPath, 'package.json');
    const packageExists = fs.existsSync(cdkPackage);
    testResult(packageExists, 'CDK package.json exists');
    
    const cdkLib = path.join(cdkPath, 'lib');
    const libExists = fs.existsSync(cdkLib);
    testResult(libExists, 'CDK lib directory exists');
  }
}

// Test 3: Check GitHub Actions workflow
function testWorkflow() {
  console.log('\n⚙️  Testing GitHub Actions Workflow:');
  
  const workflowPath = path.join(projectRoot, '.github', 'workflows', 'deploy.yml');
  const workflowExists = fs.existsSync(workflowPath);
  testResult(workflowExists, 'GitHub Actions workflow exists');
  
  if (workflowExists) {
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Check for key workflow components
    const hasTest = workflowContent.includes('npm test');
    testResult(hasTest, 'Workflow includes test step');
    
    const hasBuild = workflowContent.includes('build:lambda');
    testResult(hasBuild, 'Workflow includes build step');
    
    const hasCDK = workflowContent.includes('cdk deploy');
    testResult(hasCDK, 'Workflow includes CDK deployment');
    
    const hasPostman = workflowContent.includes('test:postman');
    testResult(hasPostman, 'Workflow includes Postman tests');
  }
}

// Test 4: Check environment files
function testEnvironmentFiles() {
  console.log('\n🌍 Testing Environment Configuration:');
  
  const envExample = path.join(projectRoot, '.env.example');
  testResult(fs.existsSync(envExample), '.env.example exists');
  
  const envTest = path.join(projectRoot, '.env.test');
  testResult(fs.existsSync(envTest), '.env.test exists');
}

// Test 5: Check Postman files
function testPostmanFiles() {
  console.log('\n🧪 Testing Postman Configuration:');
  
  const postmanDir = path.join(projectRoot, 'PostmanTests');
  testResult(fs.existsSync(postmanDir), 'PostmanTests directory exists');
  
  if (fs.existsSync(postmanDir)) {
    const collection = path.join(postmanDir, 'chronas-enhanced.postman_collection.json');
    testResult(fs.existsSync(collection), 'Enhanced Postman collection exists');
    
    const localEnv = path.join(postmanDir, 'chronas-local.postman_environment.json');
    testResult(fs.existsSync(localEnv), 'Local environment file exists');
    
    const devEnv = path.join(postmanDir, 'chronas-dev.postman_environment.json');
    testResult(fs.existsSync(devEnv), 'Dev environment file exists');
  }
}

// Test 6: Check secrets documentation
function testDocumentation() {
  console.log('\n📚 Testing Documentation:');
  
  const secretsDoc = path.join(projectRoot, '.github', 'SECRETS.md');
  testResult(fs.existsSync(secretsDoc), 'Secrets documentation exists');
  
  const githubReadme = path.join(projectRoot, '.github', 'README.md');
  testResult(fs.existsSync(githubReadme), 'GitHub Actions README exists');
}

// Run all tests
async function runTests() {
  testPackageScripts();
  testCDKStructure();
  testWorkflow();
  testEnvironmentFiles();
  testPostmanFiles();
  testDocumentation();
  
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All deployment components are ready!');
    console.log('\n🚀 Next Steps:');
    console.log('1. Configure GitHub Secrets (see .github/SECRETS.md)');
    console.log('2. Set up GitHub Environments (development, production)');
    console.log('3. Push to feature/modernize-api branch to test deployment');
    console.log('4. Merge to main branch for production deployment');
  } else {
    console.log('\n❌ Some components need attention before deployment.');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('❌ Test script failed:', error.message);
  process.exit(1);
});