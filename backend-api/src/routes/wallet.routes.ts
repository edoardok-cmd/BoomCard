import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { walletService } from '../services/wallet.service';
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
 * Top up wallet with Paysera payment
 * NOTE: This endpoint redirects to Paysera payment gateway
 * Use /api/payments/create for direct payment creation
 */
router.post('/topup', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Wallet top-ups are now handled by Paysera payment gateway
  // Redirect to /api/payments/create endpoint
  res.status(308).json({
    success: false,
    message: 'Wallet top-ups are now handled by /api/payments/create endpoint',
    redirectTo: '/api/payments/create',
    instructions: 'Please use the Paysera payment endpoint to top up your wallet',
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
