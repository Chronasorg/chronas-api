#!/usr/bin/env node

/**
 * Application Configuration Update Script
 * 
 * This script updates the application configuration to use the new
 * modernized DocumentDB cluster after successful data migration.
 */

import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { LambdaClient, UpdateFunctionConfigurationCommand } from '@aws-sdk/client-lambda';

const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-west-1' });
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'eu-west-1' });

/**
 * Get secret value from AWS Secrets Manager
 */
async function getSecret(secretName) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManager.send(command);
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}:`, error.message);
    throw error;
  }
}

/**
 * Update secret value in AWS Secrets Manager
 */
async function updateSecret(secretName, secretValue) {
  try {
    const command = new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(secretValue, null, 2)
    });
    
    await secretsManager.send(command);
    console.log(`✅ Updated secret: ${secretName}`);
  } catch (error) {
    console.error(`Error updating secret ${secretName}:`, error.message);
    throw error;
  }
}

/**
 * Update Lambda function environment variables
 */
async function updateLambdaConfig(functionName, environmentVariables) {
  try {
    const command = new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Environment: {
        Variables: environmentVariables
      }
    });
    
    await lambda.send(command);
    console.log(`✅ Updated Lambda function: ${functionName}`);
  } catch (error) {
    console.error(`Error updating Lambda function ${functionName}:`, error.message);
    throw error;
  }
}

/**
 * Update application database configuration
 */
async function updateApplicationConfig(options) {
  const {
    appSecretName,
    newDbSecretName,
    lambdaFunctionName,
    dryRun = false,
    createBackup = true
  } = options;
  
  console.log('🔄 Starting application configuration update...');
  console.log(`   App Secret: ${appSecretName}`);
  console.log(`   New DB Secret: ${newDbSecretName}`);
  console.log(`   Lambda Function: ${lambdaFunctionName}`);
  console.log(`   Dry Run: ${dryRun}\n`);
  
  try {
    // Get new database credentials
    console.log('🔐 Retrieving new database credentials...');
    const newDbCredentials = await getSecret(newDbSecretName);
    
    // Get current application configuration
    console.log('📋 Retrieving current application configuration...');
    const currentAppConfig = await getSecret(appSecretName);
    
    // Update application configuration with new database settings
    const updatedAppConfig = {
      ...currentAppConfig,
      database: {
        ...currentAppConfig.database,
        host: newDbCredentials.host,
        port: newDbCredentials.port,
        username: newDbCredentials.username,
        password: newDbCredentials.password,
        dbname: newDbCredentials.dbname,
        // Add modernized cluster specific settings
        engine: 'docdb-5.0',
        tls: true,
        tlsCAFile: '/opt/rds-ca-2019-root.pem',
        retryWrites: false,
        // Connection pool settings optimized for Lambda
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 3000
      },
      migration: {
        timestamp: new Date().toISOString(),
        fromCluster: currentAppConfig.database?.host || 'unknown',
        toCluster: newDbCredentials.host
      }
    };
    
    if (dryRun) {
      console.log('\n🔍 DRY RUN - Configuration changes that would be made:');
      console.log(`   Host: ${currentAppConfig.database?.host} → ${newDbCredentials.host}`);
      console.log(`   Port: ${currentAppConfig.database?.port} → ${newDbCredentials.port}`);
      console.log(`   Engine: ${currentAppConfig.database?.engine || 'docdb-3.6'} → docdb-5.0`);
      return { success: true, dryRun: true };
    }
    
    // Update application secret
    console.log('🔄 Updating application configuration...');
    await updateSecret(appSecretName, updatedAppConfig);
    
    // Update Lambda function environment variables
    if (lambdaFunctionName) {
      console.log('🔄 Updating Lambda function configuration...');
      
      const lambdaEnvVars = {
        SECRET_DB_NAME: newDbSecretName,
        SECRET_CONFIG_NAME: appSecretName,
        NODE_ENV: 'production',
        DEBUG: 'chronas-api:*',
        MIGRATION_TIMESTAMP: new Date().toISOString(),
        DB_ENGINE_VERSION: 'docdb-5.0'
      };
      
      await updateLambdaConfig(lambdaFunctionName, lambdaEnvVars);
    }
    
    console.log('\n✅ Application configuration update completed successfully!');
    
    return {
      success: true,
      appSecretName,
      newDbEndpoint: newDbCredentials.host,
      lambdaFunctionName,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('\n❌ Configuration update failed:', error);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  const options = {
    appSecretName: process.env.APP_SECRET_NAME || '/chronas/config',
    newDbSecretName: process.env.NEW_DB_SECRET_NAME || '/chronas/docdb/newpassword-modernized',
    lambdaFunctionName: process.env.LAMBDA_FUNCTION_NAME || 'ChronasApiLambdaStack-ChronasApiLambdaFunction',
    dryRun: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
    createBackup: process.env.CREATE_BACKUP !== 'false'
  };
  
  try {
    await updateApplicationConfig(options);
    console.log('\n🎉 Configuration update process completed successfully!');
  } catch (error) {
    console.error('\n❌ Configuration update process failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { updateApplicationConfig };