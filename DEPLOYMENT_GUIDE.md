# BoomCard Platform - Deployment Guide

## 🚀 Complete Deployment Instructions

This guide will help you deploy the complete BoomCard platform to production.

---

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+ (optional but recommended)
- Stripe account
- ePay.bg account (for Bulgarian payments)
- Domain name with SSL certificate

---

## Step 1: Database Setup

### Option A: Using Docker (Recommended for Development)

```bash
# Start PostgreSQL
docker run -d \
  --name boomcard-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_USER=boomcard \
  -e POSTGRES_DB=boomcard \
  -p 5432:5432 \
  postgres:14

# Start Redis
docker run -d \
  --name boomcard-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### Option B: Managed Services (Recommended for Production)

**PostgreSQL:**
- Supabase (https://supabase.com) - Free tier available
- PlanetScale (https://planetscale.com) - Serverless PostgreSQL
- AWS RDS
- DigitalOcean Managed Databases

**Redis:**
- Upstash (https://upstash.com) - Serverless Redis
- Redis Cloud (https://redis.com)
- AWS ElastiCache

---

## Step 2: Environment Configuration

Create `.env` file in the project root:

```env
# ============================================
# Database
# ============================================
DATABASE_URL="postgresql://boomcard:password@localhost:5432/boomcard"
REDIS_URL="redis://localhost:6379"

# ============================================
# Authentication
# ============================================
JWT_SECRET="your-super-secret-jwt-key-minimum-32-characters-long"
JWT_REFRESH_SECRET="your-refresh-token-secret-minimum-32-characters"
NEXTAUTH_SECRET="your-nextauth-secret-for-oauth-providers"
NEXTAUTH_URL="https://boomcard.bg"

# ============================================
# Payment Providers
# ============================================

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# ePay.bg
EPAY_MERCHANT_ID="your_merchant_id"
EPAY_SECRET="your_epay_secret_key"

# PayPal (if implementing)
PAYPAL_CLIENT_ID="..."
PAYPAL_CLIENT_SECRET="..."

# Borica (if implementing)
BORICA_TERMINAL_ID="..."
BORICA_KEY_PATH="/path/to/certificate.pem"

# ============================================
# POS Systems
# ============================================
BARSY_API_KEY="your_barsy_api_key"
BARSY_MERCHANT_ID="your_merchant_id"

POSTER_TOKEN="your_poster_token"
POSTER_ACCOUNT="yourname.joinposter.com"

# ============================================
# Application
# ============================================
NODE_ENV="production"
PORT="3000"
API_URL="https://api.boomcard.bg"
WS_URL="wss://api.boomcard.bg/ws"
FRONTEND_URL="https://boomcard.bg"

# ============================================
# Email (Optional)
# ============================================
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="noreply@boomcard.bg"
SMTP_PASSWORD="your_smtp_password"

# ============================================
# File Storage (Optional)
# ============================================
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET="boomcard-uploads"
AWS_REGION="eu-central-1"

# ============================================
# Monitoring (Optional)
# ============================================
SENTRY_DSN="https://...@sentry.io/..."
```

---

## Step 3: Install Dependencies

```bash
# Install all dependencies
npm install

# Install Prisma CLI
npm install -D prisma

# Generate Prisma Client
npx prisma generate
```

---

## Step 4: Database Migrations

```bash
# Create initial migration
npx prisma migrate dev --name init

# Or for production deployment
npx prisma migrate deploy

# Seed database with initial data (optional)
npx prisma db seed
```

### Create Seed File

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: 'admin@boomcard.bg',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      emailVerified: true,
    },
  });

  // Create sample partner
  const partner = await prisma.partner.create({
    data: {
      businessName: 'Demo Restaurant',
      email: 'partner@boomcard.bg',
      phone: '+359 88 123 4567',
      subscriptionTier: 'PREMIUM',
      isVerified: true,
    },
  });

  // Create sample venue
  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: 'Made in Blue',
      category: 'RESTAURANT',
      address: '123 Vitosha Blvd',
      city: 'Sofia',
      lat: 42.6977,
      lng: 23.3219,
      rating: 4.8,
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Add to `package.json`:

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

---

## Step 5: Build Frontend

```bash
# Build production bundle
npm run build

# Test production build locally
npm run preview
```

---

## Step 6: Deploy Backend (Node.js/Express Server)

### Create Backend Server

Create `server/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { PrismaClient } from '@prisma/client';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const prisma = new PrismaClient();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import routes
import authRoutes from './routes/auth';
import paymentRoutes from './routes/payments';
import venueRoutes from './routes/venues';
import transactionRoutes from './routes/transactions';

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/transactions', transactionRoutes);

// WebSocket handling
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    // Handle WebSocket messages
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Deploy Backend Options:

#### Option A: Railway.app (Easiest)
1. Push code to GitHub
2. Connect repository to Railway
3. Add environment variables
4. Deploy automatically

