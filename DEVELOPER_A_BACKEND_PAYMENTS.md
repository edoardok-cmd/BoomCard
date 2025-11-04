# DEVELOPER A - BACKEND PAYMENT SYSTEMS IMPLEMENTATION PLAN

**Role:** Backend Payment Systems Lead
**Timeline:** Days 1-4 (32-40 hours)
**Priority:** CRITICAL PATH
**Technologies:** Node.js, Express, Prisma, Stripe, PostgreSQL

---

## OVERVIEW

You will implement the complete payment infrastructure including:
- Wallet system (database models + API)
- Stripe webhook persistence
- Payment method management
- Subscription system
- Cashback crediting system

---

## DAY 1: DATABASE MODELS & MIGRATIONS (8-10 hours)

### TASK 1.1: Create Wallet Model (2 hours)

**File:** `backend-api/prisma/schema.prisma`

**Add after User model (around line 90):**

```prisma
model Wallet {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  balance           Float    @default(0.0)
  availableBalance  Float    @default(0.0)  // balance - pending withdrawals
  pendingBalance    Float    @default(0.0)  // pending cashback credits
  currency          String   @default("BGN")

  isLocked          Boolean  @default(false)
  lockedReason      String?
  lockedAt          DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  transactions WalletTransaction[]

  @@map("wallets")
}

model WalletTransaction {
  id        String   @id @default(uuid())
  walletId  String
  wallet    Wallet   @relation(fields: [walletId], references: [id], onDelete: Cascade)

  type              WalletTransactionType
  amount            Float
  balanceBefore     Float
  balanceAfter      Float
  currency          String   @default("BGN")

  status            WalletTransactionStatus @default(PENDING)
  description       String?
  metadata          Json?

  // Link to related records
  transactionId         String?  @unique
  transaction           Transaction? @relation(fields: [transactionId], references: [id])
  stripePaymentIntentId String?
  receiptId             String?
  receipt               Receipt? @relation(fields: [receiptId], references: [id])
  stickerScanId         String?
  stickerScan           StickerScan? @relation(fields: [stickerScanId], references: [id])

  createdAt DateTime @default(now())

  @@index([walletId])
  @@index([type])
  @@index([status])
  @@index([createdAt])
  @@map("wallet_transactions")
}

enum WalletTransactionType {
  TOP_UP
  WITHDRAWAL
  CASHBACK_CREDIT
  PURCHASE
  REFUND
  TRANSFER
  ADJUSTMENT
}

enum WalletTransactionStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}
```

**Add to User model (around line 45):**
```prisma
wallet            Wallet?
```

---

### TASK 1.2: Create Subscription Model (1.5 hours)

**File:** `backend-api/prisma/schema.prisma`

**Add after Wallet model:**

```prisma
model Subscription {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  plan              SubscriptionPlan
  status            SubscriptionStatus

  stripeSubscriptionId String?  @unique
  stripePriceId        String?
  stripeCustomerId     String?

  currentPeriodStart DateTime
  currentPeriodEnd   DateTime

  cancelAtPeriodEnd  Boolean   @default(false)
  cancelAt           DateTime?
  canceledAt         DateTime?
  trialStart         DateTime?
  trialEnd           DateTime?

  metadata           Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([status])
  @@index([plan])
  @@map("subscriptions")
}

enum SubscriptionPlan {
  STANDARD   // 5% cashback, free
  PREMIUM    // 7% cashback, 9.99 BGN/month
  PLATINUM   // 10% cashback, 19.99 BGN/month
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELLED
  INCOMPLETE
  INCOMPLETE_EXPIRED
  TRIALING
  UNPAID
  PAUSED
}
```

**Add to User model:**
```prisma
subscriptions     Subscription[]
```

---

### TASK 1.3: Create PaymentMethod Model (1.5 hours)

**File:** `backend-api/prisma/schema.prisma`

**Add after Subscription model:**

```prisma
model PaymentMethod {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  stripePaymentMethodId String   @unique
  type                  String   // "card", "bank_account"

  // Card details (if type = card)
  last4         String?
  brand         String?  // "visa", "mastercard", etc.
  expiryMonth   Int?
  expiryYear    Int?
  funding       String?  // "credit", "debit", "prepaid"

  // Bank account details (if type = bank_account)
  bankName      String?
  accountLast4  String?

  isDefault     Boolean  @default(false)

  billingDetails Json?
  metadata       Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([isDefault])
  @@map("payment_methods")
}
```

