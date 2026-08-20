import express, { Application, Request as ExpressRequest } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

// Import routers
import healthRouter, { requestTracker } from './routes/health.routes';
import authRouter from './routes/auth.routes';
import paymentsRouter from './routes/payments.routes';
import payseraPaymentsRouter from './routes/payments.paysera.routes';
import walletRouter from './routes/wallet.routes';
import favoritesRouter from './routes/favorites.routes';
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
import emailWebhookRouter from './routes/emailWebhook.routes';
import cardsRouter from './routes/cards.routes';
import notificationsRouter from './routes/notifications.routes';
import plansRouter from './routes/plans.routes';
import partnersRouter from './routes/partners.routes';
import partnerTypesRouter from './routes/partnerTypes.routes';
import bulkImportRouter from './routes/bulkImport.routes';
import adminCashbackRouter from './routes/adminCashback.routes';
import adminAlertsRouter from './routes/adminAlerts.routes';
import adminPartnersRouter from './routes/adminPartners.routes';
import adminSubscribersRouter from './routes/adminSubscribers.routes';
import adminMenusRouter, { adminVenueMenuRouter } from './routes/adminMenus.routes';
import adminPayoutsRouter from './routes/adminPayouts.routes';
import adminTransactionsRouter from './routes/adminTransactions.routes';
import adminSubscriptionsRouter from './routes/adminSubscriptions.routes';
import adminAdminsRouter from './routes/adminAdmins.routes';
import adminSettingsRouter from './routes/adminSettings.routes';
import adminFinanceRouter from './routes/adminFinance.routes';
import adminControlRouter from './routes/adminControl.routes';
import adminHelpRouter from './routes/adminHelp.routes';
import adminDashboardRouter from './routes/adminDashboard.routes';
import helpRouter from './routes/help.routes';
import partnerHelpRouter from './routes/partnerHelp.routes';
import adminProfileRouter from './routes/adminProfile.routes';
import adminMarketingRouter from './routes/adminMarketing.routes';
import unsubscribeRouter from './routes/unsubscribe.routes';
import contactRouter from './routes/contact.routes';
import dashboardRouter from './routes/dashboard.routes';
import pendingCheckoutRouter from './routes/pending-checkout.routes';
import { mobileConfigRouter, mobileErrorsRouter } from './routes/mobileConfig.routes';
import settingsRouter from './routes/settings.routes';

// Import WebSocket handler
import { initializeWebSocket } from './websocket/server';
import { setIO } from './lib/socket';

// Import job scheduler
import { registerScheduledJobs } from './jobs/scheduler';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { csrfProtection } from './middleware/security.middleware';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import SentryConfig from './config/sentry.config';
import { setupSwagger } from './config/swagger.config';
import monitoring from './config/monitoring.config';
import { applyRateLimiters } from './config/security.config';

// Load environment variables
dotenv.config();

