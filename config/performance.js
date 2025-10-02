/**
 * Performance Monitoring and Optimization for Lambda
 *
 * This module provides performance monitoring, metrics collection,
 * and optimization utilities for Lambda runtime.
 */

import debug from 'debug';

const debugLog = debug('chronas-api:performance');

// Performance metrics storage
const metrics = {
  coldStarts: 0,
  warmStarts: 0,
  totalRequests: 0,
  averageResponseTime: 0,
  dbConnectionTime: 0,
  initializationTime: 0,
  memoryUsage: [],
  errors: 0,
  lastReset: Date.now()
};

// Performance thresholds
const thresholds = {
  maxResponseTime: 5000, // 5 seconds
  maxMemoryUsage: 400, // 400MB
  maxColdStartTime: 3000, // 3 seconds
  maxDbConnectionTime: 2000 // 2 seconds
};

/**
 * Track cold start performance
 */
export function trackColdStart(initTime) {
  metrics.coldStarts++;
  metrics.initializationTime = initTime;

  debugLog(`Cold start tracked: ${initTime}ms`);

  if (initTime > thresholds.maxColdStartTime) {
    console.warn(`Cold start exceeded threshold: ${initTime}ms > ${thresholds.maxColdStartTime}ms`);
  }

  return {
    isColdStart: true,
    initTime,
    exceedsThreshold: initTime > thresholds.maxColdStartTime
  };
}

/**
 * Track warm start performance
 */
export function trackWarmStart() {
  metrics.warmStarts++;
  debugLog('Warm start tracked');

  return {
    isColdStart: false,
    warmStarts: metrics.warmStarts
  };
}

/**
 * Track request performance
 */
export function trackRequest(responseTime, statusCode) {
  metrics.totalRequests++;

  // Update average response time
  metrics.averageResponseTime = (
    (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) /
    metrics.totalRequests
  );

  // Track errors
  if (statusCode >= 400) {
    metrics.errors++;
  }

  debugLog(`Request tracked: ${responseTime}ms, status: ${statusCode}`);

  if (responseTime > thresholds.maxResponseTime) {
    console.warn(`Response time exceeded threshold: ${responseTime}ms > ${thresholds.maxResponseTime}ms`);
  }

  return {
    responseTime,
    statusCode,
    exceedsThreshold: responseTime > thresholds.maxResponseTime,
    totalRequests: metrics.totalRequests,
    averageResponseTime: metrics.averageResponseTime
  };
}

/**
 * Track database connection performance
 */
export function trackDatabaseConnection(connectionTime, success = true) {
  metrics.dbConnectionTime = connectionTime;

  if (!success) {
    metrics.errors++;
  }

  debugLog(`Database connection tracked: ${connectionTime}ms, success: ${success}`);

  if (connectionTime > thresholds.maxDbConnectionTime) {
    console.warn(`DB connection time exceeded threshold: ${connectionTime}ms > ${thresholds.maxDbConnectionTime}ms`);
  }

  return {
    connectionTime,
    success,
    exceedsThreshold: connectionTime > thresholds.maxDbConnectionTime
  };
}

/**
 * Track memory usage
 */
export function trackMemoryUsage() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  metrics.memoryUsage.push({
    timestamp: Date.now(),
    heapUsed: heapUsedMB,
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    rss: Math.round(memUsage.rss / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024)
  });

  // Keep only last 100 measurements
  if (metrics.memoryUsage.length > 100) {
    metrics.memoryUsage = metrics.memoryUsage.slice(-100);
  }

  debugLog(`Memory usage tracked: ${heapUsedMB}MB heap used`);

  if (heapUsedMB > thresholds.maxMemoryUsage) {
    console.warn(`Memory usage exceeded threshold: ${heapUsedMB}MB > ${thresholds.maxMemoryUsage}MB`);
  }

  return {
    heapUsed: heapUsedMB,
    exceedsThreshold: heapUsedMB > thresholds.maxMemoryUsage,
    memUsage
  };
}

/**
 * Get performance metrics summary
 */
