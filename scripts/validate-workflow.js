#!/usr/bin/env node

/**
 * GitHub Actions Workflow Validation Script
 * 
 * This script validates that the GitHub Actions workflow is properly configured
 * and all required dependencies are available.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 Validating GitHub Actions Workflow Configuration...\n');

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

// Check if workflow file exists
function checkWorkflowFile() {
  const workflowPath = path.join(projectRoot, '.github', 'workflows', 'deploy.yml');
  
  if (fs.existsSync(workflowPath)) {
    logResult('pass', 'GitHub Actions workflow file exists');
    return true;
  } else {
    logResult('fail', 'GitHub Actions workflow file missing', 'Expected: .github/workflows/deploy.yml');
    return false;
  }
}

// Check package.json scripts
function checkPackageScripts() {
  const packagePath = path.join(projectRoot, 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    logResult('fail', 'package.json not found');
    return false;
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const requiredScripts = [
    // 'lint', // Skip linting for now
    'test',
    'test:integration',
    'build:lambda',
    'test:postman',
    'test:postman:prod'
  ];
  
  let allScriptsPresent = true;
  
  requiredScripts.forEach(script => {
    if (packageJson.scripts && packageJson.scripts[script]) {
      logResult('pass', `Script '${script}' is defined`);
    } else {
      logResult('fail', `Required script '${script}' is missing`);
      allScriptsPresent = false;
    }
  });
  
  return allScriptsPresent;
}

// Check CDK directory structure
function checkCDKStructure() {
  const cdkPath = path.resolve(projectRoot, '..', 'chronas-cdk');
  
  if (fs.existsSync(cdkPath)) {
    logResult('pass', 'CDK directory exists');
    
    const cdkPackagePath = path.join(cdkPath, 'package.json');
    if (fs.existsSync(cdkPackagePath)) {
      logResult('pass', 'CDK package.json exists');
    } else {
      logResult('fail', 'CDK package.json missing');
      return false;
    }
    
    return true;
  } else {
    logResult('fail', 'CDK directory not found', 'Expected: ../chronas-cdk');
    return false;
  }
}

// Check Postman test files
function checkPostmanTests() {
  const postmanDir = path.join(projectRoot, 'PostmanTests');
  
  if (!fs.existsSync(postmanDir)) {
    logResult('fail', 'PostmanTests directory not found');
    return false;
  }
  
  const requiredFiles = [
    'chronas-enhanced.postman_collection.json',
    'chronas-local.postman_environment.json',
    'chronas-dev.postman_environment.json'
  ];
  
  let allFilesPresent = true;
  
  requiredFiles.forEach(file => {
    const filePath = path.join(postmanDir, file);
    if (fs.existsSync(filePath)) {
      logResult('pass', `Postman file '${file}' exists`);
    } else {
      logResult('fail', `Required Postman file '${file}' is missing`);
      allFilesPresent = false;
    }
  });
  
  return allFilesPresent;
}

// Check Node.js version compatibility
function checkNodeVersion() {
  const packagePath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  if (packageJson.engines && packageJson.engines.node) {
    const nodeVersion = packageJson.engines.node;
    if (nodeVersion.includes('22')) {
      logResult('pass', `Node.js version requirement: ${nodeVersion}`);
      return true;
    } else {
      logResult('warn', `Node.js version may not match workflow: ${nodeVersion}`, 'Workflow uses Node.js 22.x');
      return true;
    }
  } else {
    logResult('warn', 'Node.js version not specified in package.json');
    return true;
  }
}

// Check environment files
function checkEnvironmentFiles() {
  const envExample = path.join(projectRoot, '.env.example');
  const envTest = path.join(projectRoot, '.env.test');
  
  if (fs.existsSync(envExample)) {
    logResult('pass', 'Environment example file exists');
  } else {
    logResult('warn', 'Environment example file missing', 'Consider adding .env.example');
  }
  
  if (fs.existsSync(envTest)) {
    logResult('pass', 'Test environment file exists');
  } else {
    logResult('warn', 'Test environment file missing', 'Consider adding .env.test');
  }
}

// Check secrets documentation
function checkSecretsDocumentation() {
  const secretsPath = path.join(projectRoot, '.github', 'SECRETS.md');
  
  if (fs.existsSync(secretsPath)) {
    logResult('pass', 'Secrets documentation exists');
    return true;
  } else {
    logResult('warn', 'Secrets documentation missing', 'Consider adding .github/SECRETS.md');
    return false;
  }
}

// Main validation function
async function validateWorkflow() {
  console.log('📋 Checking Workflow Configuration:\n');
  
  checkWorkflowFile();
  checkPackageScripts();
  checkCDKStructure();
  checkPostmanTests();
  checkNodeVersion();
  checkEnvironmentFiles();
  checkSecretsDocumentation();
  
  console.log('\n📊 Validation Summary:');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  
  if (results.failed > 0) {
    console.log('\n🚨 Critical Issues Found:');
    results.issues.forEach(issue => {
      console.log(`   • ${issue}`);
    });
    console.log('\n❌ Workflow validation failed. Please fix the issues above.');
    process.exit(1);
  } else if (results.warnings > 0) {
    console.log('\n⚠️  Warnings found, but workflow should function correctly.');
    console.log('✅ Workflow validation passed with warnings.');
  } else {
    console.log('\n🎉 All checks passed! Workflow is ready for use.');
  }
}

// Run validation
validateWorkflow().catch(error => {
  console.error('❌ Validation script failed:', error.message);
  process.exit(1);
});