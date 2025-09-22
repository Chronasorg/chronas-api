#!/usr/bin/env node

/**
 * Code Cleanup Script
 * 
 * This script analyzes and removes unused code, obsolete files,
 * and cleans up the codebase after modernization.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Files and directories to remove (obsolete after modernization)
 */
const OBSOLETE_FILES = [
  // Babel-related files (no longer needed with Node.js 22.x)
  'gulpfile.babel.js',
  
  // Docker files (replaced by Lambda)
  'Dockerfile',
  'Dockerfile.Develop',
  'docker-compose.yml',
  
  // CI/CD files for old platforms
  '.travis.yml',
  'azure-pipelines.yml',
  'azure-pipelines-pr.yml',
  'buildspec.yml',
  
  // Azure DevSpaces (obsolete)
  'azds.yaml',
  
  // Old health check (replaced by Lambda health checks)
  'healthcheck.js',
  
  // Kubernetes configs (replaced by Lambda)
  'kubernetes/',
  
  // Charts (Helm charts, replaced by CDK)
  'charts/',
  
  // Load tests (will be replaced by modern testing)
  'loadTests/',
  
  // Old migration scripts (replaced by new migration system)
  'migration/',
  
  // Infrastructure configs (replaced by CDK)
  'infrastructure/',
  
  // Dist directory (no longer needed with native Node.js)
  'dist/',
  
  // Old test files that might be obsolete
  'test-lambda-optimizations.js',
  'test-secrets-manager.js'
];

/**
 * Package.json fields to clean up
 */
const OBSOLETE_PACKAGE_FIELDS = [
  'babel',
  'engineStrict'
];

/**
 * Dependencies that are no longer needed
 */
const OBSOLETE_DEPENDENCIES = [
  // Babel-related (no longer needed with Node.js 22.x)
  'babel-cli',
  'babel-core',
  'babel-loader',
  'babel-plugin-add-module-exports',
  'babel-plugin-transform-object-rest-spread',
  'babel-polyfill',
  'babel-preset-env',
  'babel-preset-es2015',
  'babel-preset-stage-0',
  'babel-preset-stage-2',
  
  // Gulp-related (replaced by native Node.js)
  'gulp',
  'gulp-babel',
  'gulp-load-plugins',
  'gulp-newer',
  'del',
  
  // Old AWS SDK (replaced by v3)
  'aws-sdk',
  
  // Body parser (built into Express 4.16+)
  'body-parser',
  
  // Old testing tools
  'istanbul',
  'eslint-watch',
  
  // Commitizen (not used)
  'commitizen',
  'cz-conventional-changelog'
];

/**
 * Scripts to remove from package.json
 */
const OBSOLETE_SCRIPTS = [
  'lint:watch',
  'test:watch'
];

/**
 * Check if file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

/**
 * Remove file or directory
 */
