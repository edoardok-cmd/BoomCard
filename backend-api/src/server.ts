import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

// Import routers
import authRouter from './routes/auth.routes';
import paymentsRouter from './routes/payments.routes';
import walletRouter from './routes/wallet.routes';
import subscriptionsRouter from './routes/subscriptions.routes';
import loyaltyRouter from './routes/loyalty.routes';
import messagingRouter from './routes/messaging.routes';
import bookingsRouter from './routes/bookings.routes';
import venuesRouter from './routes/venues.routes';
import sidebarRouter from './routes/sidebar.routes';
import offersRouter from './routes/offers.routes';
import integrationsRouter from './routes/integrations.routes';
import reviewsRouter from './routes/reviews.routes';
import stickersRouter from './routes/stickers.routes';
import receiptsRouter from './routes/receipts.routes';
import receiptsEnhancedRouter from './routes/receipts.enhanced.routes';
import webhooksRouter from './routes/webhooks.routes';
import cardsRouter from './routes/cards.routes';

// Import WebSocket handler
import { initializeWebSocket } from './websocket/server';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';

// Load environment variables
dotenv.config();

const app: Application = express();
const httpServer = createServer(app);

// Parse CORS_ORIGIN to support multiple origins
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178'];

const io = new SocketServer(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Port configuration
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 4000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Stripe webhooks need raw body for signature verification
// IMPORTANT: This must come BEFORE express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute window
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // 1000 requests per minute in dev
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => process.env.NODE_ENV === 'development', // Skip rate limiting in development
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// Readiness check (includes database connectivity)
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

// API Routes
app.use('/api/webhooks', webhooksRouter); // Webhooks (must be first for raw body)
app.use('/api/auth', authRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/messaging', messagingRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/sidebar', sidebarRouter);
app.use('/api/offers', offersRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/stickers', stickersRouter);
app.use('/api/cards', cardsRouter);
// Enhanced receipts routes with fraud detection (mounted BEFORE base receipts to avoid conflicts)
app.use('/api/receipts/v2', receiptsEnhancedRouter);
app.use('/api/receipts', receiptsRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize WebSocket server
initializeWebSocket(io);

// Start HTTP server with database connectivity check
async function startServer() {
  try {
    // Test database connectivity before starting server
    logger.info('🔍 Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connected successfully');

    // Bind to 0.0.0.0 to accept external connections (required for Render deployment)
    httpServer.listen(Number(PORT), '0.0.0.0', () => {
      logger.info(`🚀 BoomCard API Server started on port ${PORT}`);
      logger.info(`📡 WebSocket server ready on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 CORS enabled for: ${process.env.CORS_ORIGIN}`);
    });
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    logger.error('⚠️  Server startup aborted');
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, httpServer, io };
