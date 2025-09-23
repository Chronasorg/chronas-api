#!/usr/bin/env node

/**
 * Fix All Imports Script
 * 
 * This script comprehensively fixes all import path issues in the codebase
 * to make them compatible with ES6 modules in Node.js 22.x.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Find all JavaScript files that need import fixes
 */
function findJavaScriptFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      // Skip node_modules and other irrelevant directories
      if (!['node_modules', '.git', 'coverage'].includes(item)) {
        findJavaScriptFiles(fullPath, files);
      }
    } else if (item.endsWith('.js') && !item.includes('.min.')) {
      files.push(fullPath);
    }
  });
  
  return files;
}

/**
 * Fix imports in a single file
 */
function fixImportsInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    let modified = false;
    
    // Common import patterns that need .js extension
    const importPatterns = [
      // Relative imports without extension
      {
        regex: /import\s+([^'"]*)\s+from\s+['"](\\.\/[^'"]*?)['"](?!\\.js)/g,
        replacement: (match, imports, path) => {
          // Check if the file exists with .js extension
          const fullImportPath = resolveImportPath(filePath, path);
          if (fullImportPath && fs.existsSync(fullImportPath + '.js')) {
            return `import ${imports} from '${path}.js'`;
          }
          return match;
        }
      },
      // Parent directory imports
      {
        regex: /import\s+([^'"]*)\s+from\s+['"](\\.\\.[^'"]*?)['"](?!\\.js)/g,
        replacement: (match, imports, path) => {
          const fullImportPath = resolveImportPath(filePath, path);
          if (fullImportPath && fs.existsSync(fullImportPath + '.js')) {
            return `import ${imports} from '${path}.js'`;
          }
          return match;
        }
      }
    ];
    
    // Apply each pattern
    importPatterns.forEach(({ regex, replacement }) => {
      const matches = [...content.matchAll(regex)];
      matches.forEach(match => {
        const newImport = replacement(match[0], match[1], match[2]);
        if (newImport !== match[0]) {
          newContent = newContent.replace(match[0], newImport);
          modified = true;
        }
      });
    });
    
    // Specific fixes for known problematic imports
    const specificFixes = [
      // Controller imports
      { from: /from '\\.\\.\/controllers\/([^']*)'(?!\\.js)/g, to: "from '../controllers/$1.js'" },
      { from: /from '\\.\\.\/\\.\\.\/config\/([^']*)'(?!\\.js)/g, to: "from '../../config/$1.js'" },
      { from: /from '\\.\\.\/helpers\/([^']*)'(?!\\.js)/g, to: "from '../helpers/$1.js'" },
      { from: /from '\\.\\.\/models\/([^']*)'(?!\\.js)/g, to: "from '../models/$1.js'" },
      { from: /from '\\.\\.\/middleware\/([^']*)'(?!\\.js)/g, to: "from '../middleware/$1.js'" },
      { from: /from '\\.\\.\/auths\/([^']*)'(?!\\.js)/g, to: "from '../auths/$1.js'" },
    ];
    
    specificFixes.forEach(({ from, to }) => {
      if (from.test(newContent)) {
        newContent = newContent.replace(from, to);
        modified = true;
      }
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
 * Resolve import path relative to the importing file
 */
function resolveImportPath(importingFile, importPath) {
  try {
    const dir = path.dirname(importingFile);
    return path.resolve(dir, importPath);
  } catch (error) {
    return null;
  }
}

/**
 * Fix specific known import issues
 */
function fixKnownIssues() {
  console.log('🔧 Fixing known import issues...');
  
  const knownFixes = [
    // Route files - controller imports
    {
      files: ['server/routes/*.js'],
      fixes: [
        { from: "from '../controllers/collection.controller'", to: "from '../controllers/collection.controller.js'" },
        { from: "from '../controllers/marker.controller'", to: "from '../controllers/marker.controller.js'" },
        { from: "from '../controllers/flag.controller'", to: "from '../controllers/flag.controller.js'" },
        { from: "from '../controllers/revision.controller'", to: "from '../controllers/revision.controller.js'" },
        { from: "from '../controllers/metadata.controller'", to: "from '../controllers/metadata.controller.js'" },
        { from: "from '../controllers/user.controller'", to: "from '../controllers/user.controller.js'" },
        { from: "from '../controllers/game.controller'", to: "from '../controllers/game.controller.js'" },
        { from: "from '../controllers/auth.controller'", to: "from '../controllers/auth.controller.js'" },
        { from: "from '../helpers/privileges'", to: "from '../helpers/privileges.js'" },
        { from: "from '../auths/twitter'", to: "from '../auths/twitter.js'" },
        { from: "from '../../config/config'", to: "from '../../config/config.js'" }
      ]
    }
  ];
  
  knownFixes.forEach(({ files, fixes }) => {
    files.forEach(filePattern => {
      const globFiles = findMatchingFiles(filePattern);
      globFiles.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        let modified = false;
        
        fixes.forEach(({ from, to }) => {
          if (content.includes(from)) {
            content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), to);
            modified = true;
          }
        });
        
        if (modified) {
          fs.writeFileSync(file, content);
          console.log(`  ✅ Fixed known issues in: ${path.relative(projectRoot, file)}`);
        }
      });
    });
  });
}

/**
 * Find files matching a glob-like pattern
 */
function findMatchingFiles(pattern) {
  const fullPattern = path.resolve(projectRoot, pattern);
  const dir = path.dirname(fullPattern);
  const filename = path.basename(fullPattern);
  
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const files = fs.readdirSync(dir);
  
  if (filename.includes('*')) {
    const regex = new RegExp(filename.replace('*', '.*'));
    return files
      .filter(file => regex.test(file))
      .map(file => path.join(dir, file));
  } else {
    const fullPath = path.join(dir, filename);
    return fs.existsSync(fullPath) ? [fullPath] : [];
  }
}

/**
 * Main function
 */
function main() {
  console.log('🚀 Starting comprehensive import fixes...');
  console.log(`📁 Project root: ${projectRoot}`);
  
  // Fix known issues first
  fixKnownIssues();
  
  // Then scan all files for remaining issues
  console.log('\\n🔍 Scanning all JavaScript files...');
  const jsFiles = findJavaScriptFiles(projectRoot);
  
  console.log(`📁 Found ${jsFiles.length} JavaScript files`);
  
  let fixedFiles = 0;
  jsFiles.forEach(file => {
    if (fixImportsInFile(file)) {
      fixedFiles++;
    }
  });
  
  console.log(`\\n✅ Fixed imports in ${fixedFiles} files`);
  console.log('\\n💡 Next steps:');
  console.log('  1. Run npm test to verify fixes');
  console.log('  2. Check for any remaining import errors');
  console.log('  3. Commit changes if tests pass');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}