function removeFileOrDir(filePath) {
  try {
    const fullPath = path.resolve(projectRoot, filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  Skipping ${filePath} (already removed)`);
      return true;
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`🗂️  Removed directory: ${filePath}`);
    } else {
      fs.unlinkSync(fullPath);
      console.log(`📄 Removed file: ${filePath}`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to remove ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Clean up package.json
 */
function cleanupPackageJson() {
  console.log('\n🔧 Cleaning up package.json...');
  
  try {
    const packagePath = path.resolve(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    let modified = false;
    
    // Remove obsolete fields
    OBSOLETE_PACKAGE_FIELDS.forEach(field => {
      if (packageJson[field]) {
        delete packageJson[field];
        console.log(`  ✅ Removed field: ${field}`);
        modified = true;
      }
    });
    
    // Remove obsolete dependencies
    ['dependencies', 'devDependencies'].forEach(depType => {
      if (packageJson[depType]) {
        OBSOLETE_DEPENDENCIES.forEach(dep => {
          if (packageJson[depType][dep]) {
            delete packageJson[depType][dep];
            console.log(`  ✅ Removed ${depType}: ${dep}`);
            modified = true;
          }
        });
      }
    });
    
    // Remove obsolete scripts
    if (packageJson.scripts) {
      OBSOLETE_SCRIPTS.forEach(script => {
        if (packageJson.scripts[script]) {
          delete packageJson.scripts[script];
          console.log(`  ✅ Removed script: ${script}`);
          modified = true;
        }
      });
    }
    
    // Clean up config section
    if (packageJson.config && packageJson.config.commitizen) {
      delete packageJson.config.commitizen;
      console.log(`  ✅ Removed config.commitizen`);
      modified = true;
      
      // Remove config section if empty
      if (Object.keys(packageJson.config).length === 0) {
        delete packageJson.config;
        console.log(`  ✅ Removed empty config section`);
      }
    }
    
    if (modified) {
      fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log('  📦 package.json updated');
    } else {
      console.log('  ✅ package.json is already clean');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to clean up package.json:', error.message);
    return false;
  }
}

/**
 * Remove commented-out code from files
 */
function removeCommentedCode(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    const cleanedLines = lines.filter(line => {
      const trimmed = line.trim();
      
      // Remove lines that are only comments (but keep JSDoc)
      if (trimmed.startsWith('//') && !trimmed.startsWith('/**') && !trimmed.startsWith('*/')) {
        // Keep important comments (TODO, FIXME, NOTE, etc.)
        if (trimmed.includes('TODO') || trimmed.includes('FIXME') || 
            trimmed.includes('NOTE') || trimmed.includes('HACK') ||
            trimmed.includes('XXX') || trimmed.includes('REVIEW')) {
          return true;
        }
        
        // Remove simple commented-out code
        if (trimmed.length > 3 && !trimmed.includes(' ')) {
          return false;
        }
      }
      
      return true;
    });
    
    if (cleanedLines.length !== lines.length) {
      fs.writeFileSync(filePath, cleanedLines.join('\n'));
      console.log(`  🧹 Cleaned comments from: ${path.relative(projectRoot, filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Failed to clean comments from ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Find and clean JavaScript files
 */
function cleanJavaScriptFiles() {
  console.log('\n🧹 Cleaning JavaScript files...');
  
  const jsFiles = [];
  
  function findJsFiles(dir) {
    try {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          // Skip node_modules and other irrelevant directories
          if (!['node_modules', '.git', 'dist', 'coverage'].includes(item)) {
            findJsFiles(fullPath);
          }
        } else if (item.endsWith('.js') && !item.includes('.min.')) {
          jsFiles.push(fullPath);
        }
      });
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error.message);
    }
  }
  
  findJsFiles(projectRoot);
  
  let cleanedFiles = 0;
  jsFiles.forEach(file => {
    if (removeCommentedCode(file)) {
      cleanedFiles++;
    }
  });
  
  console.log(`  ✅ Cleaned ${cleanedFiles} JavaScript files`);
}

/**
 * Clean up configuration files
 */
function cleanupConfigFiles() {
  console.log('\n⚙️  Cleaning up configuration files...');
  
  // Clean up .gitignore
  const gitignorePath = path.resolve(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const lines = content.split('\n');
      
      const cleanedLines = lines.filter(line => {
        const trimmed = line.trim();
        
        // Remove Babel-related entries
        if (trimmed.includes('Babel') || trimmed === 'dist') {
          return false;
        }
        
        return true;
      });
      
      if (cleanedLines.length !== lines.length) {
        fs.writeFileSync(gitignorePath, cleanedLines.join('\n'));
        console.log('  ✅ Cleaned .gitignore');
      }
    } catch (error) {
      console.error('❌ Failed to clean .gitignore:', error.message);
    }
  }
  
  // Clean up .eslintrc files
  const eslintFiles = ['.eslintrc.json', '.eslintrc.yml'];
  eslintFiles.forEach(file => {
    const filePath = path.resolve(projectRoot, file);
    if (fs.existsSync(filePath)) {
      console.log(`  📋 ESLint config found: ${file} (manual review recommended)`);
    }
  });
}

/**
 * Generate cleanup report
 */
function generateCleanupReport(results) {
  console.log('\n' + '='.repeat(60));
  console.log('🧹 CODE CLEANUP REPORT');
  console.log('='.repeat(60));
  
  console.log('\n📊 Summary:');
  console.log(`  Files removed: ${results.filesRemoved}`);
  console.log(`  Directories removed: ${results.dirsRemoved}`);
  console.log(`  Package.json cleaned: ${results.packageCleaned ? 'Yes' : 'No'}`);
  console.log(`  JavaScript files cleaned: ${results.jsFilesCleaned}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    results.errors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
  
  console.log('\n✅ Cleanup completed!');
  console.log('\n💡 Next steps:');
  console.log('  1. Run npm install to update dependencies');
  console.log('  2. Run npm test to verify functionality');
  console.log('  3. Review and commit changes');
  console.log('  4. Update documentation if needed');
}

/**
 * Main cleanup function
 */
async function main() {
  console.log('🚀 Starting code cleanup process...');
  console.log(`📁 Project root: ${projectRoot}`);
  
  const results = {
    filesRemoved: 0,
    dirsRemoved: 0,
    packageCleaned: false,
    jsFilesCleaned: 0,
    errors: []
  };
  
  try {
    // Remove obsolete files and directories
    console.log('\n🗑️  Removing obsolete files and directories...');
    
    OBSOLETE_FILES.forEach(file => {
      const fullPath = path.resolve(projectRoot, file);
      
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        
        if (removeFileOrDir(file)) {
          if (stats.isDirectory()) {
            results.dirsRemoved++;
          } else {
            results.filesRemoved++;
          }
        } else {
          results.errors.push(`Failed to remove ${file}`);
        }
      }
    });
    
    // Clean up package.json
    if (cleanupPackageJson()) {
      results.packageCleaned = true;
    }
    
    // Clean JavaScript files
    cleanJavaScriptFiles();
    
    // Clean configuration files
    cleanupConfigFiles();
    
    // Generate report
    generateCleanupReport(results);
    
  } catch (error) {
    console.error('\n💥 Cleanup process failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as cleanupUnusedCode };