export function getMetrics() {
  const currentMemory = trackMemoryUsage();
  const uptime = Date.now() - metrics.lastReset;

  return {
    ...metrics,
    currentMemory: currentMemory.memUsage,
    uptime,
    errorRate: metrics.totalRequests > 0 ? (metrics.errors / metrics.totalRequests) * 100 : 0,
    coldStartRate: (metrics.coldStarts + metrics.warmStarts) > 0
      ? (metrics.coldStarts / (metrics.coldStarts + metrics.warmStarts)) * 100
      : 0
  };
}

/**
 * Get performance health status
 */
export function getHealthStatus() {
  const currentMetrics = getMetrics();
  const currentMemory = trackMemoryUsage();

  const issues = [];

  // Check response time
  if (currentMetrics.averageResponseTime > thresholds.maxResponseTime) {
    issues.push(`High average response time: ${currentMetrics.averageResponseTime}ms`);
  }

  // Check memory usage
  if (currentMemory.heapUsed > thresholds.maxMemoryUsage) {
    issues.push(`High memory usage: ${currentMemory.heapUsed}MB`);
  }

  // Check error rate
  if (currentMetrics.errorRate > 10) { // 10% error rate threshold
    issues.push(`High error rate: ${currentMetrics.errorRate.toFixed(1)}%`);
  }

  // Check cold start time
  if (currentMetrics.initializationTime > thresholds.maxColdStartTime) {
    issues.push(`Slow cold start: ${currentMetrics.initializationTime}ms`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    metrics: currentMetrics,
    thresholds
  };
}

/**
 * Reset performance metrics
 */
export function resetMetrics() {
  Object.keys(metrics).forEach(key => {
    if (key === 'memoryUsage') {
      metrics[key] = [];
    } else if (key === 'lastReset') {
      metrics[key] = Date.now();
    } else {
      metrics[key] = 0;
    }
  });

  debugLog('Performance metrics reset');
}

/**
 * Performance optimization recommendations
 */
export function getOptimizationRecommendations() {
  const health = getHealthStatus();
  const recommendations = [];

  if (health.metrics.averageResponseTime > thresholds.maxResponseTime) {
    recommendations.push({
      issue: 'High response time',
      recommendation: 'Consider increasing Lambda memory allocation or optimizing database queries',
      priority: 'high'
    });
  }

  if (health.metrics.coldStartRate > 20) { // 20% cold start rate
    recommendations.push({
      issue: 'High cold start rate',
      recommendation: 'Consider using provisioned concurrency or Lambda warming',
      priority: 'medium'
    });
  }

  if (health.metrics.errorRate > 5) { // 5% error rate
    recommendations.push({
      issue: 'High error rate',
      recommendation: 'Review error logs and improve error handling',
      priority: 'high'
    });
  }

  if (health.metrics.dbConnectionTime > thresholds.maxDbConnectionTime) {
    recommendations.push({
      issue: 'Slow database connections',
      recommendation: 'Optimize connection pooling or consider connection caching',
      priority: 'medium'
    });
  }

  const currentMemory = trackMemoryUsage();
  if (currentMemory.heapUsed > thresholds.maxMemoryUsage) {
    recommendations.push({
      issue: 'High memory usage',
      recommendation: 'Review memory leaks or increase Lambda memory allocation',
      priority: 'high'
    });
  }

  return recommendations;
}

/**
 * Create performance middleware for Express
 */
export function createPerformanceMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();

    // Track memory usage at request start
    trackMemoryUsage();

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (...args) {
      const responseTime = Date.now() - startTime;
      trackRequest(responseTime, res.statusCode);

      // Add performance headers
      res.set({
        'X-Response-Time': `${responseTime}ms`,
        'X-Memory-Usage': `${trackMemoryUsage().heapUsed}MB`
      });

      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Lambda context performance tracking
 */
export function trackLambdaContext(context) {
  const remainingTime = context.getRemainingTimeInMillis();
  const memoryLimit = context.memoryLimitInMB;

  debugLog(`Lambda context: ${remainingTime}ms remaining, ${memoryLimit}MB limit`);

  return {
    remainingTime,
    memoryLimit,
    requestId: context.awsRequestId,
    functionName: context.functionName
  };
}

export default {
  trackColdStart,
  trackWarmStart,
  trackRequest,
  trackDatabaseConnection,
  trackMemoryUsage,
  getMetrics,
  getHealthStatus,
  resetMetrics,
  getOptimizationRecommendations,
  createPerformanceMiddleware,
  trackLambdaContext
};
