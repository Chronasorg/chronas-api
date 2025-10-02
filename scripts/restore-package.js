#!/usr/bin/env node

/**
 * Restore original package.json from backup
 */

import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(process.cwd(), 'package.json');
const backupPath = path.join(process.cwd(), 'package.json.backup');

try {
  if (!fs.existsSync(backupPath)) {
    console.log('❌ No backup found: package.json.backup');
    process.exit(1);
  }
  
  // Restore from backup
  const backup = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(packageJsonPath, backup);
  
  // Remove backup
  fs.unlinkSync(backupPath);
  
  console.log('✅ Restored original package.json from backup');
  
} catch (error) {
  console.error('❌ Error restoring package.json:', error.message);
  process.exit(1);
}