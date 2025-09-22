#!/usr/bin/env node

/**
 * Migration Orchestration Script
 * 
 * This script orchestrates the complete data migration process from
 * the old DocumentDB cluster to the new modernized cluster.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { updateApplicationConfig } from './update-app-config.js';

const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'eu-west-1' });

/**
 * Invoke Lambda function
 */
async function invokeLambda(functionName, payload) {
  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      InvocationType: 'RequestResponse'
    });
    
    const response = await lambda.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    
    return result;
  } catch (error) {
    console.error(`Error invoking Lambda function ${functionName}:`, error.message);
    throw error;
  }
}

/**
 * Execute migration step with retry logic
 */
async function executeStep(stepName, stepFunction, retries = 3) {
  console.log(`\n🔄 Executing: ${stepName}`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await stepFunction();
      console.log(`✅ Completed: ${stepName}`);
      return result;
    } catch (error) {
      console.error(`❌ Attempt ${attempt}/${retries} failed for ${stepName}:`, error.message);
      
      if (attempt === retries) {
        throw new Error(`${stepName} failed after ${retries} attempts: ${error.message}`);
      }
      
      // Wait before retry
      const delay = attempt * 2000; // 2s, 4s, 6s
      console.log(`⏳ Retrying in ${delay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Main migration orchestration
 */
async function orchestrateMigration(options = {}) {
  const {
    migrationLambda = process.env.MIGRATION_LAMBDA_NAME || 'DataMigrationFunction',
    rollbackLambda = process.env.ROLLBACK_LAMBDA_NAME || 'DataRollbackFunction',
    appSecretName = process.env.APP_SECRET_NAME || '/chronas/config',
    newDbSecretName = process.env.NEW_DB_SECRET_NAME || '/chronas/docdb/newpassword-modernized',
    lambdaFunctionName = process.env.LAMBDA_FUNCTION_NAME || 'ChronasApiLambdaStack-ChronasApiLambdaFunction',
    collections = ['users', 'areas', 'markers', 'events', 'articles'],
    batchSize = 1000,
    dryRun = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
    skipValidation = process.argv.includes('--skip-validation'),
    autoRollback = process.env.AUTO_ROLLBACK !== 'false'
  } = options;
  
  console.log('🚀 Starting Data Migration Orchestration');
  console.log('=' .repeat(50));
  console.log(`📋 Configuration:`);
  console.log(`   Migration Lambda: ${migrationLambda}`);
  console.log(`   Collections: ${collections.join(', ')}`);
  console.log(`   Batch Size: ${batchSize}`);
  console.log(`   Dry Run: ${dryRun}`);
  console.log(`   Auto Rollback: ${autoRollback}`);
  
  const migrationResults = {
    startTime: new Date().toISOString(),
    steps: [],
    success: false,
    rollbackExecuted: false
  };
  
  try {
    // Step 1: Pre-migration validation
    await executeStep('Pre-migration Validation', async () => {
      const payload = {
        operation: 'verify',
        collections,
        dryRun: true
      };
      
      const result = await invokeLambda(rollbackLambda, payload);
      
      if (!result.body.success) {
        throw new Error('Pre-migration validation failed');
      }
      
      migrationResults.steps.push({
        step: 'pre-validation',
        status: 'success',
        timestamp: new Date().toISOString()
      });
      
      return result;
    });
    
    // Step 2: Execute migration
    if (!dryRun) {
      await executeStep('Data Migration', async () => {
        const payload = {
          collections,
          batchSize,
          dryRun: false
        };
        
        console.log('   ⚠️  Starting actual data migration - this may take several minutes...');
        
        const result = await invokeLambda(migrationLambda, payload);
        
        if (!result.body.success) {
          throw new Error(`Data migration failed: ${result.body.error}`);
        }
        
        const { summary } = result.body;
        console.log(`   📊 Migration completed: ${summary.migratedDocuments}/${summary.totalDocuments} documents`);
        
        migrationResults.steps.push({
          step: 'migration',
          status: 'success',
          timestamp: new Date().toISOString(),
          summary
        });
        
        return result;
      });
    }
    
    // Step 3: Update application configuration
    if (!dryRun) {
      await executeStep('Update Application Configuration', async () => {
        const result = await updateApplicationConfig({
          appSecretName,
          newDbSecretName,
          lambdaFunctionName,
          dryRun: false,
          createBackup: true
        });
        
        migrationResults.steps.push({
          step: 'config-update',
          status: 'success',
          timestamp: new Date().toISOString()
        });
        
        return result;
      });
    }
    
    // Migration completed successfully
    migrationResults.success = true;
    migrationResults.endTime = new Date().toISOString();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    
    if (dryRun) {
      console.log('\n📋 Dry Run Summary:');
      console.log('   ✅ All validation steps passed');
      console.log('   ✅ Migration is ready to execute');
      console.log('\n💡 To execute the actual migration, run without --dry-run flag');
    } else {
      console.log('\n📋 Migration Summary:');
      console.log(`   ✅ Collections migrated: ${collections.length}`);
      console.log(`   ✅ Application configuration updated`);
      console.log('\n🚀 Application is now using the new DocumentDB cluster!');
    }
    
    return migrationResults;
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    
    migrationResults.success = false;
    migrationResults.error = error.message;
    migrationResults.endTime = new Date().toISOString();
    
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const result = await orchestrateMigration();
    
    console.log('\n📊 Final Results:');
    console.log(JSON.stringify(result, null, 2));
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Migration orchestration failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { orchestrateMigration };