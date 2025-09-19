/**
 * Health Check Routes
 * 
 * Provides comprehensive health monitoring endpoints
 */

import express from 'express';
import { getConnectionStatus, testDatabaseConnectivity } from '../../config/database.js';
import { cacheUtils } from '../middleware/cache.js';

const router = express.Router();

/**
 * Basic health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

/**
 * Detailed health check
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0',
    checks: {}
  };

  // Database health
  try {
    const connectionStatus = getConnectionStatus();
    
    health.checks.database = {
      status: connectionStatus.isConnected ? 'healthy' : 'unhealthy',
      state: connectionStatus.state,
      host: connectionStatus.host,
      name: connectionStatus.name
    };
    
    if (connectionStatus.isConnected) {
      // Test database connectivity
      const pingResult = await testDatabaseConnectivity();
      health.checks.database.ping = pingResult ? 'success' : 'failed';
    }
  } catch (error) {
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Cache health
  try {
    health.checks.cache = {
      status: 'healthy',
      type: cacheUtils.isRedisConnected() ? 'redis' : 'memory',
      stats: cacheUtils.getStats()
    };
    
    // Test cache with a simple operation
    const testKey = 'health-check-' + Date.now();
    await cacheUtils.set(testKey, 'test', 10);
    const testValue = await cacheUtils.get(testKey);
    await cacheUtils.del(testKey);
    
    health.checks.cache.test = testValue === 'test' ? 'success' : 'failed';
  } catch (error) {
    health.checks.cache = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    status: 'healthy',
    usage: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
    }
  };

  // Check if memory usage is too high (>500MB heap)
  if (memUsage.heapUsed > 500 * 1024 * 1024) {
    health.checks.memory.status = 'warning';
    health.status = 'degraded';
  }

  // Set appropriate HTTP status
  const statusCode = health.status === 'healthy' ? 200 : 
                    health.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * Readiness check (for Kubernetes)
 */
router.get('/ready', async (req, res) => {
  try {
    // Check if database is ready
    const connectionStatus = getConnectionStatus();
    if (!connectionStatus.isConnected) {
      return res.status(503).json({
        status: 'not ready',
        reason: 'database not connected',
        state: connectionStatus.state,
        timestamp: new Date().toISOString()
      });
    }

    // Test database connectivity
    const isConnected = await testDatabaseConnectivity();
    if (!isConnected) {
      return res.status(503).json({
        status: 'not ready',
        reason: 'database ping failed',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      reason: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness check (for Kubernetes)
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Metrics endpoint (basic)
 */
router.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    version: process.version,
    platform: process.platform,
    arch: process.arch
  };

  // Add cache metrics if available
  try {
    metrics.cache = cacheUtils.getStats();
  } catch (error) {
    // Ignore cache metrics errors
  }

  res.json(metrics);
});

export default router;