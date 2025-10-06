#!/usr/bin/env node

/**
 * Document Current Production Setup
 * 
 * This script documents the current production environment
 * WITHOUT making any changes - just gathering information
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute AWS CLI command safely (read-only)
 */
async function executeAWSCommand(command, args = [], profile = 'chronas-prod') {
  return new Promise((resolve, reject) => {
    const fullArgs = [...args, '--profile', profile, '--region', 'eu-west-1', '--output', 'json'];
    
    console.log(`📋 Running: aws ${command} ${fullArgs.join(' ')}`);
    
    const process = spawn('aws', [command, ...fullArgs]);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          resolve({ raw: stdout });
        }
      } else {
        resolve({ error: stderr, code });
      }
    });
    
    process.on('error', (error) => {
      resolve({ error: error.message });
    });
  });
}

/**
 * Document current setup
 */
async function documentCurrentSetup() {
  const documentation = {
    timestamp: new Date().toISOString(),
    documentdb: {},
    lambda: {},
    apigateway: {},
    cloudformation: {},
    errors: []
  };

  console.log('📋 Documenting Current Production Setup');
  console.log('=====================================\n');

  // 1. DocumentDB Clusters
  console.log('🗄️  Checking DocumentDB clusters...');
  const docdbClusters = await executeAWSCommand('docdb', ['describe-db-clusters']);
  if (docdbClusters.error) {
    console.log(`❌ DocumentDB Error: ${docdbClusters.error}`);
    documentation.errors.push(`DocumentDB: ${docdbClusters.error}`);
  } else {
    documentation.documentdb = docdbClusters;
    console.log(`✅ Found ${docdbClusters.DBClusters?.length || 0} DocumentDB clusters`);
  }

  // 2. Lambda Functions
  console.log('\n⚡ Checking Lambda functions...');
  const lambdaFunctions = await executeAWSCommand('lambda', ['list-functions']);
  if (lambdaFunctions.error) {
    console.log(`❌ Lambda Error: ${lambdaFunctions.error}`);
    documentation.errors.push(`Lambda: ${lambdaFunctions.error}`);
  } else {
    documentation.lambda = lambdaFunctions;
    const chronasFunctions = lambdaFunctions.Functions?.filter(f => 
      f.FunctionName.toLowerCase().includes('chronas')
    ) || [];
    console.log(`✅ Found ${chronasFunctions.length} Chronas Lambda functions`);
  }

  // 3. API Gateway
  console.log('\n🌐 Checking API Gateway...');
  const apiGateways = await executeAWSCommand('apigateway', ['get-rest-apis']);
  if (apiGateways.error) {
    console.log(`❌ API Gateway Error: ${apiGateways.error}`);
    documentation.errors.push(`API Gateway: ${apiGateways.error}`);
  } else {
    documentation.apigateway = apiGateways;
    const chronasAPIs = apiGateways.items?.filter(api => 
      api.name.toLowerCase().includes('chronas')
    ) || [];
    console.log(`✅ Found ${chronasAPIs.length} Chronas API Gateways`);
  }

  // 4. CloudFormation Stacks
  console.log('\n📚 Checking CloudFormation stacks...');
  const cfStacks = await executeAWSCommand('cloudformation', ['describe-stacks']);
  if (cfStacks.error) {
    console.log(`❌ CloudFormation Error: ${cfStacks.error}`);
    documentation.errors.push(`CloudFormation: ${cfStacks.error}`);
  } else {
    documentation.cloudformation = cfStacks;
    const chronasStacks = cfStacks.Stacks?.filter(stack => 
      stack.StackName.toLowerCase().includes('chronas')
    ) || [];
    console.log(`✅ Found ${chronasStacks.length} Chronas CloudFormation stacks`);
  }

  // Save documentation
  const outputFile = path.resolve(__dirname, '..', 'CURRENT_PRODUCTION_SETUP.json');
  fs.writeFileSync(outputFile, JSON.stringify(documentation, null, 2));
  
  console.log(`\n📄 Documentation saved to: ${outputFile}`);
  
  // Generate human-readable summary
  generateSummary(documentation);
  
  return documentation;
}

