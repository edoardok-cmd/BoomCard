/**
 * Health Check Routes
 *
 * Provides health check endpoints for monitoring and alerting
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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
    health.status = 'degraded';
    health.checks.database = {
      status: 'error',
      responseTime: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check Redis (if configured)
  if (process.env.REDIS_URL) {
    try {
      // TODO: Add Redis health check when Redis is implemented
      health.checks.redis = { status: 'not_configured', responseTime: 0 };
    } catch (error) {
      health.checks.redis = {
        status: 'error',
        responseTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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

    res.status(200).json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
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