**Add to User model:**
```prisma
paymentMethods    PaymentMethod[]
```

---

### TASK 1.4: Update Transaction Model (1 hour)

**File:** `backend-api/prisma/schema.prisma`

**Add to Transaction model (around line 280):**

```prisma
walletTransaction  WalletTransaction?
```

---

### TASK 1.5: Update Receipt Model (30 mins)

**File:** `backend-api/prisma/schema.prisma`

**Add to Receipt model:**

```prisma
walletTransactions WalletTransaction[]
```

---

### TASK 1.6: Update StickerScan Model (30 mins)

**File:** `backend-api/prisma/schema.prisma`

**Add to StickerScan model:**

```prisma
walletTransactions WalletTransaction[]
```

---

### TASK 1.7: Create and Run Migration (2 hours)

```bash
cd backend-api
npx prisma format
npx prisma migrate dev --name add_wallet_subscription_payment_method
npx prisma generate
```

**Verify migration:**
- Check migration SQL file
- Test rollback: `npx prisma migrate reset`
- Re-run migration
- Seed test data

---

## DAY 2: WALLET BACKEND SERVICES (8-10 hours)

### TASK 2.1: Create Wallet Service (4 hours)

**File:** `backend-api/src/services/wallet.service.ts`

```typescript
import { PrismaClient, WalletTransactionType, WalletTransactionStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class WalletService {
  /**
   * Get or create wallet for user
   */
  async getOrCreateWallet(userId: string) {
    let wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
      logger.info(`Created wallet for user ${userId}`);
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
      isLocked: wallet.isLocked,
      lastUpdated: wallet.updatedAt,
    };
  }

  /**
   * Credit wallet (add funds)
   */
  async credit(params: {
    userId: string;
    amount: number;
    type: WalletTransactionType;
    description?: string;
    metadata?: any;
    transactionId?: string;
    receiptId?: string;
    stickerScanId?: string;
    stripePaymentIntentId?: string;
  }) {
    const { userId, amount, type, description, metadata, ...links } = params;

    if (amount <= 0) {
      throw new Error('Credit amount must be positive');
    }

    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.isLocked) {
      throw new Error(`Wallet is locked: ${wallet.lockedReason}`);
    }

    // Update wallet balance
    const newBalance = wallet.balance + amount;
    const newAvailableBalance = wallet.availableBalance + amount;

    const [updatedWallet, walletTransaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          status: WalletTransactionStatus.COMPLETED,
          description,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          ...links,
        },
      }),
    ]);

    logger.info(`Credited ${amount} BGN to wallet ${wallet.id}. Type: ${type}`);

    return {
      wallet: updatedWallet,
      transaction: walletTransaction,
    };
  }

  /**
   * Debit wallet (subtract funds)
   */
  async debit(params: {
    userId: string;
    amount: number;
    type: WalletTransactionType;
    description?: string;
    metadata?: any;
    transactionId?: string;
  }) {
    const { userId, amount, type, description, metadata, transactionId } = params;

    if (amount <= 0) {
      throw new Error('Debit amount must be positive');
    }

    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.isLocked) {
      throw new Error(`Wallet is locked: ${wallet.lockedReason}`);
    }

    if (wallet.availableBalance < amount) {
      throw new Error('Insufficient wallet balance');
    }

    // Update wallet balance
    const newBalance = wallet.balance - amount;
    const newAvailableBalance = wallet.availableBalance - amount;

    const [updatedWallet, walletTransaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: -amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          status: WalletTransactionStatus.COMPLETED,
          description,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          transactionId,
        },
      }),
    ]);

    logger.info(`Debited ${amount} BGN from wallet ${wallet.id}. Type: ${type}`);

    return {
      wallet: updatedWallet,
      transaction: walletTransaction,
    };
  }

  /**
   * Add pending balance (for pending cashback)
   */
  async addPendingBalance(userId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);

    await prisma.wallet.update({
      where: { userId },
      data: {
        pendingBalance: wallet.pendingBalance + amount,
      },
    });

    logger.info(`Added ${amount} BGN pending balance to wallet ${wallet.id}`);
  }

  /**
   * Move pending to available (when cashback approved)
   */
  async approvePending(userId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.pendingBalance < amount) {
      throw new Error('Insufficient pending balance');
    }

    await prisma.wallet.update({
      where: { userId },
      data: {
        pendingBalance: wallet.pendingBalance - amount,
        availableBalance: wallet.availableBalance + amount,
        balance: wallet.balance + amount,
      },
    });

    logger.info(`Approved ${amount} BGN pending balance for wallet ${wallet.id}`);
  }

  /**
   * Get wallet transaction history
   */
  async getTransactions(userId: string, params?: {
    type?: WalletTransactionType;
    limit?: number;
    offset?: number;
  }) {
    const wallet = await this.getOrCreateWallet(userId);

    const transactions = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        ...(params?.type && { type: params.type }),
      },
      orderBy: { createdAt: 'desc' },
      take: params?.limit || 50,
      skip: params?.offset || 0,
      include: {
        transaction: true,
        receipt: true,
        stickerScan: true,
      },
    });

    const total = await prisma.walletTransaction.count({
      where: {
        walletId: wallet.id,
        ...(params?.type && { type: params.type }),
      },
    });

    return {
      transactions,
      total,
      limit: params?.limit || 50,
      offset: params?.offset || 0,
    };
  }

  /**
   * Lock wallet
   */
  async lockWallet(userId: string, reason: string) {
    await prisma.wallet.update({
      where: { userId },
      data: {
        isLocked: true,
        lockedReason: reason,
        lockedAt: new Date(),
      },
    });

    logger.warn(`Locked wallet for user ${userId}: ${reason}`);
  }

  /**
   * Unlock wallet
   */
  async unlockWallet(userId: string) {
    await prisma.wallet.update({
      where: { userId },
      data: {
        isLocked: false,
        lockedReason: null,
        lockedAt: null,
      },
    });

    logger.info(`Unlocked wallet for user ${userId}`);
  }
}

export const walletService = new WalletService();
```

