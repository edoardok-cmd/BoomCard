import { Router } from 'express';
import { WalletTransactionType, WalletTransactionStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

type TxWhere = Parameters<typeof prisma.walletTransaction.findMany>[0]['where'];

function buildWhere(query: Record<string, string>): TxWhere {
  const { search, type, status, dateFrom, dateTo, userId, minAmount } = query;
  const where: TxWhere = {};

  if (type && Object.values(WalletTransactionType).includes(type as WalletTransactionType)) {
    where!.type = type as WalletTransactionType;
  }
  if (status && Object.values(WalletTransactionStatus).includes(status as WalletTransactionStatus)) {
    where!.status = status as WalletTransactionStatus;
  }
  // minAmount: drives the deep-link from the "large pending payouts" alert. Guarded
  // against NaN — invalid input means "no filter" rather than crashing the query.
  if (minAmount) {
    const n = parseFloat(minAmount);
    if (Number.isFinite(n) && n > 0) {
      (where as Record<string, unknown>)['amount'] = { gte: n };
    }
  }

  const walletWhere: Record<string, unknown> = {};
  if (search) {
    walletWhere['user'] = {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  if (userId) {
    walletWhere['userId'] = userId;
  }
  if (Object.keys(walletWhere).length > 0) {
    (where as Record<string, unknown>)['wallet'] = walletWhere;
  }

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter['gte'] = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999); // date-only strings parse as UTC midnight; keep end-of-day in UTC too
      dateFilter['lte'] = to;
    }
    (where as Record<string, unknown>)['createdAt'] = dateFilter;
  }

  return where;
}

// GET /api/admin/transactions?page=1&limit=20&search=...&type=TOP_UP&status=COMPLETED&dateFrom=...&dateTo=...&userId=...
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where = buildWhere(req.query as Record<string, string>);

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true,
          wallet: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    res.json({ transactions, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/transactions/stats?search=...&type=...&status=...&dateFrom=...&dateTo=...&userId=...
router.get('/stats', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const baseWhere = buildWhere(req.query as Record<string, string>);

    const [volumeResult, cashbackResult, withdrawalResult] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: baseWhere,
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...baseWhere, type: 'CASHBACK_CREDIT', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...baseWhere, type: 'WITHDRAWAL', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      totalVolume: volumeResult._sum.amount ?? 0,
      totalCashback: cashbackResult._sum.amount ?? 0,
      totalWithdrawals: withdrawalResult._sum.amount ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/transactions/adjust
router.post('/adjust', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.write'), async (req, res, next) => {
  let validationError: string | null = null;
  try {
    const { userId, amount, reason } = req.body as {
      userId: string;
      amount: number;
      reason: string;
    };

    if (!userId || typeof amount !== 'number' || amount === 0 || !isFinite(amount)) {
      res.status(400).json({ error: 'userId and a finite non-zero amount are required' });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: 'reason is required' });
      return;
    }

    // Existence check before entering the transaction — gives a clean 404.
    const exists = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ error: 'Wallet not found for this user' });
      return;
    }

    // Read balance INSIDE the interactive transaction so balanceBefore/After are consistent
    // even under concurrent requests.
    const transaction = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: { id: true, balance: true, availableBalance: true, currency: true },
      });
      if (!wallet) throw new Error('Wallet disappeared inside transaction');

      if (amount < 0 && wallet.availableBalance + amount < 0) {
        validationError = 'Adjustment would result in negative balance';
        throw new Error(validationError);
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      const created = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          amount: Math.abs(amount), // amount field is always the magnitude; direction via balanceBefore→After
          balanceBefore,
          balanceAfter,
          currency: wallet.currency,
          status: 'COMPLETED',
          description: reason.trim(),
        },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount }, availableBalance: { increment: amount } },
      });

      return created;
    });

    res.status(201).json(transaction);
  } catch (error) {
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    next(error);
  }
});

// GET /api/admin/transactions/business — Spec §4.3 — Transaction model with Партньор / Кешбек / Марджин
router.get('/business', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const {
      page = '1',
      limit = '20',
      partnerId,
      type,
      status,
      dateFrom,
      dateTo,
      search,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const where: Parameters<typeof prisma.transaction.findMany>[0]['where'] = {};

    if (partnerId) where.partnerId = partnerId;
    if (type && Object.values(TransactionType).includes(type as TransactionType)) {
      where.type = type as TransactionType;
    }
    if (status && Object.values(TransactionStatus).includes(status as TransactionStatus)) {
      where.status = status as TransactionStatus;
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter['gte'] = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setUTCHours(23, 59, 59, 999);
        dateFilter['lte'] = to;
      }
      where.createdAt = dateFilter as never;
    }
    if (search) {
      where.OR = [
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { partner: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          discountAmount: true,
          finalAmount: true,
          cashbackAmount: true,
          netAmount: true,
          currency: true,
          paymentMethod: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          partner: {
            select: { id: true, businessName: true, businessNameBg: true },
          },
          venue: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    // Compute BoomCard margin per row: discountAmount (partner gives) − cashbackAmount (user gets)
    const rows = transactions.map((tx) => ({
      ...tx,
      margin: ((tx.discountAmount ?? 0) - (tx.cashbackAmount ?? 0)),
    }));

    res.json({ transactions: rows, total, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
});

export default router;
