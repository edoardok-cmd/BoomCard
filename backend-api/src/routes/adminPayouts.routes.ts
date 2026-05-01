import { Router } from 'express';
import { WalletTransactionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function notifySubscriber(
  payoutId: string,
  event: 'approved' | 'completed' | 'rejected' | 'held' | 'released' | 'failed',
  note?: string,
) {
  try {
    const tx = await prisma.walletTransaction.findUnique({
      where: { id: payoutId },
      select: {
        amount: true,
        currency: true,
        wallet: { select: { user: { select: { email: true, firstName: true, lastName: true } } } },
      },
    });
    if (!tx) return;

    const name = [tx.wallet.user.firstName, tx.wallet.user.lastName].filter(Boolean).join(' ') || 'Абонат';
    const amt = Math.abs(tx.amount).toFixed(2);
    const currency = tx.currency;

    const subjectMap: Record<typeof event, string> = {
      approved:  `Плащането ви от ${amt} ${currency} е одобрено`,
      completed: `Плащането ви от ${amt} ${currency} е изпратено`,
      rejected:  `Плащането ви от ${amt} ${currency} е отхвърлено`,
      held:      `Плащането ви от ${amt} ${currency} е задържано за проверка`,
      released:  `Плащането ви от ${amt} ${currency} е освободено`,
      failed:    `Плащането ви от ${amt} ${currency} не беше успешно`,
    };

    const bodyMap: Record<typeof event, string> = {
      approved:  'Заявката ви за плащане беше одобрена и е в процес на обработка. Очаквайте превода в рамките на 5 работни дни.',
      completed: 'Паричният превод беше изпратен успешно. Средствата ще постъпят по сметката ви в рамките на 1–3 работни дни.',
      rejected:  `Заявката ви за плащане беше отхвърлена и балансът ви е възстановен.${note ? ` Причина: ${note}` : ''}`,
      held:      'Заявката ви за плащане е задържана за допълнителна проверка съгласно нашата политика за сигурност. Ще се свържем с вас при необходимост.',
      released:  'Заявката ви за плащане беше освободена от задържане и ще бъде обработена нормално.',
      failed:    `Плащането не беше успешно поради технически проблем. Балансът ви е възстановен.${note ? ` Причина: ${note}` : ''}`,
    };

    await emailService.sendEmail({
      to: tx.wallet.user.email,
      subject: subjectMap[event],
      html: `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:2rem;color:#141413">
          <h2 style="margin-bottom:.5rem">${subjectMap[event]}</h2>
          <p>Здравейте, ${name},</p>
          <p>${bodyMap[event]}</p>
          <p style="color:#8c8678;font-size:.875rem;margin-top:2rem">© ${new Date().getFullYear()} BoomCard. Всички права запазени.</p>
        </div>
      `,
      text: `${subjectMap[event]}\n\n${bodyMap[event]}`,
    });
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[adminPayouts] email notification failed', err);
  }
}

// ─── GET /api/admin/payouts ───────────────────────────────────────────────────
router.get(
  '/',
  requirePermission('finance.payouts.read'),
  async (req, res, next) => {
    try {
      const { search, status, page = '1', limit = '20', dateFrom, dateTo } = req.query as Record<string, string>;

      const pageNum   = Math.max(1, parseInt(page) || 1);
      const limitNum  = Math.min(Math.max(1, parseInt(limit) || 20), 100);
      const skip      = (pageNum - 1) * limitNum;

      // Base filter (search + date only) — used for filter-aware summary cards
      const whereBase: Parameters<typeof prisma.walletTransaction.findMany>[0]['where'] = {
        type: 'WITHDRAWAL',
      };

      if (search) {
        whereBase.wallet = {
          user: {
            OR: [
              { email:     { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName:  { contains: search, mode: 'insensitive' } },
              { phone:     { contains: search, mode: 'insensitive' } },
            ],
          },
        };
      }

      if (dateFrom || dateTo) {
        whereBase.createdAt = {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo   ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
        };
      }

      // Full filter — adds status on top of base
      const where: typeof whereBase = { ...whereBase };
      if (status && Object.values(WalletTransactionStatus).includes(status as WalletTransactionStatus)) {
        where.status = status as WalletTransactionStatus;
      }

      // Global summary counts (always system-wide) + filter-aware groupBy in parallel
      const [
        payouts, total,
        pendingCount, pendingTotal,
        processingCount, processingTotal,
        completedCount, completedTotal,
        riskHoldCount,
        failedCount, failedTotal,
        totalCount,
        filteredGroupBy,
      ] = await Promise.all([
        prisma.walletTransaction.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, type: true, amount: true, balanceBefore: true, balanceAfter: true,
            currency: true, status: true, description: true, createdAt: true, metadata: true,
            wallet: {
              select: {
                id: true, availableBalance: true, pendingBalance: true,
                payoutIban: true, payoutBeneficiaryName: true,
                user: {
                  select: {
                    id: true, firstName: true, lastName: true, email: true, phone: true,
                    subscriptions: {
                      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
                      select: { plan: true, status: true },
                      take: 1,
                      orderBy: { createdAt: 'desc' },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.walletTransaction.count({ where }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'PENDING' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'PENDING' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'PROCESSING' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'PROCESSING' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'COMPLETED' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'COMPLETED' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'RISK_HOLD' } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL', status: 'FAILED' } }),
        prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'FAILED' }, _sum: { amount: true } }),
        prisma.walletTransaction.count({ where: { type: 'WITHDRAWAL' } }),
        // Filter-aware breakdown (respects search + date but not status)
        prisma.walletTransaction.groupBy({
          by: ['status'],
          where: whereBase,
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

      const fgb = (s: string) => filteredGroupBy.find(g => g.status === s);
      const filteredSummary = {
        pendingCount:    fgb('PENDING')?._count._all    ?? 0,
        pendingTotal:    Math.abs(fgb('PENDING')?._sum.amount    ?? 0),
        processingCount: fgb('PROCESSING')?._count._all ?? 0,
        processingTotal: Math.abs(fgb('PROCESSING')?._sum.amount ?? 0),
        completedCount:  fgb('COMPLETED')?._count._all  ?? 0,
        completedTotal:  Math.abs(fgb('COMPLETED')?._sum.amount  ?? 0),
        riskHoldCount:   fgb('RISK_HOLD')?._count._all  ?? 0,
        failedCount:     fgb('FAILED')?._count._all     ?? 0,
        failedTotal:     Math.abs(fgb('FAILED')?._sum.amount     ?? 0),
        cancelledCount:  fgb('CANCELLED')?._count._all  ?? 0,
        totalCount:      filteredGroupBy.reduce((acc, g) => acc + g._count._all, 0),
      };

      res.json({
        payouts,
        total,
        page: pageNum,
        limit: limitNum,
        summary: {
          pendingCount,
          pendingTotal:    Math.abs(pendingTotal._sum.amount    ?? 0),
          processingCount,
          processingTotal: Math.abs(processingTotal._sum.amount ?? 0),
          completedCount,
          completedTotal:  Math.abs(completedTotal._sum.amount  ?? 0),
          riskHoldCount,
          failedCount,
          failedTotal:     Math.abs(failedTotal._sum.amount     ?? 0),
          totalCount,
        },
        filteredSummary,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /bulk-approve  ALL PENDING with IBAN → PROCESSING ─────────────────
router.patch(
  '/bulk-approve',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const pending = await prisma.walletTransaction.findMany({
        where: { type: 'WITHDRAWAL', status: 'PENDING' },
        include: { wallet: true },
      });

      const withIban = pending.filter(p => p.wallet.payoutIban);
      const processingStartedAt = new Date().toISOString();
      let approved = 0;
      let skipped  = 0;

      for (const payout of withIban) {
        try {
          const existingMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
          await prisma.walletTransaction.update({
            where: { id: payout.id },
            data: {
              status: 'PROCESSING',
              metadata: JSON.stringify({ ...existingMeta, processingStartedAt }),
            },
          });
          notifySubscriber(payout.id, 'approved');
          approved++;
        } catch {
          skipped++;
        }
      }

      res.json({ approved, skipped, total: withIban.length });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/approve  PENDING → PROCESSING ────────────────────────────────
router.patch(
  '/:id/approve',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const payout = await prisma.walletTransaction.findFirst({
        where: { id, type: 'WITHDRAWAL' },
        include: { wallet: true },
      });

      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PENDING') {
        res.status(400).json({ message: 'Only PENDING payouts can be approved' });
        return;
      }
      if (!payout.wallet.payoutIban) {
        res.status(422).json({ message: 'Не може да се одобри: абонатът няма регистриран IBAN' });
        return;
      }

      // Store the exact moment of approval so the frontend can show an accurate SLA countdown
      const existingMeta = payout.metadata ? JSON.parse(payout.metadata) : {};
      const newMeta = JSON.stringify({ ...existingMeta, processingStartedAt: new Date().toISOString() });

      const updated = await prisma.walletTransaction.update({
        where: { id },
        data: { status: 'PROCESSING', metadata: newMeta },
      });

      notifySubscriber(id, 'approved');
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/reject  PENDING → FAILED (balance restored) ──────────────────
router.patch(
  '/:id/reject',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
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
      if (payout.status !== 'PENDING' && payout.status !== 'RISK_HOLD') {
        res.status(400).json({ message: 'Only PENDING or RISK_HOLD payouts can be rejected' });
        return;
      }

      const restoreAmount = -payout.amount; // amounts stored as negative debits

      await prisma.$transaction([
        prisma.walletTransaction.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            description: reason ? `Отхвърлено от администратор: ${reason}` : 'Отхвърлено от администратор',
          },
        }),
        prisma.wallet.update({
          where: { id: payout.walletId },
          data: {
            balance:          { increment: restoreAmount },
            availableBalance: { increment: restoreAmount },
          },
        }),
      ]);

      notifySubscriber(id, 'rejected', reason);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/complete  PROCESSING → COMPLETED ────────────────────────────
router.patch(
  '/:id/complete',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const payout = await prisma.walletTransaction.findFirst({ where: { id, type: 'WITHDRAWAL' } });

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

      notifySubscriber(id, 'completed');
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/hold  PENDING → RISK_HOLD ────────────────────────────────────
router.patch(
  '/:id/hold',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body as { reason?: string };

      const payout = await prisma.walletTransaction.findFirst({ where: { id, type: 'WITHDRAWAL' } });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'PENDING') {
        res.status(400).json({ message: 'Only PENDING payouts can be placed on hold' });
        return;
      }

      const updated = await prisma.walletTransaction.update({
        where: { id },
        data: {
          status: 'RISK_HOLD',
          description: reason
            ? `Задържано за проверка: ${reason}`
            : 'Задържано за проверка при съмнение',
        },
      });

      notifySubscriber(id, 'held', reason);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/release  RISK_HOLD → PENDING ─────────────────────────────────
router.patch(
  '/:id/release',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const payout = await prisma.walletTransaction.findFirst({ where: { id, type: 'WITHDRAWAL' } });
      if (!payout) {
        res.status(404).json({ message: 'Payout not found' });
        return;
      }
      if (payout.status !== 'RISK_HOLD') {
        res.status(400).json({ message: 'Only RISK_HOLD payouts can be released' });
        return;
      }

      // Preserve the hold reason for audit trail; prefix it so admins know the hold was lifted
      const releasedDesc = payout.description
        ? `[Освободено] ${payout.description}`
        : null;

      const updated = await prisma.walletTransaction.update({
        where: { id },
        data: { status: 'PENDING', description: releasedDesc },
      });

      notifySubscriber(id, 'released');
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

// ─── PATCH /:id/fail  PROCESSING → FAILED (bank-side failure, balance restored) ──
router.patch(
  '/:id/fail',
  requirePermission('finance.payouts.write'),
  async (req, res, next) => {
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
      if (payout.status !== 'PROCESSING') {
        res.status(400).json({ message: 'Only PROCESSING payouts can be marked as failed' });
        return;
      }

      const restoreAmount = -payout.amount;

      await prisma.$transaction([
        prisma.walletTransaction.update({
          where: { id },
          data: {
            status: 'FAILED',
            description: reason
              ? `Неуспешен банков превод: ${reason}`
              : 'Неуспешен банков превод',
          },
        }),
        prisma.wallet.update({
          where: { id: payout.walletId },
          data: {
            balance:          { increment: restoreAmount },
            availableBalance: { increment: restoreAmount },
          },
        }),
      ]);

      notifySubscriber(id, 'failed', reason);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