---

### TASK 2.2: Create Wallet Routes (2 hours)

**File:** `backend-api/src/routes/wallet.routes.ts`

```typescript
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { walletService } from '../services/wallet.service';
import { stripeService } from '../services/stripe.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/wallet/balance
 * Get wallet balance
 */
router.get('/balance', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const balance = await walletService.getBalance(userId);

  res.json(balance);
}));

/**
 * GET /api/wallet/transactions
 * Get wallet transaction history
 */
router.get('/transactions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const { type, limit, offset } = req.query;

  const result = await walletService.getTransactions(userId, {
    type: type as any,
    limit: limit ? parseInt(limit as string) : undefined,
    offset: offset ? parseInt(offset as string) : undefined,
  });

  res.json(result);
}));

/**
 * POST /api/wallet/topup
 * Top up wallet with card payment
 */
const topUpSchema = z.object({
  amount: z.number().positive().max(10000),
  paymentMethodId: z.string().optional(),
});

router.post('/topup', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { amount, paymentMethodId } = topUpSchema.parse(req.body);

  // Create Stripe payment intent
  const paymentIntent = await stripeService.createPaymentIntent({
    userId,
    amount,
    currency: 'bgn',
    paymentMethodId,
    metadata: {
      type: 'WALLET_TOPUP',
      userId,
    },
  });

  // Create pending transaction
  const wallet = await walletService.getOrCreateWallet(userId);
  const transaction = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'TOP_UP',
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance, // Will update on webhook
      status: 'PENDING',
      description: 'Wallet top-up',
      stripePaymentIntentId: paymentIntent.id,
    },
  });

  res.json({
    paymentIntent: {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    },
    transaction,
  });
}));

/**
 * GET /api/wallet/statistics
 * Get wallet statistics
 */
router.get('/statistics', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const wallet = await walletService.getOrCreateWallet(userId);

  const stats = await prisma.walletTransaction.groupBy({
    by: ['type'],
    where: {
      walletId: wallet.id,
      status: 'COMPLETED',
    },
    _sum: {
      amount: true,
    },
    _count: true,
  });

  const totalCashback = stats
    .filter(s => s.type === 'CASHBACK_CREDIT')
    .reduce((sum, s) => sum + (s._sum.amount || 0), 0);

  const totalTopups = stats
    .filter(s => s.type === 'TOP_UP')
    .reduce((sum, s) => sum + (s._sum.amount || 0), 0);

  const totalSpent = stats
    .filter(s => s.type === 'PURCHASE')
    .reduce((sum, s) => sum + Math.abs(s._sum.amount || 0), 0);

  res.json({
    totalCashback,
    totalTopups,
    totalSpent,
    currentBalance: wallet.balance,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    transactionsByType: stats,
  });
}));

export default router;
```

