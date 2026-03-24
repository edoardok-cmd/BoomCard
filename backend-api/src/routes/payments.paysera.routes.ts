/**
 * Paysera Payment Routes
 * Handles payment processing with Paysera gateway
 */

import { Router, Response, Request } from 'express';
import { authenticate, optionalAuthenticate, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { payseraService, PayseraService } from '../services/paysera.service';
import { emailService } from '../services/email.service';
import { cardService } from '../services/card.service';
import { TransactionType, TransactionStatus, SubscriptionStatus, SubscriptionPlan, UserStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { z } from 'zod';
import { paymentRateLimiter } from '../middleware/security.middleware';

const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('FRONTEND_URL must be set in production'); })()
  : 'http://localhost:5173');

const API_BASE_URL = process.env.API_BASE_URL || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('API_BASE_URL must be set in production'); })()
  : 'http://localhost:3000');

const router = Router();

// ============================================
// Payment Creation (Authenticated)
// ============================================

/**
 * @swagger
 * /api/payments/create:
 *   post:
 *     summary: Create Paysera payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Create a new payment with Paysera and get redirect URL.
 *       User will be redirected to Paysera payment page.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - description
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 50.00
 *                 description: Amount in BGN
 *               description:
 *                 type: string
 *                 example: "Wallet top-up"
 *               currency:
 *                 type: string
 *                 example: "BGN"
 *                 default: "BGN"
 *               paymentMethod:
 *                 type: string
 *                 example: "hanzaee"
 *                 description: "Specific payment method (optional)"
 *               metadata:
 *                 type: object
 *                 description: "Additional metadata"
 *     responses:
 *       201:
 *         description: Payment created, redirect user to paymentUrl
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                     paymentUrl:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     currency:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
// Schema for payment creation — metadata is restricted to a flat string map
// to prevent object injection and limit stored payload size.
const createPaymentSchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(255).optional(),
  currency: z.string().length(3).optional().default('EUR'),
  paymentMethod: z.string().max(50).optional(),
  metadata: z.record(z.string().max(100), z.string().max(500)).optional(),
});

router.post(
  '/create',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parseResult = createPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parseResult.error.issues,
      });
    }

    const { amount, description, currency, paymentMethod, metadata } = parseResult.data;
    const user = req.user!;

    if (!PayseraService.validateAmount(PayseraService.amountToCents(amount))) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between 0.01 and 10,000 EUR',
      });
    }

    if (!PayseraService.getSupportedCurrencies().includes(currency)) {
      return res.status(400).json({
        success: false,
        message: `Currency ${currency} not supported`,
      });
    }

    try {
      // Get user details
      const userDetails = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, firstName: true, lastName: true },
      });

      if (!userDetails) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Generate unique order ID
      const orderId = `BOOM-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId: user.id,
          type: TransactionType.WALLET_TOPUP,
          amount: amount,
          currency: currency,
          status: TransactionStatus.PENDING,
          paymentMethod: 'BANK_TRANSFER',
          description: description || 'Payment',
          metadata: JSON.stringify({
            orderId,
            ...metadata,
          }),
        },
      });

      // Build callback URLs
      const acceptUrl = `${FRONTEND_URL}/payments/success?orderId=${orderId}`;
      const cancelUrl = `${FRONTEND_URL}/payments/cancel?orderId=${orderId}`;
      const callbackUrl = `${API_BASE_URL}/api/payments/callback`;

      // Create Paysera payment
      const payment = await payseraService.createPayment({
        orderId,
        amount: PayseraService.amountToCents(amount),
        currency,
        description: description || 'Payment',
        acceptUrl,
        cancelUrl,
        callbackUrl,
        customerEmail: userDetails.email,
        customerName: `${userDetails.firstName} ${userDetails.lastName}`,
        paymentMethod,
        lang: 'BUL',
        country: 'BG',
      });

      // Update transaction with payment details
      const existingMetadata = transaction.metadata ? JSON.parse(transaction.metadata as string) : {};
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          metadata: JSON.stringify({
            ...existingMetadata,
            paymentUrl: payment.paymentUrl,
            payseraProjectId: payment.projectId,
          }),
        },
      });

      logger.info(`✅ Payment created: ${orderId} for user ${user.id}`);

      res.status(201).json({
        success: true,
        data: {
          orderId: payment.orderId,
          transactionId: transaction.id,
          paymentUrl: payment.paymentUrl,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
        },
      });
    } catch (error: any) {
      logger.error('❌ Error creating payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create payment',
      });
    }
  })
);

// ============================================
// Payment Callback (Webhook from Paysera)
// Paysera sends callbacks as GET with query params: data, ss1, ss2
// We also support POST for flexibility
// ============================================

/**
 * Shared handler for payment callbacks (GET or POST)
 */
