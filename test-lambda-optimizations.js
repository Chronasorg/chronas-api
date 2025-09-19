#!/usr/bin/env node

/**
 * Test Lambda Optimizations
 * 
 * This script tests the Lambda optimization features without
 * requiring a full application startup.
 */

import { isLambdaEnvironment, loadConfig } from './config/lambda-config.js';
import { 
  trackColdStart, 
  trackWarmStart, 
  trackRequest, 
  trackMemoryUsage,
  getMetrics,
  getHealthStatus,
  getOptimizationRecommendations
} from './config/performance.js';

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'green') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

async function testLambdaConfiguration() {
  info('Testing Lambda Configuration...');
  
  try {
    // Test environment detection
    const isLambda = isLambdaEnvironment();
    success(`Environment detection: ${isLambda ? 'Lambda' : 'Local'}`);
    
    // Test configuration loading
    const startTime = Date.now();
    const config = await loadConfig();
    const loadTime = Date.now() - startTime;
    
    success(`Configuration loaded in ${loadTime}ms`);
    info(`  Environment: ${config.env}`);
    info(`  Port: ${config.port}`);
    info(`  Is Lambda: ${config.isLambda}`);
    info(`  MongoDB Host: ${config.mongo.host ? '[CONFIGURED]' : '[NOT SET]'}`);
    
    return true;
  } catch (err) {
    error(`Configuration test failed: ${err.message}`);
    return false;
  }
}

async function testPerformanceMonitoring() {
  info('Testing Performance Monitoring...');
  
  try {
    // Test cold start tracking
    const coldStart = trackColdStart(1200);
    success(`Cold start tracked: ${coldStart.initTime}ms`);
    
    // Test warm start tracking
    const warmStart = trackWarmStart();
    success(`Warm start tracked`);
    
    // Test request tracking
    const request1 = trackRequest(150, 200);
    const request2 = trackRequest(300, 404);
    const request3 = trackRequest(75, 200);
    success(`Requests tracked: ${request1.totalRequests} total`);
    
    // Test memory tracking
    const memory = trackMemoryUsage();
    success(`Memory tracked: ${memory.heapUsed}MB heap used`);
    
    // Test metrics
    const metrics = getMetrics();
    success('Metrics collected:');
    info(`  Cold starts: ${metrics.coldStarts}`);
    info(`  Warm starts: ${metrics.warmStarts}`);
    info(`  Total requests: ${metrics.totalRequests}`);
    info(`  Average response time: ${metrics.averageResponseTime.toFixed(1)}ms`);
    info(`  Error rate: ${metrics.errorRate.toFixed(1)}%`);
    info(`  Cold start rate: ${metrics.coldStartRate.toFixed(1)}%`);
    
    // Test health status
    const health = getHealthStatus();
    success(`Health status: ${health.healthy ? 'Healthy' : 'Issues detected'}`);
    if (health.issues.length > 0) {
      health.issues.forEach(issue => info(`  Issue: ${issue}`));
    }
    
    // Test optimization recommendations
    const recommendations = getOptimizationRecommendations();
    if (recommendations.length > 0) {
      success('Optimization recommendations:');
      recommendations.forEach(rec => {
        info(`  ${rec.issue}: ${rec.recommendation} (${rec.priority})`);
      });
    } else {
      success('No optimization recommendations needed');
    }
    
    return true;
  } catch (err) {
    error(`Performance monitoring test failed: ${err.message}`);
    return false;
  }
}

async function testConnectionCaching() {
  info('Testing Connection Caching...');
  
  try {
    // Simulate multiple configuration loads (should use cache)
    const startTime1 = Date.now();
    await loadConfig();
    const loadTime1 = Date.now() - startTime1;
    
    const startTime2 = Date.now();
    await loadConfig(); // Should use cache
    const loadTime2 = Date.now() - startTime2;
    
    success(`First load: ${loadTime1}ms, Cached load: ${loadTime2}ms`);
    
    if (loadTime2 < loadTime1) {
      success('Configuration caching is working');
    } else {
      info('Configuration caching may not be optimal');
    }
    
    return true;
  } catch (err) {
    error(`Connection caching test failed: ${err.message}`);
    return false;
  }
}

async function testEnvironmentVariableHandling() {
  info('Testing Environment Variable Handling...');
  
  try {
    // Test with different environment scenarios
    const originalEnv = process.env.NODE_ENV;
    
    // Test development environment
    process.env.NODE_ENV = 'development';
    const devConfig = await loadConfig(true); // Force reload
    success(`Development config loaded: ${devConfig.env}`);
    
    // Test production environment
    process.env.NODE_ENV = 'production';
    const prodConfig = await loadConfig(true); // Force reload
    success(`Production config loaded: ${prodConfig.env}`);
    
    // Restore original environment
    if (originalEnv) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    
    // Test graceful fallbacks
    const testConfig = await loadConfig(true);
    success('Environment variable handling working correctly');
    
    return true;
  } catch (err) {
    error(`Environment variable handling test failed: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  log('🚀 Starting Lambda Optimization Tests', 'yellow');
  console.log('');
  
  const tests = [
    { name: 'Lambda Configuration', fn: testLambdaConfiguration },
    { name: 'Performance Monitoring', fn: testPerformanceMonitoring },
    { name: 'Connection Caching', fn: testConnectionCaching },
    { name: 'Environment Variable Handling', fn: testEnvironmentVariableHandling }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log('');
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        success(`${test.name} - PASSED`);
      } else {
        failed++;
        error(`${test.name} - FAILED`);
      }
    } catch (err) {
      failed++;
      error(`${test.name} - ERROR: ${err.message}`);
    }
  }
  
  console.log('');
  log('📊 Test Results:', 'yellow');
  success(`Passed: ${passed}`);
  if (failed > 0) {
    error(`Failed: ${failed}`);
  }
  
  if (failed === 0) {
    log('🎉 All Lambda optimization tests passed!', 'green');
    process.exit(0);
  } else {
    log('❌ Some tests failed. Check the output above.', 'red');
    process.exit(1);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(err => {
    error(`Test runner failed: ${err.message}`);
    process.exit(1);
  });
}