---

### TASK 2.3: Mount Wallet Routes (30 mins)

**File:** `backend-api/src/server.ts`

**Add after line 98:**

```typescript
import walletRoutes from './routes/wallet.routes';

// Mount routes
app.use('/api/wallet', walletRoutes);
```

---

### TASK 2.4: Test Wallet Endpoints (2 hours)

**Create test file:** `backend-api/tests/wallet.test.ts`

```typescript
import request from 'supertest';
import app from '../src/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Wallet API', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create test user and get token
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'wallet-test@example.com',
        password: 'Test123!',
        name: 'Test User',
      });

    authToken = res.body.token;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test('GET /api/wallet/balance - should return wallet balance', async () => {
    const res = await request(app)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('balance', 0);
    expect(res.body).toHaveProperty('availableBalance', 0);
    expect(res.body).toHaveProperty('pendingBalance', 0);
  });

  test('POST /api/wallet/topup - should create payment intent', async () => {
    const res = await request(app)
      .post('/api/wallet/topup')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('paymentIntent');
    expect(res.body.paymentIntent).toHaveProperty('clientSecret');
  });

  test('GET /api/wallet/transactions - should return empty array initially', async () => {
    const res = await request(app)
      .get('/api/wallet/transactions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(0);
  });

  test('GET /api/wallet/statistics - should return stats', async () => {
    const res = await request(app)
      .get('/api/wallet/statistics')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCashback', 0);
    expect(res.body).toHaveProperty('currentBalance', 0);
  });
});
```

**Run tests:**
```bash
npm test -- wallet.test.ts
```

---

## DAY 3: STRIPE WEBHOOK HANDLERS (8-10 hours)

### TASK 3.1: Update Stripe Webhook Secret (15 mins)

**Terminal:**
```bash
# Install Stripe CLI if not already installed
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

**Copy the webhook secret (starts with `whsec_`) and update `.env`:**

```bash
STRIPE_WEBHOOK_SECRET=whsec_YOUR_ACTUAL_SECRET_HERE
```

---

### TASK 3.2: Implement Webhook Database Persistence (4 hours)

**File:** `backend-api/src/services/stripe.service.ts`

**Replace lines 382-441 with:**

```typescript
/**
 * Handle payment intent succeeded
 */