async function handlePaymentCallback(req: Request, res: Response) {
    // Paysera sends data, ss1, ss2 as GET query params
    const data = (req.query.data || req.body?.data) as string;
    const ss1 = (req.query.ss1 || req.body?.ss1) as string;
    const ss2 = (req.query.ss2 || req.body?.ss2) as string;

    logger.info('Received Paysera callback');

    if (!data || !ss1) {
      logger.warn('Missing data or ss1 in callback');
      return res.send(payseraService.generateCallbackResponse());
    }

    try {
      // Handle callback
      const result = await payseraService.handleCallback({
        data,
        ss1,
        ss2,
      });

      logger.info(`Callback result: ${result.orderId} - status ${result.rawStatus} (${result.status})`);

      // Find transaction by order ID
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: {
            contains: `"orderId":"${result.orderId}"`,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (!transaction) {
        logger.warn(`Transaction not found for order: ${result.orderId}`);
        return res.send(payseraService.generateCallbackResponse());
      }

      // Update transaction based on payment status
      if (result.status === 'success') {
        // Payment successful
        const existingMetadata = transaction.metadata ? JSON.parse(transaction.metadata as string) : {};
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.COMPLETED,
            metadata: JSON.stringify({
              ...existingMetadata,
              paymentMethod: result.paymentMethod,
              transactionId: result.transactionId,
              paidAmount: result.amount,
              paidCurrency: result.currency,
              payAmount: result.payAmount,
              payCurrency: result.payCurrency,
              rawStatus: result.rawStatus,
              completedAt: new Date().toISOString(),
            }),
          },
        });

        // Update wallet balance
        const wallet = await prisma.wallet.upsert({
          where: { userId: transaction.userId },
          create: {
            userId: transaction.userId,
            balance: transaction.amount,
            availableBalance: transaction.amount,
            currency: transaction.currency,
          },
          update: {
            balance: {
              increment: transaction.amount,
            },
            availableBalance: {
              increment: transaction.amount,
            },
          },
        });

        // Create wallet transaction
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            transactionId: transaction.id,
            amount: transaction.amount,
            balanceBefore: wallet.balance - transaction.amount,
            balanceAfter: wallet.balance,
            type: 'TOP_UP',
            description: `Payment successful: ${result.orderId}`,
          },
        });

        logger.info(`Payment successful: ${result.orderId} - ${transaction.amount} ${transaction.currency}`);

        // Send payment confirmation email
        if (transaction.user?.email) {
          emailService.sendPaymentConfirmation(transaction.user.email, {
            customerName: transaction.user.email.split('@')[0],
            orderId: result.orderId,
            amount: transaction.amount,
            currency: transaction.currency,
            date: new Date(),
          }).catch((error) => {
            logger.error('Failed to send payment confirmation email:', error);
          });

          // Send wallet update notification
          emailService.sendWalletUpdate(transaction.user.email, {
            customerName: transaction.user.email.split('@')[0],
            newBalance: wallet.balance,
            changeAmount: transaction.amount,
            transactionType: 'credit',
            description: `Your wallet has been topped up with ${transaction.amount.toFixed(2)} ${transaction.currency}`,
            date: new Date(),
          }).catch((error) => {
            logger.error('Failed to send wallet update email:', error);
          });
        }
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        // Payment failed or cancelled
        const existingMetadata = transaction.metadata ? JSON.parse(transaction.metadata as string) : {};
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: result.status === 'failed' ? TransactionStatus.FAILED : TransactionStatus.CANCELLED,
            metadata: JSON.stringify({
              ...existingMetadata,
              transactionId: result.transactionId,
              failureReason: result.status,
              rawStatus: result.rawStatus,
              completedAt: new Date().toISOString(),
            }),
          },
        });

        logger.warn(`Payment ${result.status}: ${result.orderId}`);
      }
      // For 'pending' status (0, 2, 3), we don't update - wait for final callback

      // Send "OK" response to Paysera
      res.send(payseraService.generateCallbackResponse());
    } catch (error: any) {
      logger.error('Error processing callback:', error);
      // Still send OK to prevent retries
      res.send(payseraService.generateCallbackResponse());
    }
}

// GET /api/payments/callback - Paysera sends callbacks as GET
router.get('/callback', asyncHandler(handlePaymentCallback));
// POST /api/payments/callback - Also support POST
router.post('/callback', asyncHandler(handlePaymentCallback));

