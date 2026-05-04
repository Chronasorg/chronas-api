/**
 * Health Check Routes
 */

import express from 'express';

import { cacheUtils } from '../middleware/cache.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0'
  });
});

router.get('/detailed', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0',
    checks: {}
  };

  try {
    health.checks.cache = {
      status: 'healthy',
      type: 'memory',
      stats: cacheUtils.getStats()
    };
  } catch (error) {
    health.checks.cache = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  const memUsage = process.memoryUsage();
  health.checks.memory = {
    status: 'healthy',
    usage: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
    }
  };

  if (memUsage.heapUsed > 500 * 1024 * 1024) {
    health.checks.memory.status = 'warning';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 200;
  res.status(statusCode).json(health);
});

router.get('/ready', (req, res) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

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

  try {
    metrics.cache = cacheUtils.getStats();
  } catch {
    // Ignore cache metrics errors
  }

  res.json(metrics);
});

export default router;