private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  logger.info(`Payment succeeded: ${paymentIntent.id}`);

  const { userId, type } = paymentIntent.metadata;

  if (!userId) {
    logger.error('No userId in payment intent metadata');
    return;
  }

  try {
    // Create or update transaction
    await prisma.transaction.upsert({
      where: { stripePaymentId: paymentIntent.id },
      create: {
        userId,
        type: (type || 'PURCHASE') as any,
        status: 'COMPLETED',
        amount: paymentIntent.amount / 100,
        finalAmount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        paymentMethod: 'CARD',
        stripePaymentId: paymentIntent.id,
        paymentIntentId: paymentIntent.id,
        metadata: JSON.stringify(paymentIntent.metadata),
        completedAt: new Date(),
      },
      update: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // If this is a wallet top-up, credit the wallet
    if (type === 'WALLET_TOPUP') {
      const amount = paymentIntent.amount / 100;

      await walletService.credit({
        userId,
        amount,
        type: 'TOP_UP',
        description: 'Wallet top-up via card payment',
        stripePaymentIntentId: paymentIntent.id,
        metadata: { paymentIntent: paymentIntent.id },
      });

      // Update wallet transaction status
      await prisma.walletTransaction.updateMany({
        where: {
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
        },
        data: {
          status: 'COMPLETED',
        },
      });

      logger.info(`Credited ${amount} BGN to wallet for user ${userId}`);
    }

    logger.info(`Transaction created/updated for payment ${paymentIntent.id}`);
  } catch (error) {
    logger.error(`Error handling payment success: ${error.message}`);
    throw error;
  }
}

/**
 * Handle payment intent failed
 */
private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  logger.warn(`Payment failed: ${paymentIntent.id}`);

  const { userId, type } = paymentIntent.metadata;

  if (!userId) return;

  try {
    // Update or create transaction with failed status
    await prisma.transaction.upsert({
      where: { stripePaymentId: paymentIntent.id },
      create: {
        userId,
        type: (type || 'PURCHASE') as any,
        status: 'FAILED',
        amount: paymentIntent.amount / 100,
        finalAmount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        paymentMethod: 'CARD',
        stripePaymentId: paymentIntent.id,
        paymentIntentId: paymentIntent.id,
        metadata: JSON.stringify(paymentIntent.metadata),
      },
      update: {
        status: 'FAILED',
      },
    });

    // If wallet top-up, mark transaction as failed
    if (type === 'WALLET_TOPUP') {
      await prisma.walletTransaction.updateMany({
        where: {
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
        },
        data: {
          status: 'FAILED',
        },
      });
    }

    // TODO: Send notification to user about failed payment

    logger.info(`Transaction marked as failed for payment ${paymentIntent.id}`);
  } catch (error) {
    logger.error(`Error handling payment failure: ${error.message}`);
  }
}

/**
 * Handle charge refunded
 */
private async handleRefund(charge: Stripe.Charge): Promise<void> {
  logger.info(`Refund processed: ${charge.id}`);

  try {
    // Find original transaction
    const transaction = await prisma.transaction.findFirst({
      where: { stripePaymentId: charge.payment_intent as string },
    });

    if (!transaction) {
      logger.error(`No transaction found for charge ${charge.id}`);
      return;
    }

    const refundAmount = charge.amount_refunded / 100;

    // Create refund transaction
    await prisma.transaction.create({
      data: {
        userId: transaction.userId,
        type: 'REFUND',
        status: 'COMPLETED',
        amount: refundAmount,
        finalAmount: refundAmount,
        currency: charge.currency.toUpperCase(),
        paymentMethod: 'CARD',
        stripePaymentId: charge.id,
        metadata: JSON.stringify({
          originalTransaction: transaction.id,
          chargeId: charge.id,
        }),
        completedAt: new Date(),
      },
    });

    // Credit wallet if this was a wallet top-up
    if (transaction.type === 'WALLET_TOPUP') {
      await walletService.credit({
        userId: transaction.userId,
        amount: refundAmount,
        type: 'REFUND',
        description: `Refund for payment ${charge.payment_intent}`,
        metadata: { chargeId: charge.id },
      });
    }

    logger.info(`Refund transaction created for ${refundAmount} BGN`);
  } catch (error) {
    logger.error(`Error handling refund: ${error.message}`);
  }
}

/**
 * Handle customer subscription updated
 */
private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  logger.info(`Subscription updated: ${subscription.id}`);

  const userId = subscription.metadata.userId;
  if (!userId) {
    logger.error('No userId in subscription metadata');
    return;
  }

  try {
    // Map Stripe status to our status
    const statusMap: Record<string, any> = {
      'active': 'ACTIVE',
      'past_due': 'PAST_DUE',
      'canceled': 'CANCELLED',
      'incomplete': 'INCOMPLETE',
      'incomplete_expired': 'INCOMPLETE_EXPIRED',
      'trialing': 'TRIALING',
      'unpaid': 'UNPAID',
      'paused': 'PAUSED',
    };

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price.id;
    let plan: 'STANDARD' | 'PREMIUM' | 'PLATINUM' = 'STANDARD';

    // TODO: Map price IDs to plans based on your Stripe configuration
    // For now, use metadata
    if (subscription.metadata.plan) {
      plan = subscription.metadata.plan as any;
    }

    // Update or create subscription
    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        userId,
        plan,
        status: statusMap[subscription.status] || 'ACTIVE',
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        stripeCustomerId: subscription.customer as string,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        metadata: JSON.stringify(subscription.metadata),
      },
      update: {
        status: statusMap[subscription.status] || 'ACTIVE',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      },
    });

    logger.info(`Subscription updated in database for user ${userId}`);
  } catch (error) {
    logger.error(`Error handling subscription update: ${error.message}`);
  }
}
```

**Add import at top:**
```typescript
import { walletService } from './wallet.service';
```

---

### TASK 3.3: Test Webhook Integration (2 hours)

**Test with Stripe CLI:**

```bash
# In one terminal, start your server
npm run dev