// ============================================
// Payment Status Check (Authenticated)
// ============================================

/**
 * GET /api/payments/:orderId/status
 * Check payment status
 */
router.get(
  '/:orderId/status',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId } = req.params;
    const user = req.user!;

    try {
      // Find transaction
      const transaction = await prisma.transaction.findFirst({
        where: {
          userId: user.id,
          metadata: {
            contains: `"orderId":"${orderId}"`,
          },
        },
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
        });
      }

      res.json({
        success: true,
        data: {
          orderId,
          status: transaction.status.toLowerCase(),
          amount: transaction.amount,
          currency: transaction.currency,
          description: transaction.description,
          createdAt: transaction.createdAt,
          metadata: transaction.metadata,
        },
      });
    } catch (error: any) {
      logger.error('Error checking payment status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check payment status',
      });
    }
  })
);

// ============================================
// Payment History (Authenticated)
// ============================================

/**
 * GET /api/payments/history
 * Get user's payment history
 */
router.get(
  '/history',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const { limit = '20', offset = '0' } = req.query;
    const limitVal = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100);
    const offsetVal = Math.max(parseInt(offset as string) || 0, 0);

    try {
      const transactions = await prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: TransactionType.WALLET_TOPUP,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limitVal,
        skip: offsetVal,
      });

      const total = await prisma.transaction.count({
        where: {
          userId: user.id,
          type: TransactionType.WALLET_TOPUP,
        },
      });

      res.json({
        success: true,
        data: transactions.map(t => ({
          id: t.id,
          orderId: (t.metadata as any)?.orderId,
          amount: t.amount,
          currency: t.currency,
          status: t.status.toLowerCase(),
          description: t.description,
          createdAt: t.createdAt,
        })),
        pagination: {
          total,
          limit: limitVal,
          offset: offsetVal,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching payment history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history',
      });
    }
  })
);

// ============================================
// Supported Payment Methods (Public)
// ============================================

/**
 * GET /api/payments/methods
 * Get supported payment methods
 */
