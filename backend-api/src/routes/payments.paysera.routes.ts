/**
 * Paysera Payment Routes
 * Handles payment processing with Paysera gateway
 */

import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { payseraService, PayseraService } from '../services/paysera.service';
import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

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
router.post(
  '/create',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { amount, description, currency = 'BGN', paymentMethod, metadata } = req.body;
    const user = req.user!;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
      });
    }

    if (!PayseraService.validateAmount(PayseraService.amountToCents(amount))) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between 0.01 and 10,000 BGN',
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
          type: TransactionType.PAYMENT,
          amount: amount,
          currency: currency,
          status: TransactionStatus.PENDING,
          description: description || 'Payment',
          metadata: {
            orderId,
            ...metadata,
          },
        },
      });

      // Build callback URLs
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const acceptUrl = `${baseUrl}/payments/success?orderId=${orderId}`;
      const cancelUrl = `${baseUrl}/payments/cancel?orderId=${orderId}`;
      const callbackUrl = `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/payments/callback`;

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
        lang: 'bg',
      });

      // Update transaction with payment details
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          metadata: {
            ...transaction.metadata,
            paymentUrl: payment.paymentUrl,
            payseraProjectId: payment.projectId,
          },
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
// ============================================

/**
 * POST /api/payments/callback
 * Webhook endpoint for Paysera payment notifications
 * This is called by Paysera servers (not from browser)
 */
router.post(
  '/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { data, ss1, ss2 } = req.body;

    logger.info('📨 Received Paysera callback');

    try {
      // Handle callback
      const result = await payseraService.handleCallback({
        data,
        ss1,
        ss2,
      });

      logger.info(`Callback result: ${result.orderId} - ${result.status}`);

      // Find transaction by order ID
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: {
            path: ['orderId'],
            equals: result.orderId,
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
        logger.warn(`⚠️  Transaction not found for order: ${result.orderId}`);
        return res.send(payseraService.generateCallbackResponse());
      }

      // Update transaction based on payment status
      if (result.status === 'success') {
        // Payment successful
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.COMPLETED,
            metadata: {
              ...transaction.metadata,
              paymentMethod: result.paymentMethod,
              transactionId: result.transactionId,
              paidAmount: result.amount,
              paidCurrency: result.currency,
              completedAt: new Date().toISOString(),
            },
          },
        });

        // Update wallet balance
        await prisma.wallet.upsert({
          where: { userId: transaction.userId },
          create: {
            userId: transaction.userId,
            balance: transaction.amount,
            currency: transaction.currency,
            totalEarned: transaction.amount,
          },
          update: {
            balance: {
              increment: transaction.amount,
            },
            totalEarned: {
              increment: transaction.amount,
            },
          },
        });

        // Create wallet transaction
        await prisma.walletTransaction.create({
          data: {
            userId: transaction.userId,
            transactionId: transaction.id,
            amount: transaction.amount,
            type: 'CREDIT',
            description: `Payment successful: ${result.orderId}`,
          },
        });

        logger.info(`✅ Payment successful: ${result.orderId} - ${result.amount / 100} ${result.currency}`);
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        // Payment failed or cancelled
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: result.status === 'failed' ? TransactionStatus.FAILED : TransactionStatus.CANCELLED,
            metadata: {
              ...transaction.metadata,
              transactionId: result.transactionId,
              failureReason: result.status,
              completedAt: new Date().toISOString(),
            },
          },
        });

        logger.warn(`⚠️  Payment ${result.status}: ${result.orderId}`);
      }

      // Send "OK" response to Paysera
      res.send(payseraService.generateCallbackResponse());
    } catch (error: any) {
      logger.error('❌ Error processing callback:', error);
      // Still send OK to prevent retries
      res.send(payseraService.generateCallbackResponse());
    }
  })
);

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
            path: ['orderId'],
            equals: orderId,
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

    try {
      const transactions = await prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: TransactionType.PAYMENT,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      });

      const total = await prisma.transaction.count({
        where: {
          userId: user.id,
          type: TransactionType.PAYMENT,
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
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
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
router.get('/methods', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      methods: PayseraService.getSupportedPaymentMethods(),
      currencies: PayseraService.getSupportedCurrencies(),
    },
  });
});

export default router;