# In another terminal, forward webhooks
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# In a third terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
stripe trigger customer.subscription.updated
```

**Verify in database:**
```bash
npx prisma studio
# Check transactions, wallet_transactions tables
```

---

### TASK 3.4: Update Payment Routes (1.5 hours)

**File:** `backend-api/src/routes/payments.routes.ts`

**Update line 156 to detect default payment method:**

```typescript
// Replace line 156
isDefault: pm.id === customer.invoice_settings?.default_payment_method,
```

---

## DAY 4: SUBSCRIPTION SYSTEM (8-10 hours)

### TASK 4.1: Create Subscription Service (3 hours)

**File:** `backend-api/src/services/subscription.service.ts`

```typescript
import { PrismaClient, SubscriptionPlan } from '@prisma/client';
import { stripeService } from './stripe.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Stripe Price IDs (create these in Stripe Dashboard)
const PRICE_IDS = {
  STANDARD: null, // Free plan
  PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_PREMIUM',
  PLATINUM: process.env.STRIPE_PLATINUM_PRICE_ID || 'price_PLATINUM',
};

export class SubscriptionService {
  /**
   * Create subscription
   */
  async createSubscription(params: {
    userId: string;
    plan: SubscriptionPlan;
    paymentMethodId?: string;
  }) {
    const { userId, plan, paymentMethodId } = params;

    if (plan === 'STANDARD') {
      // Standard is free, just create in database
      return prisma.subscription.create({
        data: {
          userId,
          plan: 'STANDARD',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });
    }

    // Get or create Stripe customer
    const customer = await stripeService.getOrCreateCustomer(userId);

    // Create Stripe subscription
    const stripeSubscription = await stripeService.stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_IDS[plan] }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId,
        plan,
      },
      default_payment_method: paymentMethodId,
    });

    // Create subscription in database
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        status: stripeSubscription.status === 'active' ? 'ACTIVE' : 'INCOMPLETE',
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: PRICE_IDS[plan],
        stripeCustomerId: customer.id,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start
          ? new Date(stripeSubscription.trial_start * 1000)
          : null,
        trialEnd: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
      },
    });

    const invoice = stripeSubscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent;

    return {
      subscription,
      clientSecret: paymentIntent?.client_secret,
      status: stripeSubscription.status,
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd = true) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.plan === 'STANDARD') {
      // Can't cancel standard plan
      throw new Error('Cannot cancel standard plan');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new Error('No Stripe subscription found');
    }

    // Cancel in Stripe
    const stripeSubscription = await stripeService.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: cancelAtPeriodEnd }
    );

    // Update database
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        cancelAtPeriodEnd,
        cancelAt: stripeSubscription.cancel_at
          ? new Date(stripeSubscription.cancel_at * 1000)
          : null,
        canceledAt: new Date(),
      },
    });
  }

  /**
   * Upgrade/Downgrade subscription
   */
  async updateSubscriptionPlan(subscriptionId: string, newPlan: SubscriptionPlan) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (newPlan === 'STANDARD') {
      // Downgrade to free - cancel current subscription
      if (subscription.stripeSubscriptionId) {
        await this.cancelSubscription(subscriptionId, false);
      }

      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: { plan: 'STANDARD' },
      });
    }

    if (!subscription.stripeSubscriptionId) {
      throw new Error('No Stripe subscription to update');
    }

    // Update in Stripe
    const stripeSubscription = await stripeService.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    await stripeService.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: PRICE_IDS[newPlan],
        }],
        proration_behavior: 'create_prorations',
        metadata: { plan: newPlan },
      }
    );

    // Update database
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        plan: newPlan,
        stripePriceId: PRICE_IDS[newPlan],
      },
    });
  }

  /**
   * Get user's active subscription
   */
  async getActiveSubscription(userId: string) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string) {
    return prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get plan benefits
   */
  getPlanBenefits(plan: SubscriptionPlan) {
    const benefits = {
      STANDARD: {
        cashbackRate: 0.05,
        monthlyFee: 0,
        features: [
          '5% cashback on all purchases',
          'Basic receipt scanning',
          'Transaction history',
          'Email support',
        ],
      },
      PREMIUM: {
        cashbackRate: 0.07,
        monthlyFee: 9.99,
        features: [
          '7% cashback on all purchases',
          '+2% bonus on BOOM-Sticker scans',
          'Priority receipt processing',
          'Advanced analytics',
          'Priority support',
          'No ads',
        ],
      },
      PLATINUM: {
        cashbackRate: 0.10,
        monthlyFee: 19.99,
        features: [
          '10% cashback on all purchases',
          '+5% bonus on BOOM-Sticker scans',
          'Instant receipt approval',
          'Premium analytics & insights',
          '24/7 priority support',
          'Exclusive partner offers',
          'No ads',
          'Early access to new features',
        ],
      },
    };

    return benefits[plan];
  }
}

