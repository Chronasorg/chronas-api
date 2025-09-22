#!/usr/bin/env node

/**
 * Fix Import Extensions Script
 * 
 * This script adds .js extensions to all relative imports in the codebase
 * to make them compatible with ES6 modules.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Find all JavaScript files
 */
function findJavaScriptFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      // Skip node_modules and other irrelevant directories
      if (!['node_modules', '.git', 'coverage', 'scripts'].includes(item)) {
        findJavaScriptFiles(fullPath, files);
      }
    } else if (item.endsWith('.js') && !item.includes('.min.')) {
      files.push(fullPath);
    }
  });
  
  return files;
}

/**
 * Fix imports in a file
 */
function fixImportsInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let newContent = content;
    
    // Pattern to match relative imports without .js extension
    const importRegex = /import\s+.*?\s+from\s+['"](\\..*?)['"](?!.*\\.js)/g;
    
    let match;
    const replacements = [];
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Skip if it already has an extension or is a directory import
      if (importPath.includes('.') && !importPath.endsWith('/')) {
        continue;
      }
      
      // Check if the file exists with .js extension
      const fullImportPath = path.resolve(path.dirname(filePath), importPath);
      const jsPath = fullImportPath + '.js';
      
      if (fs.existsSync(jsPath)) {
        replacements.push({
          original: match[0],
          replacement: match[0].replace(importPath, importPath + '.js')
        });
      }
    }
    
    // Apply replacements
    replacements.forEach(({ original, replacement }) => {
      newContent = newContent.replace(original, replacement);
      modified = true;
    });
    
    if (modified) {
      fs.writeFileSync(filePath, newContent);
      console.log(`✅ Fixed imports in: ${path.relative(projectRoot, filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Failed to fix imports in ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Fixing import extensions...');
  
  const jsFiles = findJavaScriptFiles(projectRoot);
  
  console.log(`📁 Found ${jsFiles.length} JavaScript files`);
  
  let fixedFiles = 0;
  jsFiles.forEach(file => {
    if (fixImportsInFile(file)) {
      fixedFiles++;
    }
  });
  
  console.log(`\\n✅ Fixed imports in ${fixedFiles} files`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}