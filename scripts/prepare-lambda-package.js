#!/usr/bin/env node

/**
 * Prepare package.json for Lambda deployment
 * Removes development dependencies and unnecessary production dependencies
 */

import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(process.cwd(), 'package.json');
const backupPath = path.join(process.cwd(), 'package.json.backup');

try {
  // Read current package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Create backup
  fs.writeFileSync(backupPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Created backup: package.json.backup');
  
  // Remove devDependencies
  delete packageJson.devDependencies;
  
  // Remove unnecessary production dependencies for Lambda
  const unnecessaryDeps = [
    'postman-collection-transformer',
    'swagger-ui-express'
  ];
  
  unnecessaryDeps.forEach(dep => {
    if (packageJson.dependencies[dep]) {
      delete packageJson.dependencies[dep];
      console.log(`✅ Removed unnecessary dependency: ${dep}`);
    }
  });
  
  // Remove development scripts
  const devScripts = [
    'test',
    'test:coverage',
    'test:check-coverage',
    'report-coverage',
    'test:postman',
    'test:postman:basic',
    'test:postman:dev',
    'test:postman:prod',
    'test:postman:manual',
    'test:setup',
    'test:ci',
    'test:ci:basic',
    'lint'
  ];
  
  devScripts.forEach(script => {
    if (packageJson.scripts[script]) {
      delete packageJson.scripts[script];
    }
  });
  
  // Keep only essential scripts for Lambda
  packageJson.scripts = {
    start: packageJson.scripts.start,
    'start:prodSim': packageJson.scripts['start:prodSim'],
    build: packageJson.scripts.build,
    'build:lambda': packageJson.scripts['build:lambda']
  };
  
  // Write cleaned package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('✅ Created production package.json for Lambda deployment');
  
  console.log('\n📦 Production dependencies:');
  Object.keys(packageJson.dependencies).forEach(dep => {
    console.log(`  - ${dep}@${packageJson.dependencies[dep]}`);
  });
  
} catch (error) {
  console.error('❌ Error preparing Lambda package:', error.message);
  process.exit(1);
}