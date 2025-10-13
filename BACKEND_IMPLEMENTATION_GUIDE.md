# Backend Implementation Guide - BoomCard API

## 🎯 Overview

This guide will help you implement the backend API for your BoomCard Partner Dashboard. The backend structure has been started in `/backend-api/` directory.

---

## ✅ What's Already Done

I've created the foundation for you:

```
backend-api/
├── package.json          ✅ Dependencies defined
├── tsconfig.json         ✅ TypeScript config
├── .env.example          ✅ Environment template
└── src/
    ├── server.ts         ✅ Main server with routing
    ├── middleware/
    │   ├── auth.middleware.ts    ✅ JWT authentication
    │   └── error.middleware.ts   ✅ Error handling
    ├── routes/
    │   └── payments.routes.ts    ✅ Mock payment endpoints
    └── utils/
        └── logger.ts     ✅ Winston logger
```

---

## 🚀 Quick Start (5 minutes)

### Step 1: Install Dependencies

```bash
cd /Users/administrator/Documents/BoomCard/backend-api
npm install
```

### Step 2: Set Up Environment

```bash
cp .env.example .env
# Edit .env and add your keys
```

### Step 3: Start Development Server

```bash
npm run dev
```

The API will start on `http://localhost:3000`

### Step 4: Test It Works

```bash
# Health check
curl http://localhost:3000/health

# Should return:
# {"status":"ok","timestamp":"...","uptime":...}
```

---

## 📋 Implementation Roadmap

### Week 1: Core Backend (Priority 1)

#### Day 1-2: Database Setup

**1. Install PostgreSQL**
```bash
# macOS
brew install postgresql@15
brew services start postgresql

# Create database
createdb boomcard
```

**2. Set up Prisma ORM**
```bash
cd backend-api
npm install prisma @prisma/client
npx prisma init
```

**3. Create Prisma Schema** (`prisma/schema.prisma`):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  password      String
  firstName     String
  lastName      String
  role          String    @default("customer")
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  transactions  Transaction[]
  loyaltyAccount LoyaltyAccount?
  conversations  ConversationParticipant[]
}

model Transaction {
  id            String    @id @default(uuid())
  userId        String
  type          String
  status        String
  amount        Decimal   @db.Decimal(10, 2)
  currency      String    @default("BGN")
  fee           Decimal   @db.Decimal(10, 2)
  tax           Decimal   @db.Decimal(10, 2)
  netAmount     Decimal   @db.Decimal(10, 2)
  description   String
  descriptionBg String
  paymentMethod String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}

model LoyaltyAccount {
  id                String    @id @default(uuid())
  userId            String    @unique
  totalPoints       Int       @default(0)
  availablePoints   Int       @default(0)
  lifetimeEarned    Int       @default(0)
  lifetimeRedeemed  Int       @default(0)
  tier              String    @default("bronze")
  tierProgress      Int       @default(0)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  user              User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([tier])
}

model Conversation {
  id            String    @id @default(uuid())
  type          String
  title         String
  titleBg       String?
  lastMessageAt DateTime?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  participants  ConversationParticipant[]
  messages      Message[]

  @@index([isActive])
}

model ConversationParticipant {
  id             String    @id @default(uuid())
  conversationId String
  userId         String
  unreadCount    Int       @default(0)
  isMuted        Boolean   @default(false)
  isPinned       Boolean   @default(false)
  joinedAt       DateTime  @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@unique([conversationId, userId])
  @@index([userId])
}

model Message {
  id             String    @id @default(uuid())
  conversationId String
  senderId       String
  type           String
  content        String
  status         String    @default("sent")
  createdAt      DateTime  @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])

  @@index([conversationId])
  @@index([createdAt])
}
```

**4. Run Migrations**
```bash
npx prisma migrate dev --name init
npx prisma generate
```

#### Day 3-4: Authentication Routes

Create `src/routes/auth.routes.ts`:

```typescript
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, AppError } from '../middleware/error.middleware';

const router = Router();
const prisma = new PrismaClient();

// Register
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
    },
  });

  // Create loyalty account
  await prisma.loyaltyAccount.create({
    data: { userId: user.id },
  });

  // Generate token
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    token,
  });
}));

// Login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new AppError('Invalid credentials', 401);
  }

  // Generate token
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    token,
  });
}));

export default router;
```

#### Day 5-6: Venue & Booking Routes

Create basic CRUD operations for venues and bookings.

#### Day 7: Testing & Bug Fixes

Write tests and fix any issues found.

---

### Week 2: Payment Integration (Priority 2)

#### Install Stripe SDK

```bash
npm install stripe
```

#### Create Stripe Service (`src/services/stripe.service.ts`):

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export class StripeService {
  async createPaymentIntent(amount: number, currency: string = 'bgn') {
    return await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async confirmPaymentIntent(intentId: string) {
    return await stripe.paymentIntents.confirm(intentId);
  }

  async createCustomer(email: string, name: string) {
    return await stripe.customers.create({
      email,
      name,
    });
  }

  async attachPaymentMethod(customerId: string, paymentMethodId: string) {
    return await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async createRefund(paymentIntentId: string, amount?: number) {
    return await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount ? Math.round(amount * 100) : undefined,
    });
  }
}

export const stripeService = new StripeService();
```

#### Update Payment Routes

Replace mock implementations in `src/routes/payments.routes.ts` with real Stripe calls.

#### Set Up Webhooks