// Validate critical env vars early — fail fast rather than at first request
if (process.env.NODE_ENV === 'production') {
  const required = [
    'JWT_SECRET', 'DATABASE_URL', 'API_BASE_URL', 'FRONTEND_URL',
    // Stripe: only the secret is required at boot. Webhook + price IDs are enforced at
    // runtime by the billing path so boot isn't blocked while Stripe setup is in progress.
    'STRIPE_SECRET_KEY',
    // Cloudflare R2 storage
    'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME', 'R2_PUBLIC_URL',
    // AES-256-GCM key for partner integration credentials at rest
    'INTEGRATION_CREDENTIALS_KEY',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  // INTEGRATION_CREDENTIALS_KEY must be exactly 64 hex characters (32 bytes for AES-256-GCM).
  // A wrong-length key passes the presence check above but blows up at the first POST /connect.
  const _credKey = process.env.INTEGRATION_CREDENTIALS_KEY;
  if (Buffer.from(_credKey!, 'hex').length !== 32) {
    throw new Error('INTEGRATION_CREDENTIALS_KEY must be exactly 64 hex characters (32 bytes)');
  }
  // If price IDs ARE set, still catch placeholder defaults — prevents silent 400s at charge time.
  for (const k of ['STRIPE_BASIC_PRICE_ID', 'STRIPE_PREMIUM_PRICE_ID']) {
    const v = process.env[k];
    if (v && (!v.startsWith('price_') || v === `price_${k.split('_')[1]}`)) {
      throw new Error(`${k} is set to a placeholder value (${v}); use the real Stripe price ID`);
    }
  }
}

const app = express();
const httpServer = createServer(app);

// Initialize Sentry for error tracking (must be first)
SentryConfig.init(app as any);

// Parse CORS_ORIGIN to support multiple origins.
// If CORS_ORIGIN="*", reflect the actual request origin so credentials work.
// Otherwise split the comma-separated list; fallback includes production + local dev.
const _rawCorsOrigin = process.env.CORS_ORIGIN;
const corsOrigins: string[] | boolean = (_rawCorsOrigin && _rawCorsOrigin !== '*')
  ? _rawCorsOrigin.split(',').map(origin => origin.trim())
  : [
      'https://boomcard.eu',
      'https://boomcard.bg',
      'https://mobile.boomcard.bg',
      'https://boomcard.vercel.app',
      'http://localhost:3021',
      'http://localhost:3022',
      'http://localhost:3023',
      'http://localhost:3024',
      'http://localhost:3025',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:5177',
      'http://localhost:5178',
      'http://localhost:5179',
      'http://localhost:5180',
      'http://localhost:5181',
      'http://localhost:5182',
      'http://localhost:5183',
      'http://localhost:5184',
      'http://localhost:5185',
      'http://localhost:5186',
      'http://localhost:5187',
      'http://localhost:5188',
      'http://localhost:5189',
      'http://localhost:5190',
    ];

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

// Trust first proxy (Fly.io) for correct client IP in rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Webhook routes need the raw body for signature verification.
// Mount raw parsers BEFORE express.json() so the body isn't parsed as JSON.
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use('/api/email/inbound', express.raw({ type: 'application/json' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sentry request tracking (must be after body parsing)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(SentryConfig.requestHandler());
  app.use(SentryConfig.tracingHandler());
}

// Signature-verified helper: used exclusively for rate-limit key derivation.
// Only cryptographically valid tokens get user-ID key derivation;
// invalid/expired/forged tokens fall through to null (IP bucket).
function extractRateLimitUserId(req: ExpressRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || '') as any;
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null;
  }
}

// Unauthenticated global limiter: IP-keyed, 100/min.
// Skipped for authenticated requests (they have their own bucket).
const unauthGlobalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100') || 100,
  keyGenerator: (req) => `ip:${req.ip || 'unknown'}`,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return true;
    return extractRateLimitUserId(req) !== null;
  },
});

// Authenticated global limiter: user-ID-keyed, 300/min.
// Prevents admin dashboard concurrent-request bursts from tripping IP-based limits.
// Skipped for unauthenticated requests (handled by unauthGlobalLimiter).
const authGlobalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') || 60000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_GLOBAL_MAX_REQUESTS || '300') || 300,
  keyGenerator: (req) => {
    const uid = extractRateLimitUserId(req);
    return uid ? `user:${uid}` : `ip:${req.ip || 'unknown'}`;
  },
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return true;
    return extractRateLimitUserId(req) === null;
  },
});

app.use('/api/', unauthGlobalLimiter);
app.use('/api/', authGlobalLimiter);

// Route-specific rate limiters (auth, payment, upload) — production-only guard is inside the function
applyRateLimiters(app);

// CSRF protection: reject cross-origin state-mutating requests
// Webhooks excluded because they come from external servers (no Origin header or known 3rd-party origin)
app.use('/api/', csrfProtection(['/webhooks']));

// Request metrics tracking (for /api/health/metrics)
app.use(requestTracker);

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
    console.error('[ready] database check error:', error);
    res.status(503).json({
      status: 'not ready',
      database: 'disconnected',
    });
  }
});

// API Documentation (Swagger)
setupSwagger(app);

// API Routes
app.use('/api/health', healthRouter); // Health checks (monitoring)
app.use('/api/webhooks', webhooksRouter); // Webhooks (must be first for raw body)
app.use('/api/email', emailWebhookRouter); // Spec §11.2 — inbound email webhook (HMAC or X-Webhook-Secret)
app.use('/api/plans', plansRouter); // Public plans API (no auth required)
app.use('/api/unsubscribe', unsubscribeRouter); // §12 One-click email unsubscribe (GDPR, no auth required)
app.use('/api/contact', contactRouter); // Public contact form (no auth required)
app.use('/api/config/mobile', mobileConfigRouter); // Public mobile app config (feature flags, versions, status)
app.use('/api/mobile/errors', mobileErrorsRouter); // Mobile error ingest (public, rate-limited)
app.use('/api/settings', settingsRouter); // Public settings API (e.g. currency display mode, no auth required)
app.use('/api/auth', authRouter);
app.use('/api/checkout', pendingCheckoutRouter); // Payment-first onboarding (no auth required)
app.use('/api/payments', payseraPaymentsRouter); // Paysera payment routes
app.use('/api/dashboard', dashboardRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/messaging', messagingRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/sidebar', sidebarRouter);
app.use('/api/partners', partnersRouter);
app.use('/api/admin/cashback', adminCashbackRouter);
app.use('/api/admin/alerts', adminAlertsRouter);
// TODO(routing): adminPartnersRouter handles two concerns in one router —
// the partner application pipeline (§5.1/§5.2, semantically /api/admin/partner-requests)
// AND active-partner management (§5.3, risk-flag, partner-status — semantically
// /api/admin/partners). Splitting into two separate routers and mounting each at its
// correct path is the clean fix. Until the split is done (requires updating every
// admin UI caller at the same time), the router stays mounted at /partner-requests
// to avoid breaking existing frontend API calls. Track as a refactor task.
app.use('/api/admin/partner-requests', adminPartnersRouter);
app.use('/api/admin/subscribers', adminSubscribersRouter);
app.use('/api/admin/payouts', adminPayoutsRouter);
app.use('/api/admin/transactions', adminTransactionsRouter);
app.use('/api/admin/subscriptions', adminSubscriptionsRouter);
app.use('/api/admin/admins', adminAdminsRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin/finance', adminFinanceRouter);
app.use('/api/admin/control', adminControlRouter);
app.use('/api/admin/help', adminHelpRouter);
app.use('/api/admin/dashboard', adminDashboardRouter);
app.use('/api/help', helpRouter);
app.use('/api/partner/help', partnerHelpRouter);
app.use('/api/admin/me', adminProfileRouter);
app.use('/api/admin/marketing', adminMarketingRouter);
app.use('/api/admin/partner-types', partnerTypesRouter);
app.use('/api/admin/bulk-import', bulkImportRouter);
app.use('/api/admin/menus', adminMenusRouter);
app.use('/api/admin/venues', adminVenueMenuRouter);
app.use('/api/offers', offersRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/stickers', stickersRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/notifications', notificationsRouter);
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

// Sentry error handler (must be before general error handler)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(SentryConfig.errorHandler());
}

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize WebSocket server
initializeWebSocket(io);
// Expose io to non-route modules (notification.service uses it to push live events).
setIO(io);

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

      // Start production monitoring (memory checks, self health check, alerting)
      monitoring.startMonitoring(Number(PORT));

      // Register nightly background jobs (cashback expiry, manual-review expiry)
      registerScheduledJobs();
    });
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    logger.error('⚠️  Server startup aborted');
    process.exit(1);
  }
}

// Don't auto-start in test environment (supertest handles binding)
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');

  // Flush Sentry events before shutdown
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    await SentryConfig.flush(2000);
  }

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');

  // Flush Sentry events before shutdown
  if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
    await SentryConfig.flush(2000);
  }

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, httpServer, io };