/**
 * Generate human-readable summary
 */
function generateSummary(documentation) {
  const summaryFile = path.resolve(__dirname, '..', 'CURRENT_PRODUCTION_SUMMARY.md');
  
  let summary = `# Current Production Setup Summary

Generated: ${documentation.timestamp}

## DocumentDB Clusters
`;

  if (documentation.documentdb.DBClusters) {
    documentation.documentdb.DBClusters.forEach(cluster => {
      summary += `
### ${cluster.DBClusterIdentifier}
- **Engine Version**: ${cluster.EngineVersion}
- **Status**: ${cluster.Status}
- **Endpoint**: ${cluster.Endpoint}
- **Port**: ${cluster.Port}
- **VPC**: ${cluster.DbClusterResourceId}
- **Instances**: ${cluster.DBClusterMembers?.length || 0}
`;
    });
  } else {
    summary += '\nNo DocumentDB clusters found or access denied.\n';
  }

  summary += `
## Lambda Functions
`;

  if (documentation.lambda.Functions) {
    const chronasFunctions = documentation.lambda.Functions.filter(f => 
      f.FunctionName.toLowerCase().includes('chronas')
    );
    
    chronasFunctions.forEach(func => {
      summary += `
### ${func.FunctionName}
- **Runtime**: ${func.Runtime}
- **Memory**: ${func.MemorySize}MB
- **Timeout**: ${func.Timeout}s
- **Last Modified**: ${func.LastModified}
- **Code Size**: ${func.CodeSize} bytes
- **Handler**: ${func.Handler}
`;
    });
  } else {
    summary += '\nNo Lambda functions found or access denied.\n';
  }

  summary += `
## API Gateway
`;

  if (documentation.apigateway.items) {
    const chronasAPIs = documentation.apigateway.items.filter(api => 
      api.name.toLowerCase().includes('chronas')
    );
    
    chronasAPIs.forEach(api => {
      summary += `
### ${api.name}
- **ID**: ${api.id}
- **Created**: ${api.createdDate}
- **Description**: ${api.description || 'N/A'}
`;
    });
  } else {
    summary += '\nNo API Gateways found or access denied.\n';
  }

  summary += `
## CloudFormation Stacks
`;

  if (documentation.cloudformation.Stacks) {
    const chronasStacks = documentation.cloudformation.Stacks.filter(stack => 
      stack.StackName.toLowerCase().includes('chronas')
    );
    
    chronasStacks.forEach(stack => {
      summary += `
### ${stack.StackName}
- **Status**: ${stack.StackStatus}
- **Created**: ${stack.CreationTime}
- **Description**: ${stack.Description || 'N/A'}
`;
    });
  } else {
    summary += '\nNo CloudFormation stacks found or access denied.\n';
  }

  if (documentation.errors.length > 0) {
    summary += `
## Errors Encountered
${documentation.errors.map(error => `- ${error}`).join('\n')}
`;
  }

  summary += `
## Next Steps

1. **Review this documentation** to understand current setup
2. **Create DocumentDB snapshot** before any changes
3. **Plan Lambda deployment** strategy
4. **Test in development** environment first
5. **Execute production deployment** with proper backups

See SIMPLE_PRODUCTION_DEPLOYMENT.md for deployment steps.
`;

  fs.writeFileSync(summaryFile, summary);
  console.log(`📄 Summary saved to: ${summaryFile}`);
}

/**
 * Main execution
 */
async function main() {
  try {
    await documentCurrentSetup();
    console.log('\n✅ Documentation complete!');
    console.log('📋 Review CURRENT_PRODUCTION_SUMMARY.md for human-readable summary');
    console.log('📄 Review CURRENT_PRODUCTION_SETUP.json for detailed data');
  } catch (error) {
    console.error('❌ Documentation failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { documentCurrentSetup };