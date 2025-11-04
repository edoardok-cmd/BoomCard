import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { stripeService } from '../services/stripe.service';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/payments/intents
 * Create payment intent for booking or purchase
 */
router.post('/intents', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { amount, currency, description, metadata, bookingId } = req.body;
  const user = req.user!;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid amount'
    });
  }

  try {
    // Get user details for Stripe customer
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!userDetails) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount,
      currency: currency || 'bgn',
      userId: user.id,
      email: userDetails.email,
      description,
      metadata: {
        bookingId,
        ...metadata,
      },
    });

    logger.info(`Payment intent created: ${paymentIntent.paymentIntentId} for user ${user.id}`);

    res.status(201).json({
      success: true,
      data: paymentIntent,
    });
  } catch (error) {
    logger.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
    });
  }
}));

/**
 * POST /api/payments/intents/:id/confirm
 * Confirm payment intent (server-side)
 */
router.post('/intents/:id/confirm', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { paymentMethodId } = req.body;

  try {
    const paymentIntent = await stripeService.confirmPaymentIntent(id, paymentMethodId);

    res.json({
      success: true,
      data: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    logger.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
    });
  }
}));

/**
 * POST /api/payments/intents/:id/cancel
 * Cancel payment intent
 */
router.post('/intents/:id/cancel', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await stripeService.cancelPaymentIntent(id);

    res.json({
      success: true,
      message: 'Payment cancelled successfully',
    });
  } catch (error) {
    logger.error('Error cancelling payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel payment',
    });
  }
}));

/**
 * GET /api/payments/cards
 * Get user's saved payment methods
 */
router.get('/cards', asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  try {
    // Get user's Stripe customer ID
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });

    if (!userDetails) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // If no Stripe customer yet, return empty list
    if (!userDetails.stripeCustomerId) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // Get payment methods from Stripe
    const paymentMethods = await stripeService.listPaymentMethods(userDetails.stripeCustomerId);

    // Format response
    const cards = paymentMethods.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: false, // TODO: Check default payment method
      createdAt: new Date(pm.created * 1000).toISOString(),
    }));

    res.json({
      success: true,
      data: cards,
    });
  } catch (error) {
    logger.error('Error fetching cards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment methods',
    });
  }
}));

/**
 * POST /api/payments/cards
 * Add payment method
 */
router.post('/cards', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { paymentMethodId, setAsDefault } = req.body;
  const user = req.user!;

  if (!paymentMethodId) {
    return res.status(400).json({
      success: false,
      message: 'Payment method ID is required',
    });
  }

  try {
    // Get or create Stripe customer
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, firstName: true, lastName: true, stripeCustomerId: true },
    });

    if (!userDetails) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const customerId = await stripeService.getOrCreateCustomer(
      user.id,
      userDetails.email,
      `${userDetails.firstName} ${userDetails.lastName}`
    );

    // Attach payment method to customer
    const paymentMethod = await stripeService.attachPaymentMethod(customerId, paymentMethodId);

    // Set as default if requested
    if (setAsDefault) {
      await stripeService.setDefaultPaymentMethod(customerId, paymentMethodId);
    }

    res.status(201).json({
      success: true,
      data: {
        id: paymentMethod.id,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year,
        isDefault: setAsDefault || false,
      },
    });
  } catch (error) {
    logger.error('Error adding payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add payment method',
    });
  }
}));

/**
 * DELETE /api/payments/cards/:id
 * Remove payment method
 */
router.delete('/cards/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    await stripeService.detachPaymentMethod(id);

    res.json({
      success: true,
      message: 'Payment method removed successfully',
    });
  } catch (error) {
    logger.error('Error removing payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove payment method',
    });
  }
}));

/**
 * POST /api/payments/cards/:id/default
 * Set default payment method
 */
router.post('/cards/:id/default', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  try {
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true },
    });

    if (!userDetails?.stripeCustomerId) {
      return res.status(404).json({
        success: false,
        message: 'No Stripe customer found',
      });
    }

    await stripeService.setDefaultPaymentMethod(userDetails.stripeCustomerId, id);

    res.json({
      success: true,
      message: 'Default payment method updated',
    });
  } catch (error) {
    logger.error('Error setting default payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default payment method',
    });
  }
}));

/**
 * POST /api/payments/refunds
 * Request refund
 */
router.post('/refunds', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { paymentIntentId, amount, reason } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({
      success: false,
      message: 'Payment intent ID is required',
    });
  }

  try {
    const refund = await stripeService.createRefund({
      paymentIntentId,
      amount,
      reason,
    });

    res.status(201).json({
      success: true,
      data: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        reason: refund.reason,
      },
    });
  } catch (error) {
    logger.error('Error creating refund:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
    });
  }
}));

/**
 * GET /api/payments/transactions
 * Get user's transactions from database
 */
router.get('/transactions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 20, status, type } = req.query;
  const user = req.user!;

  try {
    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          ...(status && { status: status as any }),
        },
        take: Number(limit),
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          venue: true,
        },
      }),
      prisma.transaction.count({
        where: {
          userId: user.id,
          ...(status && { status: status as any }),
        },
      }),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions',
    });
  }
}));

/**
 * GET /api/payments/transactions/:id
 * Get transaction by ID
 */
router.get('/transactions/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  try {
    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        venue: true,
        offer: true,
      },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    logger.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction',
    });
  }
}));

/**
 * GET /api/payments/statistics
 * Get payment statistics for user
 */
router.get('/statistics', asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;

  try {
    const stats = await prisma.transaction.groupBy({
      by: ['status'],
      where: {
        userId: user.id,
      },
      _sum: {
        finalAmount: true,
      },
      _count: true,
    });

    const totalTransactions = stats.reduce((acc, s) => acc + s._count, 0);
    const totalRevenue = stats.reduce((acc, s) => acc + (s._sum.finalAmount || 0), 0);
    const completedCount = stats.find((s) => s.status === 'COMPLETED')?._count || 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalTransactions,
        successRate: totalTransactions > 0 ? (completedCount / totalTransactions) * 100 : 0,
        averageTransaction: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
        byStatus: stats.map((s) => ({
          status: s.status,
          count: s._count,
          total: s._sum.finalAmount || 0,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching payment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
    });
  }
}));

export default router;
