/**
 * Paysera Payment Routes
 * Handles payment processing with Paysera gateway
 */

import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { payseraService, PayseraService } from '../services/paysera.service';
import { emailService } from '../services/email.service';
import { cardService } from '../services/card.service';
import { TransactionType, TransactionStatus, SubscriptionStatus, SubscriptionPlan, UserStatus, WalletTransactionType, WalletTransactionStatus } from '@prisma/client';
import { walletService } from '../services/wallet.service';
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

      // Create Paysera payment — default to 'wallet' (Paysera account)
      const payment = await payseraService.createPayment({
        orderId,
        amount: PayseraService.amountToCents(amount),
        currency,
        description: description || 'Payment',
        acceptUrl,
        cancelUrl,
        callbackUrl,
        customerEmail: userDetails.email,
        customerName: `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() || userDetails.email,
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
              firstName: true,
              lastName: true,
              preferredLanguage: true,
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
        // Idempotency: Paysera retries callbacks until it receives "OK".
        // Guard on the WalletTransaction (not Transaction.status) so that if the
        // wallet credit succeeded but the status update failed on a prior attempt,
        // we still skip correctly and don't double-credit.
        // Filter by type=TOP_UP so a cashback-reversal ADJUSTMENT that shares
        // the same transactionId field doesn't falsely suppress the credit.
        const alreadyCredited = await prisma.walletTransaction.findFirst({
          where: { transactionId: transaction.id, type: WalletTransactionType.TOP_UP },
        });
        if (alreadyCredited) {
          logger.info(`Top-up callback for ${result.orderId} already credited — skipping`);
          return res.send(payseraService.generateCallbackResponse());
        }

        // Credit wallet FIRST — atomically via walletService (lock-safe, correct audit trail).
        // We mark the payment Transaction COMPLETED only after the credit succeeds so that
        // if the credit throws, Paysera will retry the callback and we will retry the credit.
        const { wallet } = await walletService.credit({
          userId: transaction.userId,
          amount: transaction.amount,
          type: WalletTransactionType.TOP_UP,
          description: `Зареждане: ${result.orderId}`,
          transactionId: transaction.id,
          metadata: {
            orderId: result.orderId,
            payseraTransactionId: result.transactionId,
            paymentMethod: result.paymentMethod,
          },
        });

        // Now mark the payment transaction COMPLETED — credit already landed.
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

        logger.info(`Payment successful: ${result.orderId} - ${transaction.amount} ${transaction.currency}`);

        // Send payment confirmation email
        if (transaction.user?.email) {
          const txFullName = `${transaction.user.firstName || ''} ${transaction.user.lastName || ''}`.trim();
          const txLang: 'bg' | 'en' = transaction.user.preferredLanguage === 'en' ? 'en' : 'bg';
          emailService.sendPaymentConfirmation(transaction.user.email, {
            customerName: txFullName || transaction.user.email.split('@')[0],
            orderId: result.orderId,
            amount: transaction.amount,
            currency: transaction.currency,
            date: new Date(),
          }, txLang).catch((error) => {
            logger.error('Failed to send payment confirmation email:', error);
          });

          // Send wallet update notification
          emailService.sendWalletUpdate(transaction.user.email, {
            customerName: txFullName || transaction.user.email.split('@')[0],
            newBalance: wallet.balance,
            changeAmount: transaction.amount,
            transactionType: 'credit',
            description: `Портфейлът ви е зареден с ${transaction.amount.toFixed(2)} ${transaction.currency}`,
            date: new Date(),
          }, txLang).catch((error) => {
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

        // ── 1. Reverse wallet TOP_UP if it was already credited ──────────────────
        // Paysera can send status=5 (refunded) AFTER a successful status=1 callback
        // has already topped up the wallet. Without this reversal the user keeps
        // the balance from a refunded payment.
        // Idempotency key: 'topup-rev-<tx.id>' — distinct from the TOP_UP's own
        // transactionId ('tx.id') so the @unique constraint is not violated.
        try {
          const existingTopUp = await prisma.walletTransaction.findFirst({
            where: { transactionId: transaction.id, type: WalletTransactionType.TOP_UP },
          });
          if (existingTopUp && existingTopUp.amount > 0) {
            const topUpReversalId = `topup-rev-${transaction.id}`;
            const alreadyReversedTopUp = await prisma.walletTransaction.findFirst({
              where: { transactionId: topUpReversalId },
            });
            if (alreadyReversedTopUp) {
              logger.info(`TOP_UP reversal for order ${result.orderId} already processed — skipping`);
            } else {
              await walletService.debit({
                userId: transaction.userId,
                amount: existingTopUp.amount,
                type: WalletTransactionType.ADJUSTMENT,
                description: `Сторниране на зареждане — плащане ${result.status} за поръчка ${result.orderId}`,
                transactionId: topUpReversalId,
                metadata: { orderId: result.orderId, reason: result.status, reversedTopUpId: existingTopUp.id },
              });
              logger.warn(`Reversed ${existingTopUp.amount} BGN TOP_UP for ${result.status} payment ${result.orderId}`);
            }
          }
        } catch (topUpReversalError: any) {
          logger.error(`Failed to reverse TOP_UP for ${result.status} payment ${result.orderId}: ${topUpReversalError.message}`);
          if (topUpReversalError.message?.includes('Insufficient wallet balance')) {
            await prisma.wallet.updateMany({
              where: { userId: transaction.userId },
              data: {
                isLocked: true,
                lockedReason: `TOP_UP reversal failed on ${result.status} payment ${result.orderId}: balance insufficient. Manual reconciliation required.`,
                lockedAt: new Date(),
              },
            }).catch((lockErr: any) => logger.error(`Failed to lock wallet for user ${transaction.userId}:`, lockErr));
          }
        }

        // ── 2. Reverse cashback for any approved receipt linked to this transaction ─
        // Idempotency key: 'cashback-rev-<tx.id>' — distinct from the TOP_UP's
        // transactionId so the @unique constraint is not violated when both exist.
        try {
          const cashbackReversalId = `cashback-rev-${transaction.id}`;
          const alreadyReversed = await prisma.walletTransaction.findFirst({
            where: { transactionId: cashbackReversalId },
          });
          if (alreadyReversed) {
            logger.info(`Cashback reversal for order ${result.orderId} already processed — skipping`);
          } else {
            const linkedReceipt = await prisma.receipt.findFirst({
              where: { transactionId: transaction.id, status: 'APPROVED' as any },
              select: { id: true, userId: true },
            });
            if (linkedReceipt) {
              const userWallet = await prisma.wallet.findUnique({ where: { userId: linkedReceipt.userId } });
              if (userWallet) {
                const cashbackTx = await prisma.walletTransaction.findFirst({
                  where: {
                    walletId: userWallet.id,
                    type: WalletTransactionType.CASHBACK_CREDIT,
                    receiptId: linkedReceipt.id,
                    status: WalletTransactionStatus.COMPLETED,
                  },
                });
                if (cashbackTx && cashbackTx.amount > 0) {
                  await walletService.debit({
                    userId: linkedReceipt.userId,
                    amount: cashbackTx.amount,
                    type: WalletTransactionType.ADJUSTMENT,
                    description: `Сторниране на кешбек — плащане ${result.status} за поръчка ${result.orderId}`,
                    transactionId: cashbackReversalId,
                    metadata: { orderId: result.orderId, receiptId: linkedReceipt.id, reason: result.status },
                  });
                  logger.info(`Reversed ${cashbackTx.amount} BGN cashback for ${result.status} payment ${result.orderId}`);
                }
              }
            }
          }
        } catch (reversalError: any) {
          logger.error(`Failed to reverse cashback for ${result.status} payment ${result.orderId}: ${reversalError.message}`);
          // Cashback reversal failed — lock the wallet to prevent payout of unreconciled debt.
          // This covers both "Insufficient wallet balance" (user spent the cashback) and other errors
          // (DB failures, network issues) where we cannot guarantee the reversal succeeded.
          await prisma.wallet.updateMany({
            where: { userId: transaction.userId },
            data: {
              isLocked: true,
              lockedReason: `Cashback reversal failed on ${result.status} payment ${result.orderId}: ${reversalError.message}. Manual reconciliation required.`,
              lockedAt: new Date(),
            },
          }).catch((lockErr: any) => logger.error(`Failed to lock wallet for user ${transaction.userId}:`, lockErr));
          logger.warn(`Locked wallet for user ${transaction.userId} — cashback reversal debt on payment ${result.orderId}`);
        }

        // Send payment failed email
        if (transaction.user?.email) {
          const txFailedName = `${transaction.user.firstName || ''} ${transaction.user.lastName || ''}`.trim();
          const txFailedLang: 'bg' | 'en' = transaction.user.preferredLanguage === 'en' ? 'en' : 'bg';
          emailService.sendPaymentFailedEmail(transaction.user.email, {
            customerName: txFailedName || transaction.user.email.split('@')[0],
            orderId: result.orderId,
            amount: transaction.amount,
            currency: transaction.currency,
            reason: result.status as 'failed' | 'cancelled',
          }, txFailedLang).catch((error) => {
            logger.error('Failed to send payment failed email:', error);
          });
        }

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
          orderId: t.metadata ? (JSON.parse(t.metadata as string) as any)?.orderId : undefined,
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
  'boomcard.eu',
  'boomcard-api.fly.dev',
  'boomcard.vercel.app',
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
  paymentMethod: z.string().min(1).max(50).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

router.post(
  '/subscription',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parseResult = subscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parseResult.error.issues,
      });
    }

    const { planId, billingPeriod, paymentMethod, successUrl: clientSuccessUrl, cancelUrl: clientCancelUrl } = parseResult.data;
    const user = req.user!; // authenticate() guarantees user exists

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

    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, firstName: true, lastName: true, status: true },
    });

    if (!userDetails) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Guard: block users who already have an active subscription.
    const existingActiveSub = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
    });
    if (existingActiveSub) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription. Please cancel it before subscribing to a new plan.',
      });
    }

    const customerEmail = userDetails.email;
    const customerName = `${userDetails.firstName || ''} ${userDetails.lastName || ''}`.trim() || userDetails.email;

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
        autoRenewal: true,
        metadata: JSON.stringify({
          billingPeriod,
          priceInCents,
          currency: 'EUR',
          displayName: plan.displayName,
        }),
      },
    });

    // Only set PENDING_PAYMENT if the user is not already in that state —
    // avoids a redundant write for users who abandoned a previous checkout.
    if (userDetails.status !== UserStatus.PENDING_PAYMENT) {
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
    // Default to 'wallet' (Paysera account) — skips the payment method selection
    // page entirely, taking the user directly to Paysera wallet login.
    const payment = await payseraService.createPayment({
      orderId,
      amount: priceInCents,
      currency: 'EUR',
      description: `BoomCard ${plan.displayName} - ${billingPeriod}`,
      acceptUrl,
      cancelUrl,
      callbackUrl,
      customerEmail,
      customerName,
      paymentMethod,
      lang: 'BUL',
      country: 'BG',
    });

    logger.info(`✅ Subscription payment created: ${orderId} for user ${user.id}, plan ${plan.planCode}, ${priceInCents / 100} EUR`);

    res.status(201).json({
      success: true,
      data: {
        orderId: payment.orderId,
        subscriptionId: subscription.id,
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
// Anonymous Subscription Payment (no account required)
// ============================================

const anonymousSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  billingPeriod: z.enum(['weekly', 'monthly', 'yearly']),
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  // Spec §7.1: persist the user's chosen interface language so the
  // post-payment complete-profile email is sent in the right language.
  language: z.enum(['bg', 'en']).optional(),
});

router.post(
  '/anonymous-subscription',
  paymentRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = anonymousSubscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, message: 'Invalid request body', errors: parseResult.error.issues });
    }

    const { planId, billingPeriod, email, firstName, lastName, phone, successUrl: clientSuccessUrl, cancelUrl: clientCancelUrl, language } = parseResult.data;
    const headerLang = (req.headers['accept-language'] || '').toString().toLowerCase().startsWith('en') ? 'en' : 'bg';
    const checkoutLanguage: 'bg' | 'en' = language ?? headerLang as 'bg' | 'en';

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, message: 'Plan not found or inactive' });
    }

    if (billingPeriod === 'weekly' && !plan.hasWeeklyOption) {
      return res.status(400).json({ success: false, message: 'Weekly billing not available for this plan' });
    }
    if (billingPeriod === 'monthly' && !plan.hasMonthlyOption) {
      return res.status(400).json({ success: false, message: 'Monthly billing not available for this plan' });
    }
    if (billingPeriod === 'yearly' && !plan.hasYearlyOption) {
      return res.status(400).json({ success: false, message: 'Yearly billing not available for this plan' });
    }

    let priceInCents: number;
    switch (billingPeriod) {
      case 'weekly': priceInCents = plan.priceWeeklyEur!; break;
      case 'monthly': priceInCents = plan.priceMonthlyEur!; break;
      case 'yearly': priceInCents = plan.priceYearlyEur; break;
    }

    const orderId = `BOOM-ANON-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    await prisma.pendingSubscription.create({
      data: {
        email: email.toLowerCase(),
        planId: plan.id,
        billingPeriod,
        language: checkoutLanguage,
        payseraOrderId: orderId,
        status: 'CREATED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const acceptUrl = (clientSuccessUrl && isAllowedRedirectUrl(clientSuccessUrl))
      ? `${clientSuccessUrl}?orderId=${orderId}`
      : `${FRONTEND_URL}/subscription/success?orderId=${orderId}`;
    const cancelUrl = (clientCancelUrl && isAllowedRedirectUrl(clientCancelUrl))
      ? `${clientCancelUrl}?orderId=${orderId}`
      : `${FRONTEND_URL}/subscription/cancel?orderId=${orderId}`;
    const callbackUrl = `${API_BASE_URL}/api/payments/subscription/callback`;

    const customerName = `${firstName} ${lastName}`.trim();
    const payment = await payseraService.createPayment({
      orderId,
      amount: priceInCents,
      currency: 'EUR',
      description: `BoomCard ${plan.displayName} - ${billingPeriod}`,
      acceptUrl,
      cancelUrl,
      callbackUrl,
      customerEmail: email,
      customerName,
      lang: 'BUL',
      country: 'BG',
    });

    logger.info(`Anonymous subscription payment created: ${orderId}, plan ${plan.planCode}, ${priceInCents / 100} EUR`);

    res.status(201).json({
      success: true,
      data: {
        orderId: payment.orderId,
        paymentUrl: payment.paymentUrl,
        plan: { code: plan.planCode, name: plan.displayName },
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
              lastName: true,
              preferredLanguage: true,
            },
          },
          planDetails: true,
        },
      });

      if (!subscription) {
        // Check if this is an anonymous checkout (PendingSubscription)
        const pending = await prisma.pendingSubscription.findFirst({
          where: { payseraOrderId: result.orderId },
          include: { plan: { select: { displayName: true, displayNameBg: true } } },
        });

        if (!pending) {
          logger.warn(`Subscription not found for order: ${result.orderId}`);
          return res.send(payseraService.generateCallbackResponse());
        }

        if (result.status === 'success') {
          const token = crypto.randomBytes(32).toString('hex');
          const updated = await prisma.pendingSubscription.updateMany({
            where: { id: pending.id, status: { not: 'PAID' } },
            data: {
              status: 'PAID',
              token,
              tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
              paidAt: new Date(),
            },
          });
          if (updated.count > 0) {
            const pendingLanguage: 'bg' | 'en' = pending.language === 'en' ? 'en' : 'bg';
            // §7.2: payment receipt first, then profile-setup invite
            emailService.sendPaymentReceiptEmail(pending.email, {
              planName: pending.plan.displayName,
              planNameBg: pending.plan.displayNameBg ?? undefined,
              orderId: result.orderId,
              amount: result.amount ? result.amount / 100 : undefined,
              currency: 'EUR',
            }, pendingLanguage).catch(err => logger.error('Failed to send payment receipt email:', err));
            emailService.sendCompleteProfileEmail(pending.email, {
              planName: pending.plan.displayName,
              planNameBg: pending.plan.displayNameBg ?? undefined,
              completeProfileUrl: `${FRONTEND_URL}/complete-profile?token=${token}`,
              language: pendingLanguage,
            }).catch(err => logger.error('Failed to send complete-profile email:', err));
            logger.info(`PendingSubscription ${pending.id} marked PAID, token issued`);
          } else {
            logger.info(`PendingSubscription ${pending.id} already PAID — skipping`);
          }
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          await prisma.pendingSubscription.updateMany({
            where: { id: pending.id, status: { not: 'FAILED' } },
            data: { status: 'FAILED' },
          });
          logger.warn(`PendingSubscription ${pending.id} marked FAILED (${result.status})`);
        }

        return res.send(payseraService.generateCallbackResponse());
      }

      if (result.status === 'success') {
        // ACTIVATE SUBSCRIPTION (webhook-first - this is the only place!)
        // Atomic guard: only activates if not already ACTIVE, preventing duplicate processing
        // from concurrent Paysera callback retries (TOCTOU-safe).
        const existingMetadata = subscription.metadata ? JSON.parse(subscription.metadata as string) : {};
        const activationResult = await prisma.subscription.updateMany({
          where: { id: subscription.id, status: { not: SubscriptionStatus.ACTIVE } },
          data: {
            status: SubscriptionStatus.ACTIVE,
            // FR-007: 24-hour trial refund window starts at payment confirmation
            trialRefundEligibleUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

        if (activationResult.count === 0) {
          logger.info(`Subscription ${subscription.id} already activated — skipping`);
          return res.send(payseraService.generateCallbackResponse());
        }

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

        // Send confirmation + activation emails
        if (subscription.user?.email) {
          const planDisplayName = subscription.plan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const fullName = `${subscription.user.firstName || ''} ${subscription.user.lastName || ''}`.trim();
          const subLang: 'bg' | 'en' = subscription.user.preferredLanguage === 'en' ? 'en' : 'bg';
          emailService.sendPaymentConfirmation(subscription.user.email, {
            customerName: fullName || subscription.user.email.split('@')[0],
            orderId: result.orderId,
            amount: result.amount / 100,
            currency: 'EUR',
            date: new Date(),
          }, subLang).catch((error) => {
            logger.error('Failed to send subscription confirmation email:', error);
          });

          // Spec §7.2: only payment confirmation email at payment time; activation email removed to avoid duplicate
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

        // Unblock the user — subscription creation set them to PENDING_PAYMENT.
        // If they have no other active subscription, reset back to ACTIVE so they
        // are not permanently stuck in the pending state.
        const hasActiveSubscription = await prisma.subscription.findFirst({
          where: {
            userId: subscription.userId,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          },
        });
        if (!hasActiveSubscription) {
          await prisma.user.update({
            where: { id: subscription.userId },
            data: { status: UserStatus.ACTIVE },
          });
        }

        // Send payment failed email
        if (subscription.user?.email) {
          const fullNameFailed = `${subscription.user.firstName || ''} ${subscription.user.lastName || ''}`.trim();
          const subFailedLang: 'bg' | 'en' = subscription.user.preferredLanguage === 'en' ? 'en' : 'bg';
          emailService.sendPaymentFailedEmail(subscription.user.email, {
            customerName: fullNameFailed || subscription.user.email.split('@')[0],
            orderId: result.orderId,
            amount: result.amount / 100,
            currency: 'EUR',
            reason: result.status as 'failed' | 'cancelled',
          }, subFailedLang).catch((error) => {
            logger.error('Failed to send subscription payment failed email:', error);
          });
        }

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

// ============================================
// Paysera Transfer API Callback (B2C Payouts)
// POST /api/payments/transfer-callback?secret=<per-payout-secret>
//
// Paysera POSTs a JSON body when a transfer status changes.
// The secret query param is a per-payout random token stored in the
// WITHDRAWAL WalletTransaction metadata — used for lightweight verification
// without needing full MAC header reconstruction.
//
// Expected body (Paysera Transfer API v1):
//   { "id": "<transfer_id>", "status": "done"|"failed"|"rejected", ... }
//   OR { "data": { "id": "...", "status": "..." } }
// ============================================

router.post('/transfer-callback', asyncHandler(async (req: Request, res: Response) => {
  const { secret } = req.query;

  // Parse transfer ID and status — handle both flat and nested body shapes
  const body = req.body as Record<string, any>;
  const transferId: string | undefined = body?.id ?? body?.transfer_id ?? body?.data?.id;
  const status: string | undefined = body?.status ?? body?.data?.status;

  if (!transferId || !status) {
    logger.warn('Transfer callback: missing transfer id or status');
    return res.status(200).json({ ok: true }); // Return 200 to stop retries
  }

  logger.info(`Transfer callback received: ${transferId} → ${status}`);

  // Find the PROCESSING WITHDRAWAL with this transfer ID in its metadata
  const walletTx = await prisma.walletTransaction.findFirst({
    where: {
      type: WalletTransactionType.WITHDRAWAL,
      status: WalletTransactionStatus.PROCESSING,
      metadata: { contains: `"payseraTransferId":"${transferId}"` },
    },
    include: {
      wallet: {
        include: {
          user: { select: { id: true, email: true, firstName: true } },
        },
      },
    },
  });

  if (!walletTx) {
    // Already processed or never recorded — safe to acknowledge
    logger.info(`Transfer callback: no PROCESSING withdrawal found for transfer ${transferId}`);
    return res.status(200).json({ ok: true });
  }

  // Verify the per-payout secret
  const metadata = walletTx.metadata ? JSON.parse(walletTx.metadata) : {};
  if (!secret || secret !== metadata.callbackSecret) {
    logger.warn(`Transfer callback: invalid secret for transfer ${transferId}`);
    return res.status(200).json({ ok: true }); // Silent — don't leak info
  }

  const userId = walletTx.wallet.userId;

  if (status === 'done') {
    // ── Transfer completed — mark WITHDRAWAL as COMPLETED ────────────────
    await prisma.walletTransaction.update({
      where: { id: walletTx.id },
      data: {
        status: WalletTransactionStatus.COMPLETED,
        description: 'Изплащане завършено — средствата са изпратени по банкова сметка',
        metadata: JSON.stringify({ ...metadata, completedAt: new Date().toISOString() }),
      },
    });

    logger.info(`Payout completed: transfer ${transferId} for user ${userId}, ${Math.abs(walletTx.amount).toFixed(2)} BGN`);

    // Notify user via email
    if (walletTx.wallet.user?.email) {
      const amountBGN = Math.abs(walletTx.amount);
      emailService.sendWalletUpdate(walletTx.wallet.user.email, {
        customerName: walletTx.wallet.user.firstName || 'Клиент',
        newBalance: walletTx.balanceAfter,
        changeAmount: amountBGN,
        transactionType: 'debit',
        description: `Вашето изплащане от ${amountBGN.toFixed(2)} BGN е изпратено по банкова сметка (IBAN: ${metadata.beneficiaryIban || 'в профила ви'}). Средствата обикновено пристигат до 1–2 работни дни.`,
        date: new Date(),
      }).catch((err) => logger.error('Failed to send payout completion email:', err));
    }

  } else if (status === 'failed' || status === 'rejected') {
    // ── Transfer failed — reverse the debit and mark WITHDRAWAL as FAILED ─
    const payoutAmount = Math.abs(walletTx.amount);

    try {
      await prisma.$transaction(async (tx) => {
        // Read the ACTUAL current balance inside the transaction — the wallet may have
        // received cashback credits since the WITHDRAWAL was created (hours/days ago).
        const currentWallet = await tx.wallet.update({
          where: { userId },
          data: {
            balance: { increment: payoutAmount },
            availableBalance: { increment: payoutAmount },
          },
        });

        // Mark original WITHDRAWAL as FAILED
        await tx.walletTransaction.update({
          where: { id: walletTx.id },
          data: {
            status: WalletTransactionStatus.FAILED,
            description: `Изплащането е неуспешно (Paysera превод ${status})`,
            metadata: JSON.stringify({ ...metadata, failedAt: new Date().toISOString(), failureStatus: status }),
          },
        });

        // Record the reversal credit for the audit trail with accurate balance figures
        await tx.walletTransaction.create({
          data: {
            walletId: walletTx.walletId,
            type: WalletTransactionType.ADJUSTMENT,
            amount: payoutAmount,
            balanceBefore: currentWallet.balance - payoutAmount, // post-increment minus amount = pre-increment
            balanceAfter: currentWallet.balance,
            status: WalletTransactionStatus.COMPLETED,
            description: `Payout reversal (Paysera transfer ${status})`,
            metadata: JSON.stringify({ payseraTransferId: transferId, reversedWithdrawalId: walletTx.id }),
          },
        });
      });

      logger.warn(`Payout reversed for user ${userId}: transfer ${transferId} ${status}`);

      // Notify user that payout failed and balance was restored
      if (walletTx.wallet.user?.email) {
        emailService.sendWalletUpdate(walletTx.wallet.user.email, {
          customerName: walletTx.wallet.user.firstName || 'Клиент',
          newBalance: walletTx.balanceAfter + payoutAmount,
          changeAmount: payoutAmount,
          transactionType: 'credit',
          description: `Изплащането ви от ${payoutAmount.toFixed(2)} BGN не може да бъде обработено и е върнато в портфейла ви. Моля, проверете IBAN-а си и опитайте отново.`,
          date: new Date(),
        }).catch((err) => logger.error('Failed to send payout failure email:', err));
      }
    } catch (reversalError: any) {
      logger.error(`CRITICAL: payout reversal failed for transfer ${transferId}: ${reversalError.message}`);
      // Lock wallet for manual review
      await prisma.wallet.update({
        where: { userId },
        data: {
          isLocked: true,
          lockedReason: `Payout reversal failed after transfer ${status}: ${reversalError.message}`,
          lockedAt: new Date(),
        },
      }).catch(() => {});
    }
  }

  res.status(200).json({ ok: true });
}));

export default router;
