/**
 * Admin Finance Routes
 *
 * GET  /api/admin/finance/invoices            — list PartnerCashbackPayments
 * POST /api/admin/finance/invoices/:id/pay    — mark invoice as paid
 * GET  /api/admin/finance/periods             — monthly cashback period summary
 * GET  /api/admin/finance/reports             — aggregate financial stats
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

/* ─── Invoices ────────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/finance/invoices
 * Query: page, limit, status, month (YYYY-MM), search (partner name)
 */
router.get(
  '/invoices',
  requirePermission('finance.invoices.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const month = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where: Parameters<typeof prisma.partnerCashbackPayment.findMany>[0]['where'] = {};
    if (status) where.status = status as never;
    if (month) where.month = month;
    if (search) {
      where.partner = { businessName: { contains: search, mode: 'insensitive' } };
    }

    const [invoices, total] = await Promise.all([
      prisma.partnerCashbackPayment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              status: true,
              city: true,
              partnerType: { select: { name: true, color: true } },
            },
          },
        },
      }),
      prisma.partnerCashbackPayment.count({ where }),
    ]);

    res.json({
      success: true,
      data: invoices,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/finance/invoices/:id/pay
 * Marks invoice as PAID. Body: { notes?: string }
 */
router.post(
  '/invoices/:id/pay',
  requirePermission('finance.invoices.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : null;

    // Existence check (404 before the atomic update attempt)
    const invoice = await prisma.partnerCashbackPayment.findUnique({ where: { id } });
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Atomic guard: updateMany with status precondition prevents a TOCTOU race
    // where two concurrent requests both pass the findUnique check above and
    // both mark the invoice as paid (double-pay).
    const result = await prisma.partnerCashbackPayment.updateMany({
      where: { id, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paidBy: req.user!.id,
        notes: notes ?? invoice.notes,
      },
    });

    if (result.count === 0) {
      return res.status(400).json({ success: false, error: 'Invoice is already marked as paid' });
    }

    const updated = await prisma.partnerCashbackPayment.findUnique({ where: { id } });

    res.json({ success: true, data: updated, message: 'Invoice marked as paid' });
  })
);

/* ─── Periods ─────────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/finance/periods
 * Monthly aggregation of cashback payments.
 * Query: year (defaults to current year)
 */
router.get(
  '/periods',
  requirePermission('finance.periods.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const year = parseInt((_req.query.year as string) || String(new Date().getFullYear()));
    if (isNaN(year) || year < 2020 || year > 2099) {
      return res.status(400).json({ success: false, error: 'Invalid year' });
    }

    const payments = await prisma.partnerCashbackPayment.findMany({
      where: { month: { startsWith: String(year) } },
      select: { month: true, totalCashbackOwed: true, status: true },
    });

    // Group by month
    const monthMap = new Map<
      string,
      { month: string; total: number; pending: number; paid: number; overdue: number; count: number }
    >();

    for (const p of payments) {
      const existing = monthMap.get(p.month) ?? {
        month: p.month,
        total: 0,
        pending: 0,
        paid: 0,
        overdue: 0,
        count: 0,
      };
      existing.total += p.totalCashbackOwed;
      existing.count += 1;
      if (p.status === 'PENDING') existing.pending += 1;
      else if (p.status === 'PAID') existing.paid += 1;
      else if (p.status === 'OVERDUE') existing.overdue += 1;
      monthMap.set(p.month, existing);
    }

    const periods = Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));

    res.json({ success: true, data: periods, meta: { year } });
  })
);

/* ─── Reports ─────────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/finance/reports
 * Aggregate financial statistics.
 * Query: from (ISO date), to (ISO date) — defaults to current month
 */
router.get(
  '/reports',
  requirePermission('finance.reports.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const now = new Date();
    const fromParam = req.query.from as string;
    const toParam = req.query.to as string;

    const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date range' });
    }

    const [walletStats, cashbackPaymentStats, invoiceTotals] = await Promise.all([
      // Wallet transaction aggregates
      prisma.walletTransaction.groupBy({
        by: ['type'],
        where: {
          createdAt: { gte: from, lte: to },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Subscription revenue: active subscriptions count
      prisma.subscription.groupBy({
        by: ['plan', 'status'],
        _count: { id: true },
      }),
      // Cashback payments in period
      prisma.partnerCashbackPayment.aggregate({
        where: { createdAt: { gte: from, lte: to } },
        _sum: { totalCashbackOwed: true },
        _count: { id: true },
      }),
    ]);

    const txByType: Record<string, { total: number; count: number }> = {};
    for (const row of walletStats) {
      txByType[row.type] = { total: row._sum.amount ?? 0, count: row._count.id };
    }

    res.json({
      success: true,
      data: {
        period: { from: from.toISOString(), to: to.toISOString() },
        walletTransactions: txByType,
        subscriptionBreakdown: cashbackPaymentStats,
        cashbackInvoices: {
          total: invoiceTotals._sum.totalCashbackOwed ?? 0,
          count: invoiceTotals._count.id,
        },
      },
    });
  })
);

export default router;
