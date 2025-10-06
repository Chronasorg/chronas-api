#!/usr/bin/env node

/**
 * Automated Lambda Deployment Script
 * 
 * This script automates the deployment of the Chronas API to AWS Lambda
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

// Configuration
const config = {
  environments: {
    dev: {
      profile: 'chronas-dev',
      region: 'eu-west-1',
      stackName: 'ChronasApiLambdaStackV2'
    },
    prod: {
      profile: 'chronas-prod', 
      region: 'eu-west-1',
      stackName: 'ChronasApiLambdaStackV2'
    }
  }
};

console.log('🚀 Chronas API Lambda Deployment Script\n');

// Parse command line arguments
const args = process.argv.slice(2);
const environment = args[0] || 'dev';
const skipTests = args.includes('--skip-tests');
const skipBuild = args.includes('--skip-build');
const dryRun = args.includes('--dry-run');

if (!config.environments[environment]) {
  console.error(`❌ Invalid environment: ${environment}`);
  console.error(`Available environments: ${Object.keys(config.environments).join(', ')}`);
  process.exit(1);
}

const envConfig = config.environments[environment];

console.log(`📋 Deployment Configuration:`);
console.log(`   Environment: ${environment}`);
console.log(`   AWS Profile: ${envConfig.profile}`);
console.log(`   AWS Region: ${envConfig.region}`);
console.log(`   Stack Name: ${envConfig.stackName}`);
console.log(`   Skip Tests: ${skipTests}`);
console.log(`   Skip Build: ${skipBuild}`);
console.log(`   Dry Run: ${dryRun}\n`);

// Utility functions
function runCommand(command, cwd = projectRoot, description = '') {
  if (description) {
    console.log(`🔄 ${description}...`);
  }
  
  try {
    const result = execSync(command, { 
      cwd, 
      stdio: 'inherit',
      env: { 
        ...process.env, 
        AWS_PROFILE: envConfig.profile,
        AWS_DEFAULT_REGION: envConfig.region
      }
    });
    return result;
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function checkPrerequisites() {
  console.log('🔍 Checking Prerequisites...\n');
  
  // Check if CDK directory exists
  if (!fs.existsSync(cdkRoot)) {
    console.error(`❌ CDK directory not found: ${cdkRoot}`);
    process.exit(1);
  }
  console.log('✅ CDK directory found');
  
  // Check if package.json exists
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) {
    console.error(`❌ package.json not found: ${packagePath}`);
    process.exit(1);
  }
  console.log('✅ package.json found');
  
  // Check AWS CLI
  try {
    execSync('aws --version', { stdio: 'pipe' });
    console.log('✅ AWS CLI available');
  } catch (error) {
    console.error('❌ AWS CLI not found');
    process.exit(1);
  }
  
  // Check CDK CLI
  try {
    execSync('npx cdk --version', { stdio: 'pipe', cwd: cdkRoot });
    console.log('✅ CDK CLI available');
  } catch (error) {
    console.error('❌ CDK CLI not found');
    process.exit(1);
  }
  
  // Check AWS credentials
  try {
    execSync(`aws sts get-caller-identity --profile ${envConfig.profile}`, { stdio: 'pipe' });
    console.log(`✅ AWS credentials valid for profile: ${envConfig.profile}`);
  } catch (error) {
    console.error(`❌ AWS credentials invalid for profile: ${envConfig.profile}`);
    process.exit(1);
  }
  
  console.log('');
}

function runTests() {
  if (skipTests) {
    console.log('⏭️  Skipping tests (--skip-tests flag)\n');
    return;
  }
  
  console.log('🧪 Running Tests...\n');
  
  // Run unit tests
  runCommand('npm test', projectRoot, 'Running unit tests');
  
  // Run integration tests
  runCommand('npm run test:integration', projectRoot, 'Running integration tests');
  
  console.log('✅ All tests passed!\n');
}

function buildApplication() {
  if (skipBuild) {
    console.log('⏭️  Skipping build (--skip-build flag)\n');
    return;
  }
  
  console.log('🔨 Building Application...\n');
  
  // Install dependencies
  runCommand('npm ci', projectRoot, 'Installing dependencies');
  
  // Run any build scripts
  runCommand('npm run build', projectRoot, 'Building application');
  
  console.log('✅ Application built successfully!\n');
}

function buildCDK() {
  console.log('🏗️  Building CDK...\n');
  
  // Install CDK dependencies
  runCommand('npm ci', cdkRoot, 'Installing CDK dependencies');
  
  // Build CDK
  runCommand('npm run build', cdkRoot, 'Building CDK TypeScript');
  
  console.log('✅ CDK built successfully!\n');
}

function deployCDK() {
  console.log('🚀 Deploying to AWS Lambda...\n');
  
  if (dryRun) {
    console.log('🔍 Dry run - showing what would be deployed:');
    runCommand(
      `npx cdk diff ${envConfig.stackName} --profile ${envConfig.profile}`,
      cdkRoot,
      'Showing deployment diff'
    );
    console.log('✅ Dry run completed - no actual deployment performed\n');
    return;
  }
  
  // Deploy the Lambda stack
  runCommand(
    `npx cdk deploy ${envConfig.stackName} --require-approval never --profile ${envConfig.profile}`,
    cdkRoot,
    `Deploying ${envConfig.stackName} to ${environment}`
  );
  
  console.log('✅ Deployment completed successfully!\n');
}

function validateDeployment() {
  if (dryRun) {
    console.log('⏭️  Skipping validation (dry run mode)\n');
    return;
  }
  
  console.log('🔍 Validating Deployment...\n');
  
  // Get stack outputs
  try {
    const outputs = execSync(
      `aws cloudformation describe-stacks --stack-name ${envConfig.stackName} --profile ${envConfig.profile} --region ${envConfig.region} --query "Stacks[0].Outputs" --output json`,
      { encoding: 'utf8' }
    );
    
    const stackOutputs = JSON.parse(outputs);
    console.log('📋 Stack Outputs:');
    stackOutputs.forEach(output => {
      console.log(`   ${output.OutputKey}: ${output.OutputValue}`);
    });
    console.log('');
    
    // Try to get the API Gateway URL from the API Gateway stack
    try {
      const apiOutputs = execSync(
        `aws cloudformation describe-stacks --stack-name ApiGatewayStackV2 --profile ${envConfig.profile} --region ${envConfig.region} --query "Stacks[0].Outputs" --output json`,
        { encoding: 'utf8' }
      );
      
      const apiStackOutputs = JSON.parse(apiOutputs);
      const apiUrl = apiStackOutputs.find(output => output.OutputKey.includes('Url') || output.OutputKey.includes('Endpoint'));
      
      if (apiUrl) {
        console.log(`🌐 API Endpoint: ${apiUrl.OutputValue}`);
        
        // Test the health endpoint
        try {
          const healthCheck = execSync(`curl -s "${apiUrl.OutputValue}/v1/health"`, { encoding: 'utf8' });
          console.log('✅ Health check passed');
          console.log(`   Response: ${healthCheck.substring(0, 100)}...`);
        } catch (error) {
          console.log('⚠️  Health check failed (this might be normal if API Gateway is still warming up)');
        }
      }
    } catch (error) {
      console.log('⚠️  Could not retrieve API Gateway information');
    }
    
  } catch (error) {
    console.error('❌ Could not validate deployment');
    console.error(error.message);
  }
  
  console.log('');
}

function runPostmanTests() {
  if (dryRun || skipTests) {
    console.log('⏭️  Skipping Postman tests\n');
    return;
  }
  
  console.log('🧪 Running Post-Deployment Tests...\n');
  
  try {
    // Run Postman tests against the deployed API
    runCommand(`npm run test:postman:${environment}`, projectRoot, 'Running Postman API tests');
    console.log('✅ Post-deployment tests passed!\n');
  } catch (error) {
    console.log('⚠️  Post-deployment tests failed (API might still be warming up)');
    console.log('   You can run tests manually later with: npm run test:postman:' + environment);
    console.log('');
  }
}

function showSummary() {
  console.log('📊 Deployment Summary:\n');
  console.log(`✅ Environment: ${environment}`);
  console.log(`✅ Stack: ${envConfig.stackName}`);
  console.log(`✅ Region: ${envConfig.region}`);
  console.log(`✅ Profile: ${envConfig.profile}`);
  
  if (!dryRun) {
    console.log('\n🎉 Deployment completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Check AWS Lambda console for function status');
    console.log('2. Monitor CloudWatch logs for any issues');
    console.log('3. Test API endpoints manually if needed');
    console.log('4. Run additional Postman tests if they failed');
  } else {
    console.log('\n🔍 Dry run completed - no actual deployment performed');
  }
  
  console.log('\n🔗 Useful Commands:');
  console.log(`   View logs: aws logs tail /aws/lambda/ChronasApiLambdaStackV2-ChronasApiLambdaFunction --follow --profile ${envConfig.profile}`);
  console.log(`   Test API: npm run test:postman:${environment}`);
  console.log(`   Rollback: npx cdk deploy ${envConfig.stackName} --profile ${envConfig.profile} (with previous version)`);
}

// Main deployment flow
async function main() {
  try {
    checkPrerequisites();
    runTests();
    buildApplication();
    buildCDK();
    deployCDK();
    validateDeployment();
    runPostmanTests();
    showSummary();
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Show usage if help requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: npm run deploy:lambda [environment] [options]

Environments:
  dev     Deploy to development environment (default)
  prod    Deploy to production environment

Options:
  --skip-tests     Skip running tests before deployment
  --skip-build     Skip building the application
  --dry-run        Show what would be deployed without actually deploying
  --help, -h       Show this help message

Examples:
  npm run deploy:lambda                    # Deploy to dev
  npm run deploy:lambda dev                # Deploy to dev
  npm run deploy:lambda prod               # Deploy to prod
  npm run deploy:lambda dev --skip-tests   # Deploy to dev without tests
  npm run deploy:lambda prod --dry-run     # Show what would be deployed to prod

Environment Configuration:
  dev:  Uses chronas-dev AWS profile, eu-west-1 region
  prod: Uses chronas-prod AWS profile, eu-west-1 region

Prerequisites:
  - AWS CLI installed and configured
  - CDK CLI available (npx cdk)
  - AWS profiles configured (chronas-dev, chronas-prod)
  - Node.js 22.x and npm installed
`);
  process.exit(0);
}

// Run the deployment
main();