#### Option B: Heroku
```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create boomcard-api

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev

# Deploy
git push heroku master
```

#### Option C: AWS/DigitalOcean/Linode
1. Set up Ubuntu server
2. Install Node.js, PostgreSQL, Redis
3. Use PM2 for process management
4. Set up Nginx reverse proxy

```bash
# On server
sudo apt update
sudo apt install nodejs npm postgresql redis-server nginx

# Install PM2
sudo npm install -g pm2

# Start app
pm2 start server/index.ts --name boomcard-api

# Configure Nginx
sudo nano /etc/nginx/sites-available/boomcard
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name api.boomcard.bg;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

---

## Step 7: Deploy Frontend

### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Login and deploy
vercel login
vercel --prod

# Configure environment variables in Vercel dashboard
```

### Option B: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login and deploy
netlify login
netlify deploy --prod

# Configure environment variables in Netlify dashboard
```

### Option C: Static Hosting (Cloudflare Pages, AWS S3 + CloudFront)

```bash
# Build
npm run build

# Upload dist/ folder to your hosting provider
```

---

## Step 8: Configure Payment Webhooks

### Stripe Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://api.boomcard.bg/api/payments/webhooks/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy webhook secret to `.env`

### ePay.bg Webhooks

1. Login to ePay admin panel
2. Configure notification URL: `https://api.boomcard.bg/api/payments/webhooks/epay`
3. Set up checksum verification

### POS Webhooks

Configure similar webhooks for:
- Barsy: `https://api.boomcard.bg/api/pos/webhooks/barsy`
- Poster: `https://api.boomcard.bg/api/pos/webhooks/poster`

---

## Step 9: SSL/TLS Configuration

### Using Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d boomcard.bg -d www.boomcard.bg -d api.boomcard.bg

# Auto-renewal (already configured)
sudo certbot renew --dry-run
```

---

## Step 10: Monitoring & Logging

### Set up Sentry (Error Tracking)

```typescript
// In your app initialization
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

### Set up Application Monitoring

Options:
- New Relic
- Datadog
- Prometheus + Grafana

---

## Step 11: Performance Optimization

### Frontend Optimization

```typescript
// Enable gzip compression
import compression from 'compression';
app.use(compression());

// Add caching headers
app.use((req, res, next) => {
  if (req.url.match(/\.(js|css|jpg|png|svg|woff2)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
  next();
});
```

### Database Optimization

```sql
-- Create indexes for common queries
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(created_at DESC);
CREATE INDEX idx_venues_location ON venues USING gist(ll_to_earth(lat, lng));

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM transactions WHERE user_id = 'xxx';
```

---

## Step 12: Backup Strategy

### Database Backups

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump boomcard > /backups/boomcard_$DATE.sql
gzip /backups/boomcard_$DATE.sql

# Keep only last 30 days
find /backups -name "boomcard_*.sql.gz" -mtime +30 -delete
```

Add to crontab:

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/backup_script.sh
```

---

## Step 13: Testing Deployment

### Health Checks

```bash
# API health
curl https://api.boomcard.bg/health

# Database connection
curl https://api.boomcard.bg/api/health/db

# Redis connection
curl https://api.boomcard.bg/api/health/redis
```

### Integration Tests

```typescript
// Test payment flow
const payment = await fetch('https://api.boomcard.bg/api/payments/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    amount: 100,
    currency: 'BGN',
  }),
});

expect(payment.status).toBe(200);
```

---

## Security Checklist

- [ ] All secrets in environment variables (not in code)
- [ ] HTTPS enabled on all domains
- [ ] CORS configured correctly
- [ ] Rate limiting implemented
- [ ] SQL injection protection (using Prisma)
- [ ] XSS protection headers
- [ ] CSRF tokens for forms
- [ ] Input validation on all endpoints
- [ ] Password hashing (bcrypt)
- [ ] JWT token expiration
- [ ] Webhook signature verification
- [ ] File upload restrictions
- [ ] Database connection pooling
- [ ] Error messages don't leak sensitive info

---

## Maintenance Tasks

### Daily
- Monitor error logs
- Check payment success rate
- Review failed transactions

### Weekly
- Database backup verification
- Security update check
- Performance monitoring review

### Monthly
- Dependency updates
- Security audit
- Load testing
- Backup restore test

---

## Support & Troubleshooting

### Common Issues

**Issue: Database connection fails**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -h localhost -U boomcard -d boomcard
```

**Issue: Payments not processing**
```bash
# Check Stripe webhook logs
# Verify webhook secret matches
# Check payment provider API status
```

**Issue: WebSocket disconnections**
```bash
# Increase connection timeout
# Check firewall settings
# Verify WebSocket URL is correct
```

---

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

## Contact

For deployment support:
- Email: dev@boomcard.bg
- Documentation: https://docs.boomcard.bg

---

**Last Updated:** October 13, 2025
**Version:** 2.0.0