router.get('/methods', asyncHandler(async (req: Request, res: Response) => {
  const country = (req.query.country as string) || 'bg';
  const currency = (req.query.currency as string) || 'EUR';
  const amount = parseInt(req.query.amount as string) || 1000;

  try {
    const methods = await payseraService.fetchPaymentMethods(country, currency, amount);

    res.json({
      success: true,
      data: {
        methods,
        currencies: PayseraService.getSupportedCurrencies(),
        country,
        currency,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching payment methods:', error);
    // Fallback to static methods if XML API fails
    res.json({
      success: true,
      data: {
        methods: PayseraService.getSupportedPaymentMethods(),
        currencies: PayseraService.getSupportedCurrencies(),
        country,
        currency,
        fallback: true,
      },
    });
  }
}));

// ============================================
// SECURE Subscription Payment (Authenticated)
// CRITICAL: This endpoint uses SERVER-SIDE pricing only
// ============================================

/**
 * Helper function to calculate subscription period end
 */
function calculatePeriodEnd(billingPeriod: 'weekly' | 'monthly' | 'yearly'): Date {
  const now = new Date();
  switch (billingPeriod) {
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'yearly':
      return new Date(now.setFullYear(now.getFullYear() + 1));
  }
}

/**
 * POST /api/payments/subscription
 * Create SECURE subscription payment
 *
 * SECURITY: Price is determined by planId lookup from database.
 * Client ONLY sends planId and billingPeriod - NEVER the price.
 */
const ALLOWED_REDIRECT_DOMAINS = [
  'mobile.boomcard.bg',
  'boomcard.bg',
  'boomcard-api.fly.dev',
];

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      ALLOWED_REDIRECT_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const subscriptionSchema = z.object({
  planId: z.string().uuid(),
  billingPeriod: z.enum(['weekly', 'monthly', 'yearly']),
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(1).max(30).optional(),
  paymentMethod: z.string().min(1).max(50).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

router.post(
  '/subscription',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parseResult = subscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parseResult.error.issues,
      });
    }

    const { planId, billingPeriod, email: guestEmail, name: guestName, phone: guestPhone, paymentMethod, successUrl: clientSuccessUrl, cancelUrl: clientCancelUrl } = parseResult.data;
    const user = req.user; // May be undefined for guest checkout

    // Fetch plan from database (SOURCE OF TRUTH for pricing)
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found or inactive',
      });
    }

    // Validate billing period is available for this plan
    if (billingPeriod === 'weekly' && !plan.hasWeeklyOption) {
      return res.status(400).json({
        success: false,
        message: 'Weekly billing not available for this plan',
      });
    }
    if (billingPeriod === 'monthly' && !plan.hasMonthlyOption) {
      return res.status(400).json({
        success: false,
        message: 'Monthly billing not available for this plan',
      });
    }
    if (billingPeriod === 'yearly' && !plan.hasYearlyOption) {
      return res.status(400).json({
        success: false,
        message: 'Yearly billing not available for this plan',
      });
    }

    // Get price based on billing period (from DATABASE, not from client!)
    let priceInCents: number;
    switch (billingPeriod) {
      case 'weekly':
        priceInCents = plan.priceWeeklyEur!;
        break;
      case 'monthly':
        priceInCents = plan.priceMonthlyEur!;
        break;
      case 'yearly':
        priceInCents = plan.priceYearlyEur;
        break;
    }

    // Generate unique order ID
    const orderId = `BOOM-SUB-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    let subscriptionId: string | null = null;
    let customerEmail = guestEmail || '';
    let customerName = guestName || '';
    let customerPhone = guestPhone || '';

    if (user) {
      // Authenticated user flow
      const userDetails = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, firstName: true, lastName: true },
      });

      if (!userDetails) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      customerEmail = userDetails.email;
      customerName = `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() || userDetails.email;

      // Map plan code to subscription enum
      const subscriptionPlanMap: Record<string, SubscriptionPlan> = {
        'LIGHT': SubscriptionPlan.LIGHT,
        'BASIC': SubscriptionPlan.BASIC,
        'PREMIUM': SubscriptionPlan.PREMIUM,
      };

      const subscriptionPlan = subscriptionPlanMap[plan.planCode];
      if (!subscriptionPlan) {
        return res.status(400).json({
          success: false,
          message: 'Invalid plan code',
        });
      }

      // Create pending subscription record
      const subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: subscriptionPlan,
          status: SubscriptionStatus.INCOMPLETE,
          planId: plan.id,
          payseraOrderId: orderId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: calculatePeriodEnd(billingPeriod),
          metadata: JSON.stringify({
            billingPeriod,
            priceInCents,
            currency: 'EUR',
            displayName: plan.displayName,
          }),
        },
      });

      subscriptionId = subscription.id;

      // Update user status to PENDING_PAYMENT
      await prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.PENDING_PAYMENT },
      });
    }

    // Build callback URLs
    const acceptUrl = (clientSuccessUrl && isAllowedRedirectUrl(clientSuccessUrl))
      ? `${clientSuccessUrl}?orderId=${orderId}`
      : `${FRONTEND_URL}/subscription/success?orderId=${orderId}`;
    const cancelUrl = (clientCancelUrl && isAllowedRedirectUrl(clientCancelUrl))
      ? `${clientCancelUrl}?orderId=${orderId}`
      : `${FRONTEND_URL}/subscription/cancel?orderId=${orderId}`;
    const callbackUrl = `${API_BASE_URL}/api/payments/subscription/callback`;

    // Create Paysera payment
    const payment = await payseraService.createPayment({
      orderId,
      amount: priceInCents,
      currency: 'EUR',
      description: `BoomCard ${plan.displayName} - ${billingPeriod}`,
      acceptUrl,
      cancelUrl,
      callbackUrl,
      customerEmail: customerEmail || undefined,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      paymentMethod,
      lang: 'BUL',
      country: 'BG',
    });

    logger.info(`✅ Subscription payment created: ${orderId} for ${user ? `user ${user.id}` : `guest ${customerEmail || 'anonymous'}`}, plan ${plan.planCode}, ${priceInCents / 100} EUR`);

    res.status(201).json({
      success: true,
      data: {
        orderId: payment.orderId,
        subscriptionId,
        paymentUrl: payment.paymentUrl,
        plan: {
          code: plan.planCode,
          name: plan.displayName,
        },
        amount: priceInCents / 100,
        currency: 'EUR',
        billingPeriod,
      },
    });
  })
);

// ============================================
// Subscription Payment Callback (Webhook)
// CRITICAL: This is the ONLY place where subscriptions become ACTIVE
// Paysera sends callbacks as GET with query params: data, ss1, ss2
// ============================================

