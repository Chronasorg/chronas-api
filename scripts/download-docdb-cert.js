#!/usr/bin/env node

/**
 * Download DocumentDB TLS Certificate
 * 
 * This script downloads the AWS RDS CA certificate required for
 * TLS connections to DocumentDB clusters.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Certificate URL and destination
const CERT_URL = 'https://s3.amazonaws.com/rds-downloads/rds-ca-2019-root.pem';
const CERT_DIR = path.join(__dirname, '../certs');
const CERT_PATH = path.join(CERT_DIR, 'rds-ca-2019-root.pem');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'green') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function error(message) {
  log(`ERROR: ${message}`, 'red');
}

function info(message) {
  log(`INFO: ${message}`, 'blue');
}

/**
 * Download the DocumentDB TLS certificate
 */
async function downloadCertificate() {
  try {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(CERT_DIR)) {
      fs.mkdirSync(CERT_DIR, { recursive: true });
      info(`Created certificates directory: ${CERT_DIR}`);
    }

    // Check if certificate already exists
    if (fs.existsSync(CERT_PATH)) {
      info('DocumentDB TLS certificate already exists');
      
      // Verify certificate is valid
      const stats = fs.statSync(CERT_PATH);
      if (stats.size > 0) {
        log('Certificate verification: OK');
        return CERT_PATH;
      } else {
        info('Existing certificate is empty, re-downloading...');
        fs.unlinkSync(CERT_PATH);
      }
    }

    log('Downloading DocumentDB TLS certificate...');
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(CERT_PATH);
      
      const request = https.get(CERT_URL, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          
          // Verify downloaded certificate
          const stats = fs.statSync(CERT_PATH);
          if (stats.size === 0) {
            reject(new Error('Downloaded certificate is empty'));
            return;
          }
          
          log('DocumentDB TLS certificate downloaded successfully');
          info(`Certificate saved to: ${CERT_PATH}`);
          info(`Certificate size: ${stats.size} bytes`);
          
          resolve(CERT_PATH);
        });
        
        file.on('error', (err) => {
          fs.unlink(CERT_PATH, () => {}); // Delete incomplete file
          reject(err);
        });
      });
      
      request.on('error', (err) => {
        reject(err);
      });
      
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
    
  } catch (err) {
    error(`Failed to download DocumentDB TLS certificate: ${err.message}`);
    throw err;
  }
}

/**
 * Verify certificate content
 */
function verifyCertificate(certPath) {
  try {
    const content = fs.readFileSync(certPath, 'utf8');
    
    if (!content.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid certificate format');
    }
    
    if (!content.includes('-----END CERTIFICATE-----')) {
      throw new Error('Incomplete certificate');
    }
    
    log('Certificate format verification: OK');
    return true;
    
  } catch (err) {
    error(`Certificate verification failed: ${err.message}`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    info('Starting DocumentDB TLS certificate download...');
    
    const certPath = await downloadCertificate();
    
    if (verifyCertificate(certPath)) {
      log('DocumentDB TLS certificate is ready for use');
      process.exit(0);
    } else {
      error('Certificate verification failed');
      process.exit(1);
    }
    
  } catch (err) {
    error(`Certificate download failed: ${err.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { downloadCertificate, verifyCertificate };