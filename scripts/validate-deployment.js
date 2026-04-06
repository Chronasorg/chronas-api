#!/usr/bin/env node

/**
 * Deployment Validation Script
 * 
 * Validates that all components are ready for Lambda deployment
 * using the existing ChronasApiLambaStack CDK infrastructure.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const cdkRoot = path.resolve(projectRoot, '..', 'chronas-cdk');

console.log('🔍 Validating Lambda Deployment Readiness...\n');

// Validation results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  issues: []
};

function logResult(status, message, details = null) {
  const icons = { pass: '✅', fail: '❌', warn: '⚠️' };
  console.log(`${icons[status]} ${message}`);
  
  if (details) {
    console.log(`   ${details}`);
  }
  
  results[status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : 'warnings']++;
  
  if (status === 'fail') {
    results.issues.push(message);
  }
}

// Check project structure
function checkProjectStructure() {
  console.log('📁 Checking Project Structure:\n');
  
  // Check chronas-api directory
  if (fs.existsSync(projectRoot)) {
    logResult('pass', 'chronas-api directory exists');
  } else {
    logResult('fail', 'chronas-api directory not found');
    return false;
  }
  
  // Check chronas-cdk directory
  if (fs.existsSync(cdkRoot)) {
    logResult('pass', 'chronas-cdk directory exists');
  } else {
    logResult('fail', 'chronas-cdk directory not found');
    return false;
  }
  
  // Check lambda handler
  const lambdaHandler = path.join(projectRoot, 'lambda-handler.js');
  if (fs.existsSync(lambdaHandler)) {
    logResult('pass', 'Lambda handler exists');
  } else {
    logResult('fail', 'Lambda handler (lambda-handler.js) not found');
  }
  
  // Check package.json
  const packageJson = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJson)) {
    logResult('pass', 'package.json exists');
    
    // Check Node.js version
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    if (pkg.engines && pkg.engines.node && pkg.engines.node.includes('22')) {
      logResult('pass', `Node.js version requirement: ${pkg.engines.node}`);
    } else {
      logResult('warn', 'Node.js version not specified or not 22.x');
    }
  } else {
    logResult('fail', 'package.json not found');
  }
  
  return true;
}

// Check CDK configuration
function checkCDKConfiguration() {
  console.log('\n🏗️  Checking CDK Configuration:\n');
  
  // Check CDK package.json
  const cdkPackage = path.join(cdkRoot, 'package.json');
  if (fs.existsSync(cdkPackage)) {
    logResult('pass', 'CDK package.json exists');
  } else {
    logResult('fail', 'CDK package.json not found');
    return false;
  }
  
  // Check Lambda stack file
  const lambdaStack = path.join(cdkRoot, 'lib', 'chronas-api-lambda-stack.ts');
  if (fs.existsSync(lambdaStack)) {
    logResult('pass', 'Lambda stack definition exists');
    
    // Check if it uses Node.js 22.x
    const stackContent = fs.readFileSync(lambdaStack, 'utf8');
    if (stackContent.includes('NODEJS_22_X')) {
      logResult('pass', 'Lambda stack uses Node.js 22.x runtime');
    } else {
      logResult('warn', 'Lambda stack may not use Node.js 22.x runtime');
    }
  } else {
    logResult('fail', 'Lambda stack definition not found');
  }
  
  // Check main CDK app
  const cdkApp = path.join(cdkRoot, 'bin', 'chronas-cdk.ts');
  if (fs.existsSync(cdkApp)) {
    logResult('pass', 'CDK app definition exists');
    
    // Check if Lambda stack is included
    const appContent = fs.readFileSync(cdkApp, 'utf8');
    if (appContent.includes('ChronasApiLambaStack')) {
      logResult('pass', 'Lambda stack is included in CDK app');
    } else {
      logResult('fail', 'Lambda stack not included in CDK app');
    }
  } else {
    logResult('fail', 'CDK app definition not found');
  }
  
  return true;
}

// Check AWS CLI and credentials
function checkAWSConfiguration() {
  console.log('\n☁️  Checking AWS Configuration:\n');
  
  // Check AWS CLI
  try {
    execSync('aws --version', { stdio: 'pipe' });
    logResult('pass', 'AWS CLI is available');
  } catch (error) {
    logResult('fail', 'AWS CLI not found');
    return false;
  }
  
  // Check CDK CLI
  try {
    execSync('npx cdk --version', { stdio: 'pipe', cwd: cdkRoot });
    logResult('pass', 'CDK CLI is available');
  } catch (error) {
    logResult('fail', 'CDK CLI not found');
    return false;
  }
  
  // Check AWS profiles
  const profiles = ['chronas-dev', 'chronas-prod'];
  profiles.forEach(profile => {
    try {
      execSync(`aws sts get-caller-identity --profile ${profile}`, { stdio: 'pipe' });
      logResult('pass', `AWS profile '${profile}' is configured and valid`);
    } catch (error) {
      logResult('warn', `AWS profile '${profile}' not configured or invalid`);
    }
  });
  
  return true;
}

// Check deployment scripts
function checkDeploymentScripts() {
  console.log('\n📜 Checking Deployment Scripts:\n');
  
  // Check deployment script
  const deployScript = path.join(projectRoot, 'scripts', 'deploy-lambda.js');
  if (fs.existsSync(deployScript)) {
    logResult('pass', 'Lambda deployment script exists');
  } else {
    logResult('fail', 'Lambda deployment script not found');
  }
  
  // Check package.json scripts
  const packageJson = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJson)) {
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    
    const requiredScripts = [
      'test',
      'test:integration', 
      'deploy:lambda',
      'deploy:lambda:dev',
      'deploy:lambda:prod'
    ];
    
    requiredScripts.forEach(script => {
      if (pkg.scripts && pkg.scripts[script]) {
        logResult('pass', `Script '${script}' is defined`);
      } else {
        logResult('fail', `Required script '${script}' is missing`);
      }
    });
  }
  
  return true;
}

// Check test configuration
function checkTestConfiguration() {
  console.log('\n🧪 Checking Test Configuration:\n');
  
  // Check test directories
  const testDirs = [
    path.join(projectRoot, 'server', 'tests'),
    path.join(projectRoot, 'PostmanTests')
  ];
  
  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      logResult('pass', `Test directory exists: ${path.basename(dir)}`);
    } else {
      logResult('warn', `Test directory missing: ${path.basename(dir)}`);
    }
  });
  
  // Check Postman collection
  const postmanCollection = path.join(projectRoot, 'PostmanTests', 'chronas-enhanced.postman_collection.json');
  if (fs.existsSync(postmanCollection)) {
    logResult('pass', 'Postman test collection exists');
  } else {
    logResult('warn', 'Postman test collection not found');
  }
  
  // Check environment files
  const envFiles = [
    path.join(projectRoot, 'PostmanTests', 'chronas-dev.postman_environment.json'),
    path.join(projectRoot, 'PostmanTests', 'chronas-local.postman_environment.json')
  ];
  
  envFiles.forEach(file => {
    if (fs.existsSync(file)) {
      logResult('pass', `Environment file exists: ${path.basename(file)}`);
    } else {
      logResult('warn', `Environment file missing: ${path.basename(file)}`);
    }
  });
  
  return true;
}

// Check dependencies
function checkDependencies() {
  console.log('\n📦 Checking Dependencies:\n');
  
  // Check if node_modules exists
  const nodeModules = path.join(projectRoot, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    logResult('pass', 'Node modules installed');
  } else {
    logResult('warn', 'Node modules not installed - run npm install');
  }
  
  // Check CDK node_modules
  const cdkNodeModules = path.join(cdkRoot, 'node_modules');
  if (fs.existsSync(cdkNodeModules)) {
    logResult('pass', 'CDK node modules installed');
  } else {
    logResult('warn', 'CDK node modules not installed - run npm install in chronas-cdk');
  }
  
  return true;
}

// Main validation function
async function validateDeployment() {
  checkProjectStructure();
  checkCDKConfiguration();
  checkAWSConfiguration();
  checkDeploymentScripts();
  checkTestConfiguration();
  checkDependencies();
  
  console.log('\n📊 Validation Summary:');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  
  if (results.failed > 0) {
    console.log('\n🚨 Critical Issues Found:');
    results.issues.forEach(issue => {
      console.log(`   • ${issue}`);
    });
    console.log('\n❌ Deployment validation failed. Please fix the issues above.');
    console.log('\n🔧 Common Solutions:');
    console.log('   • Run: npm install (in both chronas-api and chronas-cdk)');
    console.log('   • Configure AWS profiles: aws configure --profile chronas-dev');
    console.log('   • Install AWS CLI: https://aws.amazon.com/cli/');
    console.log('   • Install CDK: npm install -g aws-cdk');
    process.exit(1);
  } else if (results.warnings > 0) {
    console.log('\n⚠️  Warnings found, but deployment should work.');
    console.log('✅ Deployment validation passed with warnings.');
    console.log('\n🚀 Ready to deploy! Run:');
    console.log('   npm run deploy:lambda:dev     # Deploy to development');
    console.log('   npm run deploy:lambda:prod    # Deploy to production');
    console.log('   npm run deploy:lambda --help  # Show all options');
  } else {
    console.log('\n🎉 All checks passed! Deployment is ready.');
    console.log('\n🚀 Ready to deploy! Run:');
    console.log('   npm run deploy:lambda:dev     # Deploy to development');
    console.log('   npm run deploy:lambda:prod    # Deploy to production');
    console.log('   npm run deploy:lambda --help  # Show all options');
  }
}

// Only run when executed directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  validateDeployment().catch(error => {
    console.error('❌ Validation script failed:', error.message);
    process.exit(1);
  });
}

export { validateDeployment };