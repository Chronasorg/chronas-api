#!/usr/bin/env node

/**
 * Fix BoardComponent Import Script
 * 
 * This script converts require statements to ES6 imports in boardComponent files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Fix imports in a boardComponent file
 */
function fixBoardComponentFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let newContent = content;
    let modified = false;
    
    // Convert require statements to imports
    const fixes = [
      // Controller requires
      { from: /const (\w+) = require\('\.\/controller'\)\.(\w+)/g, to: "import { $2 as $1 } from './controller.js'" },
      { from: /const (\w+) = require\('\.\.\/(\w+)\/controller'\)\.(\w+)/g, to: "import { $3 as $1 } from '../$2/controller.js'" },
      
      // Model requires
      { from: /const (\w+) = require\('\.\/model'\)/g, to: "import $1 from './model.js'" },
      { from: /const (\w+) = require\('\.\.\/(\w+)\/model'\)/g, to: "import $1 from '../$2/model.js'" },
      { from: /const (\w+) = require\('\.\.\/\.\.\/\.\.\/models\/(\w+)\.model'\)/g, to: "import $1 from '../../../models/$2.model.js'" },
      
      // Utility requires
      { from: /const (\w+) = require\('\.\.\/\.\.\/utilities\/tools'\)\.(\w+)/g, to: "import { $2 as $1 } from '../../utilities/tools.js'" },
      
      // External package requires
      { from: /const mongoose = require\('mongoose'\)/g, to: "import mongoose from 'mongoose'" },
      { from: /const (\w+) = require\('(\w+)'\)/g, to: "import $1 from '$2'" },
      { from: /const (\w+) = require\('(\w+)\/(\w+)'\)/g, to: "import { $3 as $1 } from '$2'" },
      
      // Special cases
      { from: /const ObjectId = require\('mongoose'\)\.Types\.ObjectId\(\)/g, to: "const ObjectId = new mongoose.Types.ObjectId()" },
      { from: /const passport = require\('passport'\)/g, to: "import passport from 'passport'" },
      { from: /const GitHubStrategy = require\('passport-github'\)\.Strategy/g, to: "import { Strategy as GitHubStrategy } from 'passport-github'" },
    ];
    
    // Apply fixes
    fixes.forEach(({ from, to }) => {
      const newContentAfterFix = newContent.replace(from, to);
      if (newContentAfterFix !== newContent) {
        newContent = newContentAfterFix;
        modified = true;
      }
    });
    
    if (modified) {
      // Verify the content is still valid before writing
      if (newContent.length < content.length * 0.8) {
        console.log(`⚠️  Skipping ${filePath} - content too short after fixes`);
        return false;
      }
      
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
 * Find and fix all boardComponent files
 */
function main() {
  console.log('🔧 Fixing boardComponent import statements...');
  
  const boardComponentDir = path.join(projectRoot, 'server/boardComponent');
  
  function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    let totalFixed = 0;
    
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        totalFixed += processDirectory(fullPath);
      } else if (file.endsWith('.js')) {
        if (fixBoardComponentFile(fullPath)) {
          totalFixed++;
        }
      }
    });
    
    return totalFixed;
  }
  
  const totalFixed = processDirectory(boardComponentDir);
  console.log(`\\n✅ Fixed imports in ${totalFixed} boardComponent files`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}