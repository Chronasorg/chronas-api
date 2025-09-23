#!/usr/bin/env node

/**
 * Fix Test Import Script
 * 
 * This script fixes require statements in test files to use ES6 imports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Fix imports in a test file
 */
function fixTestFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if it already has the fs import
    if (content.includes('import fs from')) {
      console.log(`✅ Already fixed: ${path.relative(projectRoot, filePath)}`);
      return false;
    }
    
    // Check if it has the require statement we need to fix
    if (!content.includes("require('./fixtures/testData.json')")) {
      console.log(`ℹ️  No testData require: ${path.relative(projectRoot, filePath)}`);
      return false;
    }
    
    let newContent = content;
    
    // Add the necessary imports after the existing imports
    const importSection = newContent.match(/(import.*\\n)+/);
    if (importSection) {
      const lastImportIndex = importSection.index + importSection[0].length;
      const beforeImports = newContent.substring(0, lastImportIndex);
      const afterImports = newContent.substring(lastImportIndex);
      
      // Add fs and path imports
      const additionalImports = `import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

`;
      
      newContent = beforeImports + additionalImports + afterImports;
    }
    
    // Replace the require statement
    newContent = newContent.replace(
      /const testData = require\\('\\.\/fixtures\/testData\\.json'\\)/g,
      "const testData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/testData.json'), 'utf8'))"
    );
    
    fs.writeFileSync(filePath, newContent);
    console.log(`✅ Fixed: ${path.relative(projectRoot, filePath)}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to fix ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Fixing test file imports...');
  
  const testFiles = [
    'server/tests/integration-tests/health.test.js',
    'server/tests/integration-tests/marker.test.js', 
    'server/tests/integration-tests/metadata.test.js',
    'server/tests/integration-tests/user.test.js'
  ];
  
  let totalFixed = 0;
  
  testFiles.forEach(file => {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      if (fixTestFile(fullPath)) {
        totalFixed++;
      }
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  });
  
  console.log(`\\n✅ Fixed ${totalFixed} test files`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}