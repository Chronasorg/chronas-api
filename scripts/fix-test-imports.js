#!/usr/bin/env node

/**
 * Fix Test Import Script
 * 
 * This script fixes ES6 import issues in test files for CommonJS modules like chai.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Find all test files
 */
function findTestFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (item.endsWith('.test.js')) {
      files.push(fullPath);
    }
  });
  
  return files;
}

/**
 * Fix imports in a test file
 */
function fixTestImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Fix chai imports
    const chaiImportRegex = /import chai from 'chai'\\nconst { expect } = chai/g;
    if (chaiImportRegex.test(content)) {
      const newContent = content.replace(
        chaiImportRegex,
        "import chai from 'chai'\nconst { expect } = chai"
      );
      
      fs.writeFileSync(filePath, newContent);
      console.log(`✅ Fixed chai imports in: ${path.relative(projectRoot, filePath)}`);
      modified = true;
    }
    
    return modified;
  } catch (error) {
    console.error(`❌ Failed to fix imports in ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Fixing test imports...');
  
  const testsDir = path.join(projectRoot, 'server', 'tests');
  const testFiles = findTestFiles(testsDir);
  
  console.log(`📁 Found ${testFiles.length} test files`);
  
  let fixedFiles = 0;
  testFiles.forEach(file => {
    if (fixTestImports(file)) {
      fixedFiles++;
    }
  });
  
  console.log(`\\n✅ Fixed imports in ${fixedFiles} test files`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}