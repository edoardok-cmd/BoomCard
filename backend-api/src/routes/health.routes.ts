/**
 * Health Check Routes
 *
 * Provides health check endpoints for monitoring and alerting
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getRedisConnection } from '../queues/redis';

const router = Router();

// In-memory request metrics (resets on restart, which is acceptable)
const requestMetrics = {
  totalRequests: 0,
  totalErrors: 0,   // 5xx responses
  startedAt: Date.now(),
  latencies: [] as number[], // last 100 request durations
};

/**
 * Middleware to track request metrics.
 * Mount this at the app level: app.use(requestTracker)
 */
export function requestTracker(req: Request, res: Response, next: Function): void {
  const start = Date.now();
  requestMetrics.totalRequests++;

  res.on('finish', () => {
    const duration = Date.now() - start;
    requestMetrics.latencies.push(duration);
    if (requestMetrics.latencies.length > 100) {
      requestMetrics.latencies.shift();
    }
    if (res.statusCode >= 500) {
      requestMetrics.totalErrors++;
    }
  });

  next();
}

/**
 * Basic health check
 * GET /api/health
 *
 * Returns 200 if server is running
 */
router.get('/', async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'BoomCard API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * Detailed health check
 * GET /api/health/detailed
 *
 * Checks all system dependencies
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: { status: 'unknown', responseTime: 0 } as { status: string; responseTime: number; error?: string },
      redis: { status: 'unknown', responseTime: 0 } as { status: string; responseTime: number; error?: string },
      s3: { status: 'unknown' } as { status: string; error?: string },
      paysera: { status: 'unknown' },
      email: { status: 'unknown' },
    },
  };

  try {
    // Check database connection
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbTime = Date.now() - dbStart;
    health.checks.database = { status: 'ok', responseTime: dbTime };
  } catch (error) {
    health.checks.database = {
      status: 'error',
      responseTime: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check Redis — reuse the shared ioredis singleton; no new client per call.
  // The singleton is configured with maxRetriesPerRequest: null (required by BullMQ), so
  // ping() would retry indefinitely under a network partition. Guard with a 3-second race.
  const redisConn = getRedisConnection();
  if (redisConn) {
    const redisStart = Date.now();
    let pingTimeoutHandle: NodeJS.Timeout | undefined;
    try {
      const pingTimeout = new Promise<never>((_, reject) => {
        pingTimeoutHandle = setTimeout(
          () => reject(new Error('Redis ping timeout')),
          3000,
        );
      });
      await Promise.race([redisConn.ping(), pingTimeout]);
      health.checks.redis = { status: 'ok', responseTime: Date.now() - redisStart };
    } catch (error) {
      health.checks.redis = {
        status: 'error',
        responseTime: Date.now() - redisStart,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (pingTimeoutHandle) clearTimeout(pingTimeoutHandle);
    }
  } else {
    health.checks.redis = { status: 'not_configured', responseTime: 0 };
  }

  // Check S3 (basic config check)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) {
    health.checks.s3 = { status: 'configured' };
  } else {
    health.checks.s3 = { status: 'not_configured' };
  }

  // Check Paysera config
  if (process.env.PAYSERA_PROJECT_ID && process.env.PAYSERA_SIGN_PASSWORD) {
    health.checks.paysera = { status: 'configured' };
  } else {
    health.checks.paysera = { status: 'not_configured' };
  }

  // Check Email config
  if (process.env.RESEND_API_KEY) {
    health.checks.email = { status: 'configured' };
  } else {
    health.checks.email = { status: 'not_configured' };
  }

  // Overall health status
  const hasErrors = Object.values(health.checks).some(
    (check) => typeof check === 'object' && 'status' in check && check.status === 'error'
  );

  if (hasErrors) {
    health.status = 'unhealthy';
    res.status(503).json(health);
  } else {
    res.status(200).json(health);
  }
});

/**
 * Readiness check
 * GET /api/health/ready
 *
 * Returns 200 when service is ready to accept traffic
 * Used by load balancers and orchestrators
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if database is accessible
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Liveness check
 * GET /api/health/live
 *
 * Returns 200 if process is alive
 * Used by Kubernetes liveness probes
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime(),
  });
});

/**
 * Metrics endpoint
 * GET /api/health/metrics
 *
 * Returns system metrics for monitoring
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    // Database stats
    const userCount = await prisma.user.count();
    const venueCount = await prisma.venue.count();
    const stickerCount = await prisma.sticker.count();
    const receiptCount = await prisma.receipt.count();
    const transactionCount = await prisma.transaction.count();

    // System stats
    const memoryUsage = process.memoryUsage();

    // Compute latency percentiles
    const sortedLatencies = [...requestMetrics.latencies].sort((a, b) => a - b);
    const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
    const uptimeSec = (Date.now() - requestMetrics.startedAt) / 1000;

    res.status(200).json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
      requests: {
        total: requestMetrics.totalRequests,
        errors: requestMetrics.totalErrors,
        errorRate: requestMetrics.totalRequests > 0
          ? (requestMetrics.totalErrors / requestMetrics.totalRequests * 100).toFixed(2) + '%'
          : '0%',
        rps: uptimeSec > 0 ? (requestMetrics.totalRequests / uptimeSec).toFixed(2) : '0',
        latency: {
          p50,
          p95,
          p99,
          samples: sortedLatencies.length,
        },
      },
      database: {
        users: userCount,
        venues: venueCount,
        stickers: stickerCount,
        receipts: receiptCount,
        transactions: transactionCount,
      },
      process: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Ping endpoint
 * GET /api/health/ping
 *
 * Simple ping/pong response
 */
router.get('/ping', (req: Request, res: Response) => {
  res.status(200).send('pong');
});

export default router;