export const subscriptionService = new SubscriptionService();
```

---

### TASK 4.2: Create Subscription Routes (2 hours)

**File:** `backend-api/src/routes/subscriptions.routes.ts`

```typescript
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

/**
 * GET /api/subscriptions/plans
 * Get available subscription plans
 */
router.get('/plans', asyncHandler(async (req: AuthRequest, res: Response) => {
  const plans = ['STANDARD', 'PREMIUM', 'PLATINUM'].map(plan => ({
    plan,
    ...subscriptionService.getPlanBenefits(plan as any),
  }));

  res.json({ plans });
}));

/**
 * GET /api/subscriptions/current
 * Get user's current subscription
 */
router.get('/current', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const subscription = await subscriptionService.getActiveSubscription(userId);

  if (!subscription) {
    return res.json({
      plan: 'STANDARD',
      status: 'ACTIVE',
      benefits: subscriptionService.getPlanBenefits('STANDARD'),
    });
  }

  res.json({
    ...subscription,
    benefits: subscriptionService.getPlanBenefits(subscription.plan),
  });
}));

/**
 * POST /api/subscriptions/create
 * Create new subscription
 */
const createSchema = z.object({
  plan: z.enum(['STANDARD', 'PREMIUM', 'PLATINUM']),
  paymentMethodId: z.string().optional(),
});

router.post('/create', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { plan, paymentMethodId } = createSchema.parse(req.body);

  // Check if user already has active subscription
  const existing = await subscriptionService.getActiveSubscription(userId);
  if (existing) {
    return res.status(400).json({
      error: 'You already have an active subscription. Use update endpoint to change plans.'
    });
  }

  const result = await subscriptionService.createSubscription({
    userId,
    plan,
    paymentMethodId,
  });

  res.json(result);
}));

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription
 */
const cancelSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
});

router.post('/:id/cancel', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { cancelAtPeriodEnd } = cancelSchema.parse(req.body);

  const subscription = await subscriptionService.cancelSubscription(id, cancelAtPeriodEnd);

  res.json(subscription);
}));

/**
 * POST /api/subscriptions/:id/update-plan
 * Upgrade or downgrade subscription
 */
const updatePlanSchema = z.object({
  plan: z.enum(['STANDARD', 'PREMIUM', 'PLATINUM']),
});

router.post('/:id/update-plan', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { plan } = updatePlanSchema.parse(req.body);

  const subscription = await subscriptionService.updateSubscriptionPlan(id, plan);

  res.json(subscription);
}));

export default router;
```

---

### TASK 4.3: Mount Subscription Routes (15 mins)

**File:** `backend-api/src/server.ts`

```typescript
import subscriptionRoutes from './routes/subscriptions.routes';

