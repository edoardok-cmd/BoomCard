import { Router } from 'express';
import { WalletTransactionStatus } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/admin/payouts?page=1&limit=20&search=...&status=PENDING
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const {
      search,
      status,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.walletTransaction.findMany>[0]['where'] = {
      type: 'WITHDRAWAL',
    };

    if (status && Object.values(WalletTransactionStatus).includes(status as WalletTransactionStatus)) {
      where.status = status as WalletTransactionStatus;
    }

    if (search) {
      where.wallet = {
        user: {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        },
      };
    }

    const [payouts, total] = await Promise.all([
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
              availableBalance: true,
              pendingBalance: true,
              payoutIban: true,
              payoutBeneficiaryName: true,
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

    res.json({ payouts, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/payouts/:id/approve → PROCESSING
router.patch('/:id/approve', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const payout = await prisma.walletTransaction.findUnique({ where: { id } });
    if (!payout || payout.type !== 'WITHDRAWAL') {
      res.status(404).json({ message: 'Payout not found' });
      return;
    }
    if (payout.status !== 'PENDING') {
      res.status(400).json({ message: 'Only PENDING payouts can be approved' });
      return;
    }

    const updated = await prisma.walletTransaction.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/payouts/:id/reject → FAILED
router.patch('/:id/reject', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    const payout = await prisma.walletTransaction.findFirst({
      where: { id, type: 'WITHDRAWAL' },
      include: { wallet: true },
    });
    if (!payout) {
      res.status(404).json({ message: 'Payout not found' });
      return;
    }
    if (payout.status !== 'PENDING') {
      res.status(400).json({ message: 'Only PENDING payouts can be rejected' });
      return;
    }

    // amounts are stored as negative (debit), so negate to restore
    const restoreAmount = -payout.amount;

    await prisma.$transaction([
      prisma.walletTransaction.update({
        where: { id },
        data: {
          status: 'FAILED',
          description: reason ? `Rejected by admin: ${reason}` : 'Rejected by admin',
        },
      }),
      prisma.wallet.update({
        where: { id: payout.walletId },
        data: {
          balance: { increment: restoreAmount },
          availableBalance: { increment: restoreAmount },
        },
      }),
    ]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/payouts/:id/complete → COMPLETED (bank transfer confirmed)
router.patch('/:id/complete', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const payout = await prisma.walletTransaction.findFirst({
      where: { id, type: 'WITHDRAWAL' },
    });
    if (!payout) {
      res.status(404).json({ message: 'Payout not found' });
      return;
    }
    if (payout.status !== 'PROCESSING') {
      res.status(400).json({ message: 'Only PROCESSING payouts can be marked complete' });
      return;
    }

    const updated = await prisma.walletTransaction.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
