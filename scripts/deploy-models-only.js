#!/usr/bin/env node

/**
 * Quick Model Update Script
 * 
 * Updates only the model files in the deployed Lambda function
 * without doing a full CDK deployment
 */

import { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { fromIni } from '@aws-sdk/credential-providers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AWS Configuration
const AWS_CONFIG = {
  region: 'eu-west-1',
  credentials: fromIni({ profile: 'chronas-dev' })
};

// Lambda function name (from the CDK stack)
const LAMBDA_FUNCTION_NAME = 'ChronasApiLambdaStackV2-ChronasApiLambdaFunction7C-b5U4C0YDGKS5';

/**
 * Create a minimal zip package with just the updated models
 */
async function createMinimalPackage() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream('/tmp/lambda-models-update.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ Package created: ${archive.pointer()} bytes`);
      resolve('/tmp/lambda-models-update.zip');
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Add only the essential files
    const basePath = path.resolve(__dirname, '..');
    
    // Add updated models
    archive.file(path.join(basePath, 'server/models/user.model.js'), { name: 'server/models/user.model.js' });
    archive.file(path.join(basePath, 'server/models/marker.model.js'), { name: 'server/models/marker.model.js' });
    
    // Add the main handler and config files
    archive.file(path.join(basePath, 'lambda-handler.js'), { name: 'lambda-handler.js' });
    archive.file(path.join(basePath, 'index.js'), { name: 'index.js' });
    
    // Add essential config files
    archive.file(path.join(basePath, 'config/database.js'), { name: 'config/database.js' });
    archive.file(path.join(basePath, 'config/secrets-manager.js'), { name: 'config/secrets-manager.js' });
    
    // Add package.json for dependencies
    archive.file(path.join(basePath, 'package.json'), { name: 'package.json' });

    archive.finalize();
  });
}

/**
 * Update Lambda function code
 */
async function updateLambdaCode() {
  try {
    console.log('🚀 Updating Lambda function code...');
    
    const lambda = new LambdaClient(AWS_CONFIG);
    
    // Create minimal package
    const packagePath = await createMinimalPackage();
    const zipBuffer = fs.readFileSync(packagePath);
    
    // Update function code
    const updateCommand = new UpdateFunctionCodeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      ZipFile: zipBuffer
    });
    
    const result = await lambda.send(updateCommand);
    console.log('✅ Lambda function updated successfully');
    console.log(`   Function ARN: ${result.FunctionArn}`);
    console.log(`   Last Modified: ${result.LastModified}`);
    
    // Clean up
    fs.unlinkSync(packagePath);
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to update Lambda function:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🔧 Quick Lambda model update starting...\n');
    
    await updateLambdaCode();
    
    console.log('\n✅ Lambda function updated successfully!');
    console.log('🧪 You can now test the API endpoints');
    
  } catch (error) {
    console.error('\n❌ Update failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}