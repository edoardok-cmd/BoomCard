/**
 * Enhanced Production Server Configuration Example
 *
 * This file shows how to integrate all security middleware
 * Copy relevant sections to your server.ts for production
 */

import express, { Application } from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

// Security configuration
import {
  applySecurityMiddleware,
  applyRateLimiters,
  validateSecurityConfig,
} from './config/security.config';

// Import routers
import authRouter from './routes/auth.routes';
import paymentsRouter from './routes/payments.routes';
import webhooksRouter from './routes/webhooks.routes';
import loyaltyRouter from './routes/loyalty.routes';
import receiptsRouter from './routes/receipts.routes';
// ... other routers

// Middleware
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Load environment variables
dotenv.config();

// Validate security configuration before starting
validateSecurityConfig();

const app: Application = express();
const httpServer = createServer(app);

// WebSocket server
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [],
    credentials: true,
  },
});

// ============================================
// SECURITY MIDDLEWARE (Order is important!)
// ============================================

// Step 1: Apply all security middleware
applySecurityMiddleware(app);

// Step 2: Stripe webhooks need raw body (BEFORE express.json())
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Step 3: Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Step 4: Apply rate limiters to specific routes
applyRateLimiters(app);

// Step 5: Request logging (after security middleware)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.headers['x-request-id'],
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  next();
});

// ============================================
// HEALTH CHECK & MONITORING
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Readiness check (includes database)
app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// API ROUTES
// ============================================

// Webhooks (MUST be first for raw body)
app.use('/api/webhooks', webhooksRouter);

// Authentication
app.use('/api/auth', authRouter);

// Protected routes (require authentication)
app.use('/api/payments', paymentsRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/receipts', receiptsRouter);
// ... other routes

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler (MUST be last)
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  logger.info('═'.repeat(50));
  logger.info('🚀 BOOM Card API Server Started');
  logger.info('═'.repeat(50));
  logger.info(`📡 Port: ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🔐 Security: ENABLED`);
  logger.info(`🗄️  Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'Unknown'}`);
  logger.info(`🔗 CORS Origins: ${process.env.CORS_ORIGIN || 'Development'}`);
  logger.info(`📊 Logging Level: ${process.env.LOG_LEVEL || 'info'}`);
  logger.info('═'.repeat(50));

  // Log security warnings for development
  if (process.env.NODE_ENV !== 'production') {
    logger.warn('⚠️  Running in development mode');
    logger.warn('⚠️  Rate limiting is DISABLED');
    logger.warn('⚠️  Some security features are relaxed');
  }
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} signal received: starting graceful shutdown`);

  // Close HTTP server
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    // Close WebSocket connections
    io.close(() => {
      logger.info('WebSocket server closed');
    });

    // Close database connections
    try {
      await prisma.$disconnect();
      logger.info('Database connections closed');
    } catch (error) {
      logger.error('Error closing database:', error);
    }

    // Exit process
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export { app, httpServer, io };
