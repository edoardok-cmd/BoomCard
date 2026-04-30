/**
 * Admin Finance Routes
 *
 * GET  /api/admin/finance/invoices            — list PartnerCashbackPayments
 * POST /api/admin/finance/invoices/:id/pay    — mark invoice as paid
 * GET  /api/admin/finance/periods             — monthly cashback period summary
 * POST /api/admin/finance/periods             — create/ensure a ReportingPeriod exists
 * PATCH /api/admin/finance/periods/:month/status — advance ReportingPeriod lifecycle
 * GET  /api/admin/finance/reports             — aggregate financial stats
 * GET  /api/admin/finance/export              — CSV/xlsx export (spec 6.4)
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import * as XLSX from 'xlsx';
import { ReportingPeriodStatus } from '@prisma/client';

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

    const VALID_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
    if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const where: Parameters<typeof prisma.partnerCashbackPayment.findMany>[0]['where'] = {};
    if (status) where.status = status as (typeof VALID_STATUSES)[number];
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

/**
 * PATCH /api/admin/finance/invoices/:id/status
 * Transitions invoice to OVERDUE or back to PENDING. Cannot undo PAID.
 * Body: { status: 'OVERDUE' | 'PENDING' }
 */
router.patch(
  '/invoices/:id/status',
  requirePermission('finance.invoices.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body as { status?: string };

    if (status !== 'OVERDUE' && status !== 'PENDING') {
      return res.status(400).json({ success: false, error: "status must be 'OVERDUE' or 'PENDING'" });
    }

    const invoice = await prisma.partnerCashbackPayment.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (invoice.status === 'PAID') {
      return res.status(400).json({ success: false, error: 'Cannot change status of a paid invoice' });
    }

    // Atomic guard: updateMany with status precondition prevents a concurrent /pay
    // call from being silently overwritten by this status transition.
    const result = await prisma.partnerCashbackPayment.updateMany({
      where: { id, status: { not: 'PAID' } },
      data: { status: status as 'OVERDUE' | 'PENDING' },
    });

    if (result.count === 0) {
      return res.status(400).json({ success: false, error: 'Cannot change status of a paid invoice' });
    }

    const updated = await prisma.partnerCashbackPayment.findUnique({ where: { id } });
    res.json({ success: true, data: updated });
  })
);

/**
 * PATCH /api/admin/finance/invoices/:id/notes
 * Update notes on any invoice regardless of payment status.
 * Body: { notes: string }
 */
router.patch(
  '/invoices/:id/notes',
  requirePermission('finance.invoices.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    const invoice = await prisma.partnerCashbackPayment.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const updated = await prisma.partnerCashbackPayment.update({
      where: { id },
      data: { notes: notes || null },
    });

    res.json({ success: true, data: updated });
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

/* ─── Reporting Period lifecycle (spec 6.3) ───────────────────────────────── */

/**
 * GET /api/admin/finance/reporting-periods
 * Lists all ReportingPeriod rows, optional year filter.
 */
router.get(
  '/reporting-periods',
  requirePermission('finance.periods.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const year = req.query.year ? String(req.query.year) : null;

    const where: Parameters<typeof prisma.reportingPeriod.findMany>[0]['where'] = {};
    if (year) where.month = { startsWith: year };

    const periods = await prisma.reportingPeriod.findMany({
      where,
      orderBy: { month: 'desc' },
    });

    res.json({ success: true, data: periods });
  })
);

/**
 * POST /api/admin/finance/reporting-periods
 * Ensures a ReportingPeriod exists for the given month (idempotent).
 * Body: { month: "YYYY-MM", notes?: string }
 */
router.post(
  '/reporting-periods',
  requirePermission('finance.periods.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { month, notes } = req.body as { month?: string; notes?: string };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'month must be in YYYY-MM format' });
    }

    const period = await prisma.reportingPeriod.upsert({
      where: { month },
      create: { month, status: 'OPEN', notes: notes ?? null },
      update: { notes: notes ?? undefined },
    });

    res.json({ success: true, data: period });
  })
);

const PERIOD_STATUS_ORDER: ReportingPeriodStatus[] = ['OPEN', 'FOR_REVIEW', 'LOCKED', 'INVOICED'];
const ALLOWED_TRANSITIONS: Partial<Record<ReportingPeriodStatus, ReportingPeriodStatus>> = {
  OPEN: 'FOR_REVIEW',
  FOR_REVIEW: 'LOCKED',
  LOCKED: 'INVOICED',
};

/**
 * PATCH /api/admin/finance/reporting-periods/:month/status
 * Advances the period to the next status (or back to OPEN from FOR_REVIEW).
 * Body: { status: ReportingPeriodStatus }
 */
router.patch(
  '/reporting-periods/:month/status',
  requirePermission('finance.periods.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { month } = req.params;
    const { status } = req.body as { status?: string };

    if (!status || !PERIOD_STATUS_ORDER.includes(status as ReportingPeriodStatus)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${PERIOD_STATUS_ORDER.join(', ')}` });
    }

    const period = await prisma.reportingPeriod.findUnique({ where: { month } });
    if (!period) return res.status(404).json({ success: false, error: 'Reporting period not found' });

    const newStatus = status as ReportingPeriodStatus;

    // #15 fix: enforce the allowed transition map — only forward steps are valid.
    // #14 fix: the previous guard was a no-op (empty body); this one actually rejects.
    const allowedNext = ALLOWED_TRANSITIONS[period.status];
    if (newStatus !== allowedNext) {
      const allowed = allowedNext ? allowedNext : 'none';
      return res.status(400).json({
        success: false,
        error: `Cannot transition from ${period.status} to ${newStatus}. Only ${allowed} is allowed next.`,
      });
    }

    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'LOCKED' && period.status !== 'LOCKED') {
      updateData.lockedAt = new Date();
      updateData.lockedBy = req.user!.id;
    }
    if (newStatus === 'INVOICED' && period.status !== 'INVOICED') {
      updateData.invoicedAt = new Date();
      updateData.invoicedBy = req.user!.id;
    }

    const updated = await prisma.reportingPeriod.update({
      where: { month },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  })
);

/* ─── CSV/xlsx export (spec 6.4) ──────────────────────────────────────────── */

/**
 * GET /api/admin/finance/export
 * Query: type (invoices|periods|reports), format (csv|xlsx), from, to, month, year
 */
router.get(
  '/export',
  requirePermission('finance.reports.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      type = 'invoices',
      format = 'csv',
      from: fromParam,
      to: toParam,
      month,
      year,
      search,
      status: exportStatus,
    } = req.query as Record<string, string>;

    if (!['invoices', 'periods', 'reports'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be invoices, periods, or reports' });
    }
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ success: false, error: 'format must be csv or xlsx' });
    }

    let rows: Record<string, unknown>[] = [];

    if (type === 'invoices') {
      const VALID_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
      const where: Parameters<typeof prisma.partnerCashbackPayment.findMany>[0]['where'] = {};
      // month is more specific than year — it wins when both are present.
      if (month) where.month = month;
      else if (year) where.month = { startsWith: year };
      if (exportStatus && (VALID_STATUSES as readonly string[]).includes(exportStatus)) {
        where.status = exportStatus as (typeof VALID_STATUSES)[number];
      }
      if (search) where.partner = { businessName: { contains: search, mode: 'insensitive' } };

      const invoices = await prisma.partnerCashbackPayment.findMany({
        where,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        include: { partner: { select: { businessName: true, city: true } } },
      });

      rows = invoices.map(i => ({
        id: i.id,
        partner: i.partner.businessName,
        city: i.partner.city ?? '',
        month: i.month,
        turnoverAmount: i.turnoverAmount,
        contractedRate: i.contractedRate ?? '',
        totalCashbackOwed: i.totalCashbackOwed,
        marginAmount: i.marginAmount,
        status: i.status,
        paidAt: i.paidAt?.toISOString() ?? '',
        notes: i.notes ?? '',
        createdAt: i.createdAt.toISOString(),
      }));

    } else if (type === 'periods') {
      const where: Parameters<typeof prisma.reportingPeriod.findMany>[0]['where'] = {};
      if (year) where.month = { startsWith: year };

      const periods = await prisma.reportingPeriod.findMany({ where, orderBy: { month: 'desc' } });

      rows = periods.map(p => ({
        month: p.month,
        status: p.status,
        lockedAt: p.lockedAt?.toISOString() ?? '',
        invoicedAt: p.invoicedAt?.toISOString() ?? '',
        notes: p.notes ?? '',
      }));

    } else {
      // aggregate report
      const now = new Date();
      const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date range' });
      }

      const [walletStats, invoiceTotals] = await Promise.all([
        prisma.walletTransaction.groupBy({
          by: ['type'],
          where: { createdAt: { gte: from, lte: to }, status: 'COMPLETED' },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.partnerCashbackPayment.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { partnerId: true, month: true, totalCashbackOwed: true, marginAmount: true, status: true },
        }),
      ]);

      rows = [
        ...walletStats.map(w => ({ category: 'wallet', type: w.type, total: w._sum.amount ?? 0, count: w._count.id })),
        ...invoiceTotals.map(i => ({
          category: 'cashback',
          partnerId: i.partnerId,
          month: i.month,
          cashback: i.totalCashbackOwed,
          margin: i.marginAmount,
          status: i.status,
        })),
      ];
    }

    const filename = `boomcard_${type}_${new Date().toISOString().slice(0, 10)}`;

    // Always use the canonical column order, regardless of row shape.
    // Object.keys(rows[0]) would give wrong results for the 'reports' type
    // because wallet rows and cashback rows have different keys — the first
    // row alone does not represent the full schema.
    const HEADERS: Record<string, string[]> = {
      invoices: ['id', 'partner', 'city', 'month', 'turnoverAmount', 'contractedRate', 'totalCashbackOwed', 'marginAmount', 'status', 'paidAt', 'notes', 'createdAt'],
      periods:  ['month', 'status', 'lockedAt', 'invoicedAt', 'notes'],
      reports:  ['category', 'type', 'total', 'count', 'partnerId', 'month', 'cashback', 'margin', 'status'],
    };

    if (format === 'csv') {
      const headers = HEADERS[type] ?? [];
      const csvLines = [
        headers.join(','),
        ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csvLines.join('\n'));
    }

    // xlsx — pass header so column names appear even when rows is empty
    const xlsxHeaders = HEADERS[type] ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
    const ws = XLSX.utils.json_to_sheet(rows, { header: xlsxHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buf);
  })
);

export default router;