app.use('/api/subscriptions', subscriptionRoutes);
```

---

### TASK 4.4: Create Stripe Products and Prices (1 hour)

**Stripe Dashboard:**

1. Go to https://dashboard.stripe.com/test/products
2. Create "BoomCard Premium" product:
   - Name: BoomCard Premium
   - Price: 9.99 BGN/month
   - Recurring: Monthly
   - Copy price ID → Add to `.env`: `STRIPE_PREMIUM_PRICE_ID=price_xxx`

3. Create "BoomCard Platinum" product:
   - Name: BoomCard Platinum
   - Price: 19.99 BGN/month
   - Recurring: Monthly
   - Copy price ID → Add to `.env`: `STRIPE_PLATINUM_PRICE_ID=price_xxx`

---

### TASK 4.5: Test Subscription System (2 hours)

**Create test file:** `backend-api/tests/subscription.test.ts`

```typescript
import request from 'supertest';
import app from '../src/server';

describe('Subscription API', () => {
  let authToken: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'sub-test@example.com',
        password: 'Test123!',
        name: 'Sub Test',
      });

    authToken = res.body.token;
  });

  test('GET /api/subscriptions/plans', async () => {
    const res = await request(app)
      .get('/api/subscriptions/plans')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(3);
    expect(res.body.plans[0]).toHaveProperty('cashbackRate');
  });

  test('GET /api/subscriptions/current - default to STANDARD', async () => {
    const res = await request(app)
      .get('/api/subscriptions/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('STANDARD');
  });

  test('POST /api/subscriptions/create - create PREMIUM subscription', async () => {
    const res = await request(app)
      .post('/api/subscriptions/create')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        plan: 'PREMIUM',
        paymentMethodId: 'pm_card_visa', // Test payment method
      });

    expect(res.status).toBe(200);
    expect(res.body.subscription.plan).toBe('PREMIUM');
  });
});
```

---

## ACCEPTANCE CRITERIA

### DAY 1 ✅
- [ ] Wallet, WalletTransaction, Subscription, PaymentMethod models created
- [ ] Migration runs without errors
- [ ] Can query models in Prisma Studio
- [ ] All relations properly set up

### DAY 2 ✅
- [ ] WalletService methods work correctly
- [ ] Can credit/debit wallet
- [ ] Wallet routes return correct data
- [ ] Unit tests pass for wallet service
- [ ] Can get balance, transactions, statistics

### DAY 3 ✅
- [ ] Stripe webhook secret configured
- [ ] Payment success creates transaction
- [ ] Payment success credits wallet (for top-ups)
- [ ] Payment failure marked in database
- [ ] Refunds credit wallet correctly
- [ ] Subscription updates saved to database
- [ ] Test webhooks work via Stripe CLI

### DAY 4 ✅
- [ ] Can create subscriptions (Standard/Premium/Platinum)
- [ ] Can cancel subscriptions
- [ ] Can upgrade/downgrade plans
- [ ] Stripe products/prices created
- [ ] Subscription webhooks update database
- [ ] Tests pass

---

## TESTING CHECKLIST

- [ ] All unit tests pass
- [ ] Integration tests for payment flows
- [ ] Webhook signature validation works
- [ ] Database transactions are atomic
- [ ] Error handling covers edge cases
- [ ] Wallet balance calculations accurate
- [ ] Concurrent transactions handled correctly
- [ ] Idempotency for webhook events

---

## DOCUMENTATION REQUIREMENTS

- [ ] API endpoint documentation (Postman/Swagger)
- [ ] Database schema ERD diagram
- [ ] Webhook event handling flowchart
- [ ] Environment variables documented
- [ ] Error codes documented
- [ ] Code comments for complex logic

---

## DEPENDENCIES

**Before Starting:**
- PostgreSQL database running (or SQLite for dev)
- Stripe account with test keys
- Node.js 18+ installed
- Prisma CLI installed

**Blocks:**
- Developer C (mobile wallet UI) - blocked until Day 2 complete
- Developer D (partner dashboard) - blocked until Day 2 complete

---

## NOTES

- Keep Stripe CLI running during development for webhook testing
- Use `npx prisma studio` to inspect database changes
- All currency amounts in BGN (Bulgarian Lev)
- Amounts stored as Float in database, converted for Stripe (multiply by 100)
- Always use database transactions for wallet operations
- Log all payment events for audit trail

---

## CONTACT

**Questions?** Contact project lead
**Stripe Issues?** Check Stripe Dashboard logs
**Database Issues?** Use Prisma Studio to debug

**Status Updates:** Update daily progress in team channel