```typescript
// src/routes/webhooks.routes.ts
import { Router } from 'express';
import Stripe from 'stripe';
import { stripeService } from '../services/stripe.service';

const router = Router();

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature']!;

  let event: Stripe.Event;

  try {
    event = Stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events
  switch (event.type) {
    case 'payment_intent.succeeded':
      // Update transaction status
      break;
    case 'payment_intent.payment_failed':
      // Handle failed payment
      break;
  }

  res.json({ received: true });
});

export default router;
```

---

### Week 3: Loyalty & Messaging (Priority 3)

#### Loyalty Routes (`src/routes/loyalty.routes.ts`)

```typescript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Get loyalty account
router.get('/accounts/me', asyncHandler(async (req: any, res) => {
  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId: req.user.id },
  });

  res.json(account);
}));

// Earn points
router.post('/earn', asyncHandler(async (req: any, res) => {
  const { points, type, description } = req.body;

  const account = await prisma.loyaltyAccount.update({
    where: { userId: req.user.id },
    data: {
      totalPoints: { increment: points },
      availablePoints: { increment: points },
      lifetimeEarned: { increment: points },
    },
  });

  res.json(account);
}));

export default router;
```

#### WebSocket Server (`src/websocket/server.ts`)

```typescript
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function initializeWebSocket(io: SocketServer) {
  // Authentication middleware
  io.use((socket: any, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: any) => {
    logger.info(`User connected: ${socket.userId}`);

    // Join user's room
    socket.join(`user:${socket.userId}`);

    // Handle messaging events
    socket.on('send_message', async (data: any) => {
      const { conversationId, content } = data;

      // Save message to database
      // Emit to conversation participants

      io.to(`conversation:${conversationId}`).emit('new_message', {
        conversationId,
        message: {
          id: 'msg-id',
          content,
          senderId: socket.userId,
          createdAt: new Date().toISOString(),
        },
      });
    });

    // Handle typing indicators
    socket.on('typing', (data: any) => {
      const { conversationId } = data;
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        conversationId,
        userId: socket.userId,
      });
    });

    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.userId}`);
    });
  });
}
```

---

## 🧪 Testing

### Set Up Jest

Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
```

### Example Test (`src/__tests__/auth.test.ts`)

```typescript
import request from 'supertest';
import { app } from '../server';

describe('Authentication', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'test@example.com');
    });

    it('should reject duplicate email', async () => {
      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      // Try to register again
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          firstName: 'Jane',
          lastName: 'Doe',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('already registered');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login existing user', async () => {
      // Register user first
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
          firstName: 'John',
          lastName: 'Doe',
        });

      // Login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });
  });
});
```

### Run Tests

```bash
npm test
npm run test:watch  # Watch mode
```

---

## 🚀 Deployment

### Prepare for Production

**1. Environment Variables**
```bash
# Update .env for production
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/boomcard
REDIS_URL=redis://prod-redis:6379
JWT_SECRET=<strong-random-secret>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**2. Build**
```bash
npm run build
```

**3. Start Production Server**
```bash
NODE_ENV=production npm start
```

### Deploy to Render.com (Free Tier)

**1. Create `render.yaml`:**
```yaml
services:
  - type: web
    name: boomcard-api
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: boomcard-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: NODE_ENV
        value: production

databases:
  - name: boomcard-db
    databaseName: boomcard
    user: boomcard
```

**2. Push to GitHub and connect to Render**

---

## 📊 Monitoring & Logging

### Add Health Checks

```typescript
// Detailed health check
router.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'ok',
      redis: 'ok',
      stripe: 'ok',
    },
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    health.services.database = 'error';
    health.status = 'degraded';
  }

  res.json(health);
});
```

### Error Tracking (Sentry)

```bash
npm install @sentry/node
```

```typescript
// src/server.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// Add before other middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

---

## 🔒 Security Checklist

- [ ] Environment variables secured
- [ ] HTTPS enforced
- [ ] Rate limiting configured
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (use Prisma)
- [ ] XSS protection (helmet middleware)
- [ ] CORS configured properly
- [ ] JWT tokens have expiration
- [ ] Passwords hashed with bcrypt
- [ ] API keys not committed to git
- [ ] Database backups configured
- [ ] Error messages don't leak sensitive data

---

## 📈 Performance Optimization

### Add Redis Caching

```typescript
import Redis from 'redis';

const redis = Redis.createClient({
  url: process.env.REDIS_URL,
});

await redis.connect();

// Cache middleware
export const cache = (ttl: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `cache:${req.originalUrl}`;
    const cached = await redis.get(key);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Override res.json to cache
    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      redis.setEx(key, ttl, JSON.stringify(data));
      return originalJson(data);
    };

    next();
  };
};

// Usage
router.get('/venues', cache(300), asyncHandler(async (req, res) => {
  // ...
}));
```

---

## 🎯 Next Steps

1. **This Week:**
   - [ ] Install dependencies: `cd backend-api && npm install`
   - [ ] Set up database (PostgreSQL + Prisma)
   - [ ] Implement auth routes
   - [ ] Test with frontend

2. **Next Week:**
   - [ ] Integrate Stripe
   - [ ] Implement payment endpoints
   - [ ] Set up webhooks

3. **Week 3:**
   - [ ] Implement loyalty routes
   - [ ] Set up WebSocket server
   - [ ] Write tests

4. **Week 4:**
   - [ ] Deploy to staging
   - [ ] Performance testing
   - [ ] Security audit

---

## 📞 Need Help?

- **API Contract:** Check frontend service files (`partner-dashboard/src/services/*.service.ts`)
- **Database Schema:** See Prisma schema above
- **Testing Examples:** Check `__tests__` folder
- **Deployment:** Follow Render.com guide above

---

**You now have everything you need to build a production-ready backend!** 🚀

Start with: `cd backend-api && npm install && npm run dev`
