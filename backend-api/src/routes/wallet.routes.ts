import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { walletService } from '../services/wallet.service';
import { stripeService } from '../services/stripe.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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
  const userEmail = req.user!.email;
  const { amount } = topUpSchema.parse(req.body);

  // Create Stripe payment intent
  const paymentIntent = await stripeService.createPaymentIntent({
    userId,
    email: userEmail,
    amount,
    currency: 'bgn',
    description: 'Wallet top-up',
    metadata: {
      type: 'TOP_UP',
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
      stripePaymentIntentId: paymentIntent.paymentIntentId,
    },
  });

  res.json({
    paymentIntent: {
      id: paymentIntent.paymentIntentId,
      clientSecret: paymentIntent.clientSecret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
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