async function handleSubscriptionCallback(req: Request, res: Response) {
    // Paysera sends data, ss1, ss2 as GET query params
    const data = (req.query.data || req.body?.data) as string;
    const ss1 = (req.query.ss1 || req.body?.ss1) as string;
    const ss2 = (req.query.ss2 || req.body?.ss2) as string;

    logger.info('Received Paysera subscription callback');

    if (!data || !ss1) {
      logger.warn('Missing data or ss1 in subscription callback');
      return res.send(payseraService.generateCallbackResponse());
    }

    try {
      // Handle callback and verify signature
      const result = await payseraService.handleCallback({
        data,
        ss1,
        ss2,
      });

      logger.info(`Subscription callback result: ${result.orderId} - status ${result.rawStatus} (${result.status})`);

      // Find subscription by Paysera order ID
      const subscription = await prisma.subscription.findFirst({
        where: { payseraOrderId: result.orderId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
            },
          },
          planDetails: true,
        },
      });

      if (!subscription) {
        logger.warn(`Subscription not found for order: ${result.orderId}`);
        return res.send(payseraService.generateCallbackResponse());
      }

      // Idempotency check - don't process if already active
      if (subscription.status === SubscriptionStatus.ACTIVE) {
        logger.info(`Subscription ${subscription.id} already active, skipping`);
        return res.send(payseraService.generateCallbackResponse());
      }

      if (result.status === 'success') {
        // ACTIVATE SUBSCRIPTION (webhook-first - this is the only place!)
        const existingMetadata = subscription.metadata ? JSON.parse(subscription.metadata as string) : {};
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            metadata: JSON.stringify({
              ...existingMetadata,
              paymentConfirmedAt: new Date().toISOString(),
              payseraTransactionId: result.transactionId,
              paidAmount: result.amount,
              paidCurrency: result.currency,
              payAmount: result.payAmount,
              payCurrency: result.payCurrency,
              rawStatus: result.rawStatus,
            }),
          },
        });

        // UPDATE USER STATUS TO ACTIVE
        await prisma.user.update({
          where: { id: subscription.userId },
          data: { status: UserStatus.ACTIVE },
        });

        logger.info(`Subscription activated: ${subscription.id} for user ${subscription.userId}`);

        // Sync user's card type to match the newly activated subscription plan
        await cardService.syncCardTypeWithSubscription(subscription.userId, subscription.plan).catch((err) => {
          logger.error(`Failed to sync card type for user ${subscription.userId}:`, err);
        });

        // Send confirmation email
        if (subscription.user?.email) {
          const metadata = JSON.parse(subscription.metadata as string || '{}');
          emailService.sendPaymentConfirmation(subscription.user.email, {
            customerName: subscription.user.firstName || 'Customer',
            orderId: result.orderId,
            amount: result.amount / 100,
            currency: 'EUR',
            date: new Date(),
          }).catch((error) => {
            logger.error('Failed to send subscription confirmation email:', error);
          });
        }
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        // Payment failed or cancelled (status 5 = refunded)
        const existingMetadata = subscription.metadata ? JSON.parse(subscription.metadata as string) : {};
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.INCOMPLETE_EXPIRED,
            metadata: JSON.stringify({
              ...existingMetadata,
              failedAt: new Date().toISOString(),
              failureReason: result.status,
              rawStatus: result.rawStatus,
            }),
          },
        });

        logger.warn(`Subscription payment ${result.status}: ${result.orderId}`);
      }
      // For 'pending' status (0, 2, 3), we don't update - wait for final callback

      // Send "OK" response to Paysera
      res.send(payseraService.generateCallbackResponse());
    } catch (error: any) {
      logger.error('Error processing subscription callback:', error);
      // Still send OK to prevent retries
      res.send(payseraService.generateCallbackResponse());
    }
}

// GET /api/payments/subscription/callback - Paysera sends callbacks as GET
router.get('/subscription/callback', asyncHandler(handleSubscriptionCallback));
// POST /api/payments/subscription/callback - Also support POST
router.post('/subscription/callback', asyncHandler(handleSubscriptionCallback));

// ============================================
// Verify Paysera Redirect Data (Public)
// Used by success page to verify payment when no subscription exists (guest checkout)
// ============================================

router.post('/verify-redirect', paymentRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { data, ss1 } = req.body;

  if (!data || !ss1) {
    return res.status(400).json({
      success: false,
      message: 'Missing data or ss1 parameter',
    });
  }

  try {
    const result = await payseraService.handleCallback({ data, ss1 });

    res.json({
      success: true,
      data: {
        orderId: result.orderId,
        status: result.status,
        amount: result.amount ? result.amount / 100 : null,
        currency: result.currency,
        paymentMethod: result.paymentMethod,
        isSuccess: result.status === 'success',
      },
    });
  } catch (error: any) {
    logger.error('Error verifying redirect data:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid payment data or signature',
    });
  }
}));

export default router;
