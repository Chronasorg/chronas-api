#!/usr/bin/env node

/**
 * Lambda Build Script for Chronas API
 * 
 * This script optimizes the application for Lambda deployment by:
 * - Bundling dependencies
 * - Removing unnecessary files
 * - Optimizing for cold start performance
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_DIR = path.join(__dirname, '../dist');
const SOURCE_DIR = path.join(__dirname, '..');

console.log('🚀 Building Chronas API for Lambda deployment...');

// Clean build directory
if (fs.existsSync(BUILD_DIR)) {
  console.log('🧹 Cleaning build directory...');
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}

fs.mkdirSync(BUILD_DIR, { recursive: true });

// Copy source files
console.log('📁 Copying source files...');
const filesToCopy = [
  'lambda-handler.js',
  'index.js',
  'package.json',
  'config/',
  'server/',
  'scripts/download-docdb-cert.js'
];

filesToCopy.forEach(file => {
  const sourcePath = path.join(SOURCE_DIR, file);
  const destPath = path.join(BUILD_DIR, file);
  
  if (fs.existsSync(sourcePath)) {
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      fs.cpSync(sourcePath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
    console.log(`  ✅ Copied ${file}`);
  } else {
    console.log(`  ⚠️  Warning: ${file} not found`);
  }
});

// Install production dependencies
console.log('📦 Installing production dependencies...');
process.chdir(BUILD_DIR);

try {
  execSync('npm ci --omit=dev --production', { 
    stdio: 'inherit',
    env: { 
      ...process.env, 
      NODE_ENV: 'production',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false'
    }
  });
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Optimize node_modules
console.log('🔧 Optimizing node_modules...');
try {
  // Remove unnecessary files
  execSync('find node_modules -name "*.md" -delete', { stdio: 'pipe' });
  execSync('find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true', { stdio: 'pipe' });
  execSync('find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true', { stdio: 'pipe' });
  execSync('find node_modules -name "*.test.js" -delete', { stdio: 'pipe' });
  execSync('find node_modules -name "*.spec.js" -delete', { stdio: 'pipe' });
  execSync('find node_modules -name ".nyc_output" -type d -exec rm -rf {} + 2>/dev/null || true', { stdio: 'pipe' });
  execSync('find node_modules -name "coverage" -type d -exec rm -rf {} + 2>/dev/null || true', { stdio: 'pipe' });
  
  console.log('  ✅ Removed test files and documentation');
} catch (error) {
  console.log('  ⚠️  Some optimization steps failed (non-critical)');
}

// Create deployment info
const deploymentInfo = {
  buildTime: new Date().toISOString(),
  nodeVersion: process.version,
  environment: 'lambda',
  optimized: true
};

fs.writeFileSync(
  path.join(BUILD_DIR, 'deployment-info.json'), 
  JSON.stringify(deploymentInfo, null, 2)
);

// Calculate bundle size
const getBundleSize = (dir) => {
  let size = 0;
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      size += getBundleSize(filePath);
    } else {
      size += stat.size;
    }
  });
  
  return size;
};

const bundleSize = getBundleSize(BUILD_DIR);
const bundleSizeMB = (bundleSize / 1024 / 1024).toFixed(2);

console.log(`\n✨ Lambda build completed successfully!`);
console.log(`📊 Bundle size: ${bundleSizeMB} MB`);
console.log(`📁 Build output: ${BUILD_DIR}`);
console.log(`🕒 Build time: ${deploymentInfo.buildTime}`);

if (bundleSize > 50 * 1024 * 1024) { // 50MB
  console.log('⚠️  Warning: Bundle size is large. Consider optimizing dependencies.');
}

console.log('\n🚀 Ready for Lambda deployment!');