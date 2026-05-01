/**
 * Admin Finance Routes
 *
 * GET  /api/admin/finance/invoices                     — list PartnerCashbackPayments, enriched with reportingPeriodStatus
 * POST /api/admin/finance/invoices/generate            — create PENDING invoice records for all partners in a month
 * POST /api/admin/finance/invoices/:id/pay             — mark invoice as paid (blocked on LOCKED/INVOICED period)
 * PATCH /api/admin/finance/invoices/:id/status         — change invoice status (blocked on LOCKED/INVOICED period)
 * PATCH /api/admin/finance/invoices/:id/notes          — update notes (allowed on any period status)
 * GET  /api/admin/finance/periods                      — monthly cashback period summary
 * GET  /api/admin/finance/reporting-periods            — ReportingPeriod lifecycle rows
 * POST /api/admin/finance/reporting-periods            — create/ensure a ReportingPeriod exists
 * PATCH /api/admin/finance/reporting-periods/:month/status — advance ReportingPeriod lifecycle
 * GET  /api/admin/finance/reports                      — aggregate financial stats
 * GET  /api/admin/finance/export                       — CSV/xlsx export (spec 6.4)
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import * as XLSX from 'xlsx';
import { ReportingPeriodStatus, ScanStatus } from '@prisma/client';

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

    // Enrich each invoice with its billing period lifecycle status.
    const uniqueMonths = [...new Set(invoices.map(i => i.month))];
    const reportingPeriods = uniqueMonths.length > 0
      ? await prisma.reportingPeriod.findMany({
          where: { month: { in: uniqueMonths } },
          select: { month: true, status: true },
        })
      : [];
    const periodStatusByMonth = new Map(reportingPeriods.map(p => [p.month, p.status]));

    const enriched = invoices.map(inv => ({
      ...inv,
      reportingPeriodStatus: periodStatusByMonth.get(inv.month) ?? null,
    }));

    res.json({
      success: true,
      data: enriched,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * Returns true when the given month's ReportingPeriod is LOCKED or INVOICED,
 * meaning data changes are not allowed.
 */
async function isPeriodLocked(month: string): Promise<boolean> {
  const period = await prisma.reportingPeriod.findUnique({
    where: { month },
    select: { status: true },
  });
  return period?.status === 'LOCKED' || period?.status === 'INVOICED';
}

/**
 * POST /api/admin/finance/invoices/generate
 * Creates PENDING PartnerCashbackPayment records for every partner that has
 * at least one APPROVED sticker scan in the given month.  Existing records for
 * the same partner+month are updated with fresh totals (idempotent).
 * Body: { month: "YYYY-MM" }
 */
router.post(
  '/invoices/generate',
  requirePermission('finance.invoices.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { month } = req.body as { month?: string };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'month must be in YYYY-MM format' });
    }

    if (await isPeriodLocked(month)) {
      return res.status(409).json({ success: false, error: `Billing period ${month} is locked or invoiced — no changes allowed.` });
    }

    const [year, mon] = month.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd   = new Date(year, mon, 1);

    // Aggregate APPROVED sticker scans → per-partner cashback and turnover totals.
    const scans = await prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.APPROVED,
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      select: {
        cashbackAmount: true,
        verifiedAmount: true,
        billAmount: true,
        venue: { select: { partnerId: true } },
      },
    });

    type Totals = { cashback: number; turnover: number };
    const byPartner = new Map<string, Totals>();
    for (const s of scans) {
      const pid = s.venue?.partnerId;
      if (!pid) continue;
      const cur = byPartner.get(pid) ?? { cashback: 0, turnover: 0 };
      cur.cashback  += s.cashbackAmount;
      cur.turnover  += s.verifiedAmount ?? s.billAmount ?? 0;
      byPartner.set(pid, cur);
    }

    if (byPartner.size === 0) {
      return res.json({ success: true, data: { created: 0, updated: 0, total: 0 },
        message: 'No approved scans found for this month.' });
    }

    const partnerIds = [...byPartner.keys()];
    const partners = await prisma.partner.findMany({
      where: { id: { in: partnerIds } },
      select: {
        id: true,
        discountRate: true,
        partnerType: { select: { maxDiscountRate: true } },
      },
    });
    const partnerRateMap = new Map(partners.map(p => [
      p.id,
      p.discountRate ?? (p.partnerType as { maxDiscountRate?: number } | null)?.maxDiscountRate ?? null,
    ]));

    let created = 0;
    let updated = 0;

    for (const [partnerId, totals] of byPartner) {
      const contractedRate = partnerRateMap.get(partnerId) ?? null;
      const totalCashbackOwed = Math.round(totals.cashback * 100) / 100;
      const turnoverAmount    = Math.round(totals.turnover * 100) / 100;
      const marginAmount = contractedRate != null && turnoverAmount > 0
        ? Math.round(((contractedRate / 100) * turnoverAmount - totalCashbackOwed) * 100) / 100
        : 0;

      const existing = await prisma.partnerCashbackPayment.findUnique({
        where: { partnerId_month: { partnerId, month } },
      });

      await prisma.partnerCashbackPayment.upsert({
        where: { partnerId_month: { partnerId, month } },
        create: {
          partnerId, month,
          totalCashbackOwed, turnoverAmount, contractedRate, marginAmount,
          status: 'PENDING',
        },
        update: {
          totalCashbackOwed, turnoverAmount, contractedRate, marginAmount,
          // Keep existing status/paidAt/paidBy so we don't overwrite a PAID record.
        },
      });

      if (existing) updated++; else created++;
    }

    return res.json({
      success: true,
      data: { created, updated, total: created + updated },
      message: `Generated ${created + updated} invoice(s) for ${month}.`,
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

    if (await isPeriodLocked(invoice.month)) {
      return res.status(409).json({ success: false, error: `Billing period ${invoice.month} is locked or invoiced — no changes allowed.` });
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

    if (await isPeriodLocked(invoice.month)) {
      return res.status(409).json({ success: false, error: `Billing period ${invoice.month} is locked or invoiced — no changes allowed.` });
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
 * Also surfaces months that have APPROVED sticker scans but no generated invoices yet
 * (hasUnbilledScans: true) so the admin knows to run invoice generation.
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
      select: { month: true, totalCashbackOwed: true, marginAmount: true, status: true },
    });

    // Group by month; total = full partner obligation (cashback + margin), matching spec 6.2.
    const monthMap = new Map<
      string,
      { month: string; total: number; pending: number; paid: number; overdue: number; count: number; hasUnbilledScans: boolean }
    >();

    for (const p of payments) {
      const existing = monthMap.get(p.month) ?? {
        month: p.month,
        total: 0,
        pending: 0,
        paid: 0,
        overdue: 0,
        count: 0,
        hasUnbilledScans: false,
      };
      existing.total += p.totalCashbackOwed + p.marginAmount;
      existing.count += 1;
      if (p.status === 'PENDING') existing.pending += 1;
      else if (p.status === 'PAID') existing.paid += 1;
      else if (p.status === 'OVERDUE') existing.overdue += 1;
      monthMap.set(p.month, existing);
    }

    // Find months with APPROVED scans that have no invoice rows yet (spec §4 gap fix).
    const yearStart = new Date(year, 0, 1);
    const yearEnd   = new Date(year + 1, 0, 1);
    const scans = await prisma.stickerScan.findMany({
      where: { status: ScanStatus.APPROVED, createdAt: { gte: yearStart, lt: yearEnd } },
      select: { createdAt: true },
    });

    for (const scan of scans) {
      const d = scan.createdAt;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: monthKey, total: 0, pending: 0, paid: 0, overdue: 0, count: 0,
          hasUnbilledScans: true,
        });
      }
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
 * Advances the period to the next lifecycle status (strictly forward: OPEN → FOR_REVIEW → LOCKED → INVOICED).
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

    // Enforce the allowed transition map — only forward steps are valid.
    const allowedNext = ALLOWED_TRANSITIONS[period.status];
    if (newStatus !== allowedNext) {
      const allowed = allowedNext ? allowedNext : 'none';
      return res.status(400).json({
        success: false,
        error: `Cannot transition from ${period.status} to ${newStatus}. Only ${allowed} is allowed next.`,
      });
    }

    // Guard: require at least one generated invoice before sending to review (spec §6.3).
    if (period.status === 'OPEN' && newStatus === 'FOR_REVIEW') {
      const invoiceCount = await prisma.partnerCashbackPayment.count({ where: { month } });
      if (invoiceCount === 0) {
        return res.status(409).json({
          success: false,
          error: `Cannot advance period ${month} to review: no partner invoices have been generated yet. Generate invoices first.`,
        });
      }
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

      // Join financial totals so the export matches spec §6.4 (cashback, margin, invoices, payments).
      const periodMonths = periods.map(p => p.month);
      const finRows = periodMonths.length > 0
        ? await prisma.partnerCashbackPayment.findMany({
            where: { month: { in: periodMonths } },
            select: { month: true, totalCashbackOwed: true, marginAmount: true, status: true },
          })
        : [];

      type FinTotals = { cashback: number; margin: number; total: number; count: number; paid: number; pending: number; overdue: number };
      const finByMonth = new Map<string, FinTotals>();
      for (const p of finRows) {
        const cur = finByMonth.get(p.month) ?? { cashback: 0, margin: 0, total: 0, count: 0, paid: 0, pending: 0, overdue: 0 };
        cur.cashback  += p.totalCashbackOwed;
        cur.margin    += p.marginAmount;
        cur.total     += p.totalCashbackOwed + p.marginAmount;
        cur.count     += 1;
        if (p.status === 'PAID')    cur.paid++;
        if (p.status === 'PENDING') cur.pending++;
        if (p.status === 'OVERDUE') cur.overdue++;
        finByMonth.set(p.month, cur);
      }

      rows = periods.map(p => {
        const fin = finByMonth.get(p.month);
        return {
          month: p.month,
          status: p.status,
          partners: fin?.count ?? 0,
          cashback: fin?.cashback ?? 0,
          margin: fin?.margin ?? 0,
          total: fin?.total ?? 0,
          paid: fin?.paid ?? 0,
          pending: fin?.pending ?? 0,
          overdue: fin?.overdue ?? 0,
          lockedAt: p.lockedAt?.toISOString() ?? '',
          lockedBy: p.lockedBy ?? '',
          invoicedAt: p.invoicedAt?.toISOString() ?? '',
          invoicedBy: p.invoicedBy ?? '',
          notes: p.notes ?? '',
        };
      });

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
      periods:  ['month', 'status', 'partners', 'cashback', 'margin', 'total', 'paid', 'pending', 'overdue', 'lockedAt', 'lockedBy', 'invoicedAt', 'invoicedBy', 'notes'],
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
