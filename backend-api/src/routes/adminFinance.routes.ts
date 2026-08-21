/**
 * Admin Finance Routes
 *
 * GET  /api/admin/finance/invoices                     — list PartnerCashbackPayments, enriched with reportingPeriodStatus
 * POST /api/admin/finance/invoices/generate            — create PENDING invoice records for all partners in a month
 * POST /api/admin/finance/invoices/:id/pay             — mark invoice as paid (always allowed — payment tracking is separate from billing data)
 * PATCH /api/admin/finance/invoices/:id/status         — change invoice status to OVERDUE/PENDING (blocked on LOCKED/INVOICED period)
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
import { Prisma, ReportingPeriodStatus, ScanStatus } from '@prisma/client';
import { adminCashbackService } from '../services/adminCashback.service';
import { parsePagination } from '../utils/pagination';
import { bgnToEur, toEur, displayCurrency } from '../utils/currency';

const router = Router();

// PartnerCashbackPayment monetary fields (totalCashbackOwed, turnoverAmount,
// marginAmount) are stored BGN-denominated — convert to EUR before a row goes
// into any API response (BC-QA-031 — EUR-only responses).
function toEurInvoice<T extends {
  totalCashbackOwed?: number | null;
  turnoverAmount?: number | null;
  marginAmount?: number | null;
}>(inv: T): T {
  return {
    ...inv,
    ...(inv.totalCashbackOwed != null && { totalCashbackOwed: bgnToEur(inv.totalCashbackOwed) }),
    ...(inv.turnoverAmount != null && { turnoverAmount: bgnToEur(inv.turnoverAmount) }),
    ...(inv.marginAmount != null && { marginAmount: bgnToEur(inv.marginAmount) }),
  };
}

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

// Spec §6.4 — payout (WITHDRAWAL) status whitelist. Shared by /reports and /export
// validators so a future spec change (e.g. adding "DISPUTED") cannot drift between
// endpoints.
const VALID_PAYOUT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RISK_HOLD', 'TRIAL_PENDING', 'ANNULLED'] as const;

// Spec §6.4 — subscription plan whitelist for plan filter. UNKNOWN is accepted for
// scan-side classification (users without an active sub at scan time) even though it
// isn't a real Prisma SubscriptionPlan enum value — wallet/payout queries treat it as
// "no subscribers" rather than issuing an invalid enum query.
const VALID_PLANS = ['PREMIUM_WEEKLY', 'BASIC', 'PREMIUM_MONTHLY', 'UNKNOWN'] as const;

/* ─── Invoices ────────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/finance/invoices
 * Query: page, limit, status, month (YYYY-MM), search (partner name)
 */
router.get(
  '/invoices',
  requirePermission('finance.invoices.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { skip, page, limit } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
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
      ...toEurInvoice(inv),
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
    let skippedPaid = 0;

    const invoiceYear = parseInt(month.slice(0, 4), 10);

    for (const [partnerId, totals] of byPartner) {
      const contractedRate = partnerRateMap.get(partnerId) ?? null;
      const totalCashbackOwed = Math.round(totals.cashback * 100) / 100;
      const turnoverAmount    = Math.round(totals.turnover * 100) / 100;
      // Margin is what BoomCard retains above the cashback payout.
      const rawMargin = contractedRate != null && turnoverAmount > 0
        ? Math.round(((contractedRate / 100) * turnoverAmount - totalCashbackOwed) * 100) / 100
        : 0;
      if (rawMargin < 0) {
        console.warn(
          `[finance/generate] Negative margin for partner ${partnerId} month ${month}: ` +
          `raw=${rawMargin} BGN (cashback=${totalCashbackOwed}, contracted=${contractedRate}%, turnover=${turnoverAmount}). ` +
          `Clamping to 0 — verify contracted rate was not reduced after scan approval.`
        );
      }
      const marginAmount = Math.max(0, rawMargin);

      const existing = await prisma.partnerCashbackPayment.findUnique({
        where: { partnerId_month: { partnerId, month } },
      });

      if (existing) {
        // PAID invoices are frozen accounting records — never recompute their
        // financial totals, even if scan state changed after payment. The admin
        // must explicitly reverse the payment first.
        if (existing.status === 'PAID') {
          skippedPaid++;
          continue;
        }
        // Update path: never touch invoiceNumber once assigned.
        await prisma.partnerCashbackPayment.update({
          where: { partnerId_month: { partnerId, month } },
          data: { totalCashbackOwed, turnoverAmount, contractedRate, marginAmount },
        });
        updated++;
      } else {
        // Create path: assign invoice number and write in one serializable transaction
        // so concurrent generate requests cannot read the same max and collide.
        try {
          await prisma.$transaction(async (tx) => {
            const invoiceNumber = await nextInvoiceNumberTx(tx, invoiceYear);
            await tx.partnerCashbackPayment.create({
              data: {
                partnerId, month,
                totalCashbackOwed, turnoverAmount, contractedRate, marginAmount,
                status: 'PENDING',
                invoiceNumber,
              },
            });
          }, { isolationLevel: 'Serializable' });
          created++;
        } catch (err: unknown) {
          // P2002 — unique constraint on (partnerId, month): a concurrent request
          // already committed this invoice; treat as a no-op for this request.
          // P2034 — serialization failure: PostgreSQL SSI aborted this transaction
          // because another concurrent serializable transaction committed first;
          // same outcome — the invoice was already created by the winner.
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            (err.code === 'P2002' || err.code === 'P2034')
          ) {
            updated++;
          } else {
            throw err;
          }
        }
      }
    }

    // Backfill of legacy unnumbered invoices is exposed as a separate one-shot
    // admin endpoint (POST /admin/finance/invoices/backfill-numbers) — it must
    // not run inside the hot generate path (it walked the entire unnumbered
    // table on every call, which is O(N) on a per-request basis).

    return res.json({
      success: true,
      data: { created, updated, skippedPaid, total: created + updated + skippedPaid },
      message:
        `Generated ${created + updated} invoice(s) for ${month}` +
        (skippedPaid > 0 ? ` (${skippedPaid} paid invoice(s) preserved unchanged)` : '') +
        '.',
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
    res.json({ success: true, data: updated ? toEurInvoice(updated) : updated, message: 'Invoice marked as paid' });
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
    res.json({ success: true, data: updated ? toEurInvoice(updated) : updated });
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

    res.json({ success: true, data: toEurInvoice(updated) });
  })
);

/* ─── Invoice number helpers ──────────────────────────────────────────────── */

// Accepted transaction-client type from Prisma's $transaction callback parameter.
type PrismaTxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Reads the current max invoice number for the year and returns the next one.
 * Must be called within a serializable transaction so the read and the subsequent
 * create are atomic — preventing concurrent requests from computing the same sequence.
 * Format: BC-YYYY-NNNN (e.g. BC-2026-0001).
 */
async function nextInvoiceNumberTx(tx: PrismaTxClient, year: number): Promise<string> {
  const prefix = `BC-${year}-`;
  const last = await tx.partnerCashbackPayment.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const seq = last?.invoiceNumber
    ? parseInt(last.invoiceNumber.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Convenience wrapper used by the backfill helper (runs outside an explicit tx). */
async function nextInvoiceNumber(year: number): Promise<string> {
  return prisma.$transaction(
    (tx) => nextInvoiceNumberTx(tx, year),
    { isolationLevel: 'Serializable' },
  );
}

/**
 * One-shot backfill: assigns invoice numbers to any PartnerCashbackPayment rows
 * that are missing one. Exposed via POST /invoices/backfill-numbers below so
 * the admin can trigger it manually — it must NOT run inside the per-request
 * generate path (O(N) over the unnumbered set per call).
 */
async function backfillInvoiceNumbers(): Promise<{ backfilled: number; remaining: number }> {
  const unnumbered = await prisma.partnerCashbackPayment.findMany({
    where: { invoiceNumber: null },
    orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, month: true },
  });
  let backfilled = 0;
  for (const inv of unnumbered) {
    const year = parseInt(inv.month.slice(0, 4), 10);
    const num = await nextInvoiceNumber(year);
    try {
      await prisma.partnerCashbackPayment.update({
        where: { id: inv.id },
        data: { invoiceNumber: num },
      });
      backfilled++;
    } catch {
      // Unique constraint race — skip; admin can re-run if they want a clean state.
    }
  }
  const remaining = await prisma.partnerCashbackPayment.count({ where: { invoiceNumber: null } });
  return { backfilled, remaining };
}

/**
 * POST /api/admin/finance/invoices/backfill-numbers
 * Admin one-shot to assign invoice numbers to legacy rows missing one.
 * Idempotent: safe to call repeatedly; only operates on unnumbered records.
 */
router.post(
  '/invoices/backfill-numbers',
  requirePermission('finance.invoices.write'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const result = await backfillInvoiceNumbers();
    res.json({
      success: true,
      data: result,
      message: `Backfilled ${result.backfilled} invoice number(s); ${result.remaining} still missing.`,
    });
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
      select: { month: true, totalCashbackOwed: true, marginAmount: true, status: true, partnerId: true },
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

    // Build a per-month set of partner IDs that already have invoices.
    const monthInvoicedPartners = new Map<string, Set<string>>();
    for (const p of payments) {
      if (!monthInvoicedPartners.has(p.month)) monthInvoicedPartners.set(p.month, new Set());
      monthInvoicedPartners.get(p.month)!.add(p.partnerId);
    }

    // Find APPROVED scans for the year; flag months where a partner has scans but no invoice.
    const yearStart = new Date(year, 0, 1);
    const yearEnd   = new Date(year + 1, 0, 1);
    const scans = await prisma.stickerScan.findMany({
      where: { status: ScanStatus.APPROVED, createdAt: { gte: yearStart, lt: yearEnd } },
      select: { createdAt: true, venue: { select: { partnerId: true } } },
    });

    for (const scan of scans) {
      const pid = scan.venue?.partnerId;
      if (!pid) continue;
      const d = scan.createdAt;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      // Skip if this partner already has an invoice for this month.
      if (monthInvoicedPartners.get(monthKey)?.has(pid)) continue;
      const existing = monthMap.get(monthKey);
      if (!existing) {
        monthMap.set(monthKey, {
          month: monthKey, total: 0, pending: 0, paid: 0, overdue: 0, count: 0,
          hasUnbilledScans: true,
        });
      } else {
        existing.hasUnbilledScans = true;
      }
    }

    const periods = Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));

    // total is a BGN-denominated aggregate — convert to EUR before returning
    // (BC-QA-031 — EUR-only responses).
    const periodsEur = periods.map(p => ({ ...p, total: bgnToEur(p.total) }));

    res.json({ success: true, data: periodsEur, meta: { year } });
  })
);

/* ─── Reports ─────────────────────────────────────────────────────────────── */

/**
 * GET /api/admin/finance/reports
 * Aggregate financial statistics.
 * Query: from (ISO date), to (ISO date), partnerId, invoiceStatus — defaults to current month
 */
router.get(
  '/reports',
  requirePermission('finance.reports.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const now = new Date();
    const fromParam = req.query.from as string;
    const toParam = req.query.to as string;
    const partnerIdParam = typeof req.query.partnerId === 'string' ? req.query.partnerId.trim() : '';
    const invoiceStatusParam = typeof req.query.invoiceStatus === 'string' ? req.query.invoiceStatus.trim() : '';
    const planParam = typeof req.query.plan === 'string' ? req.query.plan.trim() : '';
    const payoutStatusParam = typeof req.query.payoutStatus === 'string' ? req.query.payoutStatus.trim() : '';

    // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by new Date(), which on a Sofia
    // server (UTC+2/+3) means the first 2–3h of that calendar day are missed.  Anchor to Sofia
    // local midnight using the winter offset (+02:00) — this is conservative and safe.
    const from = fromParam
      ? (/^\d{4}-\d{2}-\d{2}$/.test(fromParam)
          ? new Date(fromParam + 'T00:00:00.000+02:00')
          : new Date(fromParam))
      : new Date(now.getFullYear(), now.getMonth(), 1);
    // Anchor to Sofia winter end-of-day (+02:00) to avoid bleeding 2-3h of the next Sofia
    // calendar day into the report.  Symmetric with the +02:00 anchor used for `from`.
    const to = toParam
      ? (/^\d{4}-\d{2}-\d{2}$/.test(toParam)
          ? new Date(toParam + 'T23:59:59.999+02:00')
          : new Date(toParam))
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date range' });
    }
    if (from > to) {
      return res.status(400).json({ success: false, error: 'from date must be before or equal to to date' });
    }

    const VALID_INVOICE_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
    if (invoiceStatusParam && !(VALID_INVOICE_STATUSES as readonly string[]).includes(invoiceStatusParam)) {
      return res.status(400).json({ success: false, error: `invoiceStatus must be one of: ${VALID_INVOICE_STATUSES.join(', ')}` });
    }
    if (planParam && !(VALID_PLANS as readonly string[]).includes(planParam)) {
      return res.status(400).json({ success: false, error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
    }
    // Spec §6.4: reports must be filterable "по плащания" — payout status filter for WITHDRAWAL transactions.
    if (payoutStatusParam && !(VALID_PAYOUT_STATUSES as readonly string[]).includes(payoutStatusParam)) {
      return res.status(400).json({ success: false, error: `payoutStatus must be one of: ${VALID_PAYOUT_STATUSES.join(', ')}` });
    }

    // Compute month strings that fall within the date range (used for both invoice and period filters).
    // IMPORTANT: extract YYYY-MM directly from the original date-string params rather than from the
    // parsed `from`/`to` Date objects.  The +02:00 Sofia anchor applied to date-only from= strings
    // pushes the UTC representation into the previous calendar day
    // (e.g. 2026-05-01T00:00:00+02:00 → 2026-04-30T22:00Z), so from.getUTCMonth() returns April
    // and the invoice/period filter would incorrectly include the prior month.
    // The `to` side is unaffected (T23:59:59.999Z stays in the correct UTC month).
    const fromYM = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
      ? fromParam.slice(0, 7)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const toYM = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)
      ? toParam.slice(0, 7)
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [fromY, fromM] = fromYM.split('-').map(Number);
    const [toY, toM] = toYM.split('-').map(Number);
    const months: string[] = [];
    const cursor = new Date(Date.UTC(fromY, fromM - 1, 1));
    const toMonthStart = new Date(Date.UTC(toY, toM - 1, 1));
    while (cursor <= toMonthStart) {
      months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    // Invoice filter: filter by billing month (not createdAt) so a report for "May" always
    // shows May's invoices regardless of when the invoice record was generated.
    const invoiceWhere: Parameters<typeof prisma.partnerCashbackPayment.findMany>[0]['where'] = {
      month: { in: months },
    };
    if (partnerIdParam) invoiceWhere.partnerId = partnerIdParam;
    if (invoiceStatusParam) invoiceWhere.status = invoiceStatusParam as (typeof VALID_INVOICE_STATUSES)[number];

    // When a plan filter is active, restrict wallet stats to users who have (or had)
    // that subscription plan.  We use the user's current plan rather than scan-time
    // attribution here because wallet transactions aren't tagged by plan at creation
    // time.  This is accurate enough for operational reporting.
    // Kicked off as a promise so the partner-independent invoice/scan/period queries
    // below run concurrently with it; the wallet/payout queries chain off it via .then().
    // UNKNOWN is treated as "no subscribers" (empty userId set) since it isn't a real
    // Prisma SubscriptionPlan enum value and would otherwise throw a validation error.
    const planUserIdsPromise: Promise<string[] | undefined> =
      planParam === 'UNKNOWN'
        ? Promise.resolve([])
        : planParam
          ? prisma.subscription
              .findMany({
                where: { plan: planParam as any },
                select: { userId: true },
                distinct: ['userId'],
              })
              .then(subs => subs.map(s => s.userId))
          : Promise.resolve(undefined);

    const walletWhereBase: Prisma.WalletTransactionWhereInput = {
      createdAt: { gte: from, lte: to },
      status: 'COMPLETED',
    };

    // Spec §6.4: payout breakdown — wallet WITHDRAWAL transactions grouped by status.
    // Always returned regardless of payoutStatus filter so the UI can show the full distribution.
    // When payoutStatusParam is set, the result is restricted to that single status.
    const payoutBreakdownWhereBase: Prisma.WalletTransactionWhereInput = {
      type: 'WITHDRAWAL',
      createdAt: { gte: from, lte: to },
    };
    if (payoutStatusParam) {
      payoutBreakdownWhereBase.status = payoutStatusParam as Prisma.WalletTransactionWhereInput['status'];
    }

    const [walletStats, invoiceTotals, partnerInvoices, periodRows, scansInRange, periodInvoiceStatusCounts, payoutStatusStats] = await Promise.all([
      // Wallet transaction aggregates — filtered by plan when planParam is set.
      // Chains off planUserIdsPromise so the partner-independent queries below
      // run concurrently with the subscription lookup.
      planUserIdsPromise.then(ids =>
        prisma.walletTransaction.groupBy({
          by: ['type'],
          where: ids !== undefined
            ? { ...walletWhereBase, wallet: { userId: { in: ids } } }
            : walletWhereBase,
          _sum: { amount: true },
          _count: { id: true },
        }),
      ),
      // Invoice totals: cashback + margin + turnover
      prisma.partnerCashbackPayment.aggregate({
        where: invoiceWhere,
        _sum: { totalCashbackOwed: true, marginAmount: true, turnoverAmount: true },
        _count: { id: true },
      }),
      // Per-partner detail rows for the breakdown table
      prisma.partnerCashbackPayment.findMany({
        where: invoiceWhere,
        include: { partner: { select: { id: true, businessName: true, city: true } } },
        orderBy: [{ totalCashbackOwed: 'desc' }],
      }),
      // Lifecycle status of each reporting period that overlaps the range
      months.length > 0
        ? prisma.reportingPeriod.findMany({
            where: { month: { in: months } },
            select: { month: true, status: true },
          })
        : Promise.resolve([]),
      // Raw scans for subscription-plan breakdown (spec §6.4 "абонатен план" dimension)
      // createdAt is included so we can resolve the plan the user had AT scan time (not today's plan).
      prisma.stickerScan.findMany({
        where: {
          status: ScanStatus.APPROVED,
          createdAt: { gte: from, lte: to },
          ...(partnerIdParam ? { venue: { partnerId: partnerIdParam } } : {}),
        },
        select: { userId: true, cashbackAmount: true, verifiedAmount: true, billAmount: true, createdAt: true },
      }),
      // Per-period invoice status counts (unfiltered by invoiceStatus so INVOICED periods
      // still correctly show pending/overdue counts regardless of the active status filter).
      months.length > 0
        ? prisma.partnerCashbackPayment.groupBy({
            by: ['month', 'status'],
            where: {
              month: { in: months },
              ...(partnerIdParam ? { partnerId: partnerIdParam } : {}),
            },
            _count: { id: true },
          })
        : Promise.resolve([]),
      // Payout breakdown by status — spec §6.4 "плащания" dimension
      planUserIdsPromise.then(ids =>
        prisma.walletTransaction.groupBy({
          by: ['status'],
          where: ids !== undefined
            ? { ...payoutBreakdownWhereBase, wallet: { userId: { in: ids } } }
            : payoutBreakdownWhereBase,
          _sum: { amount: true },
          _count: { id: true },
        }),
      ),
    ]);

    // Wallet tx map: always include core types so the UI can show 0 placeholders.
    // Stored amounts are BGN-denominated — convert to EUR before returning
    // (BC-QA-031 — EUR-only responses).
    const CORE_WALLET_TYPES = ['CASHBACK_CREDIT', 'WITHDRAWAL', 'TOP_UP'] as const;
    const txByType: Record<string, Record<string, any>> = {};
    for (const t of CORE_WALLET_TYPES) {
      txByType[t] = { total: 0, count: 0 };
    }
    for (const row of walletStats) {
      const val = row._sum.amount ?? 0;
      txByType[row.type] = { total: bgnToEur(val), count: row._count.id };
    }

    // Aggregate per-partner breakdown.
    // contractedRate: show the value when all invoices for the partner share the same rate;
    // set to null when rates differ across invoices so the UI can display "varies" instead of a
    // misleading single number.
    type PartnerAccum = {
      partnerId: string;
      partnerName: string;
      partnerCity: string | null;
      cashback: number;
      margin: number;
      turnover: number;
      contractedRate: number | null;
      ratesVary: boolean;
      _seenRates: Set<number | null>;
      invoiceCount: number;
      statuses: Record<string, number>;
    };
    const partnerMap = new Map<string, PartnerAccum>();
    for (const inv of partnerInvoices) {
      const cur: PartnerAccum = partnerMap.get(inv.partnerId) ?? {
        partnerId: inv.partnerId,
        partnerName: inv.partner.businessName,
        partnerCity: inv.partner.city,
        cashback: 0,
        margin: 0,
        turnover: 0,
        contractedRate: inv.contractedRate,
        ratesVary: false,
        _seenRates: new Set(),
        invoiceCount: 0,
        statuses: {},
      };
      cur.cashback += inv.totalCashbackOwed;
      cur.margin += inv.marginAmount;
      cur.turnover += inv.turnoverAmount;
      cur.invoiceCount += 1;
      cur.statuses[inv.status] = (cur.statuses[inv.status] ?? 0) + 1;
      cur._seenRates.add(inv.contractedRate);
      // ratesVary is true only when invoices genuinely disagree on rate (size > 1 means at least two
      // distinct values, e.g. {null, 5} or {3, 7}).  All-null invoices produce {null} (size 1) and
      // should NOT trigger a "varies" label — the rate is uniformly absent, not mixed.
      if (cur._seenRates.size > 1) { cur.contractedRate = null; cur.ratesVary = true; }
      partnerMap.set(inv.partnerId, cur);
    }

    // Plan breakdown: resolve each scan's user → the subscription active AT scan time.
    // Fetching all subscriptions per user (ascending) lets us find the latest one created
    // before or at the scan timestamp — correct even when a user changed plans mid-period.
    const scanUserIds = [...new Set(scansInRange.map(s => s.userId))];
    const allUserSubs = scanUserIds.length > 0
      ? await prisma.subscription.findMany({
          where: { userId: { in: scanUserIds } },
          select: { userId: true, plan: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const subsByUser = new Map<string, Array<{ plan: string; createdAt: Date }>>();
    for (const sub of allUserSubs) {
      const arr = subsByUser.get(sub.userId) ?? [];
      arr.push({ plan: sub.plan as string, createdAt: sub.createdAt });
      subsByUser.set(sub.userId, arr);
    }
    const getPlanAtTime = (userId: string, at: Date): string => {
      const subs = subsByUser.get(userId) ?? [];
      let plan = 'UNKNOWN';
      for (const s of subs) {
        if (s.createdAt <= at) plan = s.plan;
      }
      return plan;
    };

    const planAccum: Record<string, { scanCount: number; cashback: number; turnover: number }> = {};
    for (const scan of scansInRange) {
      const plan = getPlanAtTime(scan.userId, scan.createdAt);
      if (planParam && plan !== planParam) continue; // plan filter
      const cur = planAccum[plan] ?? { scanCount: 0, cashback: 0, turnover: 0 };
      cur.scanCount += 1;
      cur.cashback += scan.cashbackAmount;
      cur.turnover += scan.verifiedAmount ?? scan.billAmount ?? 0;
      planAccum[plan] = cur;
    }
    // cashback/turnover accumulators are BGN-denominated — convert to EUR
    // before returning (BC-QA-031 — EUR-only responses).
    const planBreakdown = Object.entries(planAccum)
      .map(([plan, { scanCount, cashback, turnover }]) => ({
        plan,
        scanCount,
        cashback: bgnToEur(cashback),
        turnover: bgnToEur(turnover),
      }))
      .sort((a, b) => b.cashback - a.cashback);

    // Merge period rows with the full months list so the frontend always receives an entry for
    // every month in range — status is null for months that have no ReportingPeriod record yet.
    const periodStatusMap = new Map(periodRows.map(p => [p.month, p.status]));

    // Build per-period counts of PENDING and OVERDUE invoices so the frontend can warn
    // when an INVOICED period still has unpaid partner obligations.
    type PeriodInvoiceCounts = { pendingCount: number; overdueCount: number };
    const periodCountMap = new Map<string, PeriodInvoiceCounts>();
    for (const row of periodInvoiceStatusCounts) {
      const cur = periodCountMap.get(row.month) ?? { pendingCount: 0, overdueCount: 0 };
      if (row.status === 'PENDING') cur.pendingCount += row._count.id;
      if (row.status === 'OVERDUE') cur.overdueCount += row._count.id;
      periodCountMap.set(row.month, cur);
    }

    const allPeriodStatuses = months.map(m => ({
      month: m,
      status: periodStatusMap.get(m) ?? null,
      pendingCount: periodCountMap.get(m)?.pendingCount ?? 0,
      overdueCount: periodCountMap.get(m)?.overdueCount ?? 0,
    }));

    // Strip internal accumulator field before sending. cashback/margin/turnover
    // are BGN-denominated — convert to EUR before returning (BC-QA-031 —
    // EUR-only responses).
    const partnerBreakdown = Array.from(partnerMap.values()).map(
      ({ _seenRates: _ignored, cashback, margin, turnover, ...rest }) => ({
        ...rest,
        cashback: bgnToEur(cashback),
        margin: bgnToEur(margin),
        turnover: bgnToEur(turnover),
      }),
    );

    // Build payout-by-status breakdown.  Always include the canonical statuses with 0 placeholders
    // so the UI shows a stable row layout even when no payouts exist for that status in the period.
    // Totals are BGN-denominated — convert to EUR before returning.
    const PAYOUT_STATUSES_DISPLAY = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RISK_HOLD'] as const;
    const payoutByStatus: Record<string, Record<string, any>> = {};
    for (const s of PAYOUT_STATUSES_DISPLAY) {
      payoutByStatus[s] = { total: 0, count: 0 };
    }
    for (const row of payoutStatusStats) {
      const val = row._sum.amount ?? 0;
      payoutByStatus[row.status] = { total: bgnToEur(val), count: row._count.id };
    }
    const payoutTotal = Object.values(payoutByStatus).reduce((s, v) => s + (v.total ?? 0), 0);
    const payoutCount = Object.values(payoutByStatus).reduce((s, v) => s + v.count, 0);

    // Compute aggregate invoice totals for the cashbackInvoices section (BGN → EUR).
    const invoiceTotalBgn = invoiceTotals._sum.totalCashbackOwed ?? 0;
    const marginTotalBgn = invoiceTotals._sum.marginAmount ?? 0;
    const turnoverTotalBgn = invoiceTotals._sum.turnoverAmount ?? 0;

    res.json({
      success: true,
      data: {
        period: { from: from.toISOString(), to: to.toISOString() },
        walletTransactions: txByType,
        cashbackInvoices: {
          total: bgnToEur(invoiceTotalBgn),
          marginTotal: bgnToEur(marginTotalBgn),
          turnoverTotal: bgnToEur(turnoverTotalBgn),
          count: invoiceTotals._count.id,
        },
        partnerBreakdown,
        periodStatuses: allPeriodStatuses,
        planBreakdown,
        payoutBreakdown: {
          byStatus: payoutByStatus,
          total: payoutTotal,
          count: payoutCount,
          filtered: !!payoutStatusParam,
        },
      },
    });
  })
);

/**
 * GET /api/admin/finance/report-partners
 * Returns a lightweight list of partners that have at least one invoice,
 * used to populate the partner filter dropdown on the reports page.
 */
router.get(
  '/report-partners',
  requirePermission('finance.reports.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const partners = await prisma.partner.findMany({
      where: {
        OR: [
          { cashbackPayments: { some: {} } },
          { venues: { some: { stickerScans: { some: { status: ScanStatus.APPROVED } } } } },
        ],
      },
      select: { id: true, businessName: true },
      orderBy: { businessName: 'asc' },
    });
    res.json({ success: true, data: partners });
  })
);

/**
 * GET /api/admin/finance/payout-thresholds
 * Returns the current minimum payout threshold per subscription plan (EUR).
 * Used by the payouts page to show admins the threshold that applied to each payout.
 */
import { getPayoutThresholdBGN } from '../utils/payoutThreshold';

router.get(
  '/payout-thresholds',
  requirePermission('finance.payouts.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const [light, basic, premium] = await Promise.all([
      getPayoutThresholdBGN('PREMIUM_WEEKLY'),
      getPayoutThresholdBGN('BASIC'),
      getPayoutThresholdBGN('PREMIUM_MONTHLY' as any),
    ]);
    // N1 (spec §3.7) — the spec-canonical plan key set is `BASIC, PREMIUM_WEEKLY,
    // PREMIUM`. The SubscriptionPlan enum stores the third plan as `PREMIUM_MONTHLY`;
    // we read the threshold by the enum key but emit it under the spec key `PREMIUM`
    // so the response shape matches §3.7 and the sibling cashback endpoint exactly.
    // `PREMIUM_MONTHLY` is retained as a backward-compat alias (additive — no key
    // removed) because some enum-native callers reference it.
    // getPayoutThresholdBGN() returns BGN-denominated thresholds — convert to EUR
    // before returning (BC-QA-031 — EUR-only responses).
    res.json({
      success: true,
      data: {
        BASIC: bgnToEur(basic),
        PREMIUM_WEEKLY: bgnToEur(light),
        PREMIUM: bgnToEur(premium),
        // Backward-compat alias for enum-native consumers (spec key is PREMIUM).
        PREMIUM_MONTHLY: bgnToEur(premium),
      },
    });
  })
);

/* ─── Reporting Period lifecycle (spec 6.3) ───────────────────────────────── */

/** Resolve a set of nullable user IDs to a display name map (email fallback). */
async function resolveAdminNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(users.map(u => [
    u.id,
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
  ]));
}

/**
 * GET /api/admin/finance/reporting-periods
 * Lists all ReportingPeriod rows, optional year filter.
 * lockedBy / reviewedBy / invoicedBy are resolved to admin display names.
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

    const nameMap = await resolveAdminNames([
      ...periods.map(p => p.openedBy),
      ...periods.map(p => p.reviewedBy),
      ...periods.map(p => p.lockedBy),
      ...periods.map(p => p.invoicedBy),
    ]);

    const data = periods.map(p => ({
      ...p,
      openedByName:   p.openedBy   ? (nameMap.get(p.openedBy)   ?? p.openedBy)   : null,
      reviewedByName: p.reviewedBy ? (nameMap.get(p.reviewedBy) ?? p.reviewedBy) : null,
      lockedByName:   p.lockedBy   ? (nameMap.get(p.lockedBy)   ?? p.lockedBy)   : null,
      invoicedByName: p.invoicedBy ? (nameMap.get(p.invoicedBy) ?? p.invoicedBy) : null,
    }));

    res.json({ success: true, data });
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
      create: { month, status: 'OPEN', openedAt: new Date(), openedBy: req.user!.id, notes: notes ?? null },
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

    const now = new Date();
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'FOR_REVIEW') {
      updateData.reviewedAt = now;
      updateData.reviewedBy = req.user!.id;
    }
    if (newStatus === 'LOCKED') {
      updateData.lockedAt = now;
      updateData.lockedBy = req.user!.id;
    }
    if (newStatus === 'INVOICED') {
      updateData.invoicedAt = now;
      updateData.invoicedBy = req.user!.id;
    }

    const updated = await prisma.reportingPeriod.update({
      where: { month },
      data: updateData,
    });

    // Enrich with resolved admin names so the response is consistent with the GET endpoint.
    const nameMap = await resolveAdminNames([updated.openedBy, updated.reviewedBy, updated.lockedBy, updated.invoicedBy]);
    const enriched = {
      ...updated,
      openedByName:   updated.openedBy   ? (nameMap.get(updated.openedBy)   ?? updated.openedBy)   : null,
      reviewedByName: updated.reviewedBy ? (nameMap.get(updated.reviewedBy) ?? updated.reviewedBy) : null,
      lockedByName:   updated.lockedBy   ? (nameMap.get(updated.lockedBy)   ?? updated.lockedBy)   : null,
      invoicedByName: updated.invoicedBy ? (nameMap.get(updated.invoicedBy) ?? updated.invoicedBy) : null,
    };

    res.json({ success: true, data: enriched });
  })
);

/**
 * DELETE /api/admin/finance/reporting-periods/:month
 * Removes an erroneously created period. Blocked when status is LOCKED or INVOICED.
 */
router.delete(
  '/reporting-periods/:month',
  requirePermission('finance.periods.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { month } = req.params;

    const period = await prisma.reportingPeriod.findUnique({ where: { month } });
    if (!period) return res.status(404).json({ success: false, error: 'Reporting period not found' });

    if (period.status === 'LOCKED' || period.status === 'INVOICED') {
      return res.status(409).json({
        success: false,
        error: `Cannot delete a ${period.status} period — data integrity must be preserved.`,
      });
    }

    // Guard: refuse deletion when invoices already exist for the month.
    // Deleting the period record would orphan those invoices (they'd appear
    // as "no record" months in reports). Admin must delete invoices first or
    // advance the period to LOCKED/INVOICED to protect the data.
    const invoiceCount = await prisma.partnerCashbackPayment.count({ where: { month } });
    if (invoiceCount > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete period ${month} — ${invoiceCount} invoice(s) already exist for this month. Delete the invoices first, or advance the period to LOCKED/INVOICED to protect the data.`,
      });
    }

    // Guard: refuse deletion when APPROVED scans exist for the month that haven't
    // been invoiced yet. Deleting the period would orphan those scans from the
    // billing lifecycle and they would silently reappear as "Без запис".
    const [monthYear, monthMon] = month.split('-').map(Number);
    const monthStart = new Date(monthYear, monthMon - 1, 1);
    const monthEnd   = new Date(monthYear, monthMon, 1);
    const unbilledScanCount = await prisma.stickerScan.count({
      where: { status: ScanStatus.APPROVED, createdAt: { gte: monthStart, lt: monthEnd } },
    });
    if (unbilledScanCount > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete period ${month} — ${unbilledScanCount} approved scan(s) have not been invoiced yet. Generate invoices first, or they will be lost from billing lifecycle.`,
      });
    }

    await prisma.reportingPeriod.delete({ where: { month } });
    res.json({ success: true, message: `Period ${month} deleted.` });
  })
);

/**
 * PATCH /api/admin/finance/reporting-periods/:month/notes
 * Updates the notes field on a ReportingPeriod. Allowed at any lifecycle stage.
 * Body: { notes: string }
 */
router.patch(
  '/reporting-periods/:month/notes',
  requirePermission('finance.periods.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { month } = req.params;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    const period = await prisma.reportingPeriod.findUnique({ where: { month } });
    if (!period) return res.status(404).json({ success: false, error: 'Reporting period not found' });

    const updated = await prisma.reportingPeriod.update({
      where: { month },
      data: { notes: notes || null },
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

    if (!['invoices', 'periods', 'reports', 'payouts', 'cashback-summary'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be invoices, periods, reports, payouts, or cashback-summary' });
    }
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ success: false, error: 'format must be csv or xlsx' });
    }

    let rows: Record<string, unknown>[] = [];

    if (type === 'invoices') {
      const VALID_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
      const expPartnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId.trim() : '';
      const where: Parameters<typeof prisma.partnerCashbackPayment.findMany>[0]['where'] = {};
      // Priority: month (exact) > from/to range (month-list) > year prefix > no filter.
      if (month) {
        where.month = month;
      } else if (fromParam && toParam) {
        // Build months list from YYYY-MM-DD range params (same logic as /reports endpoint).
        const invFromYM = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam.slice(0, 7) : fromParam.slice(0, 7);
        const invToYM   = /^\d{4}-\d{2}-\d{2}$/.test(toParam)   ? toParam.slice(0, 7)   : toParam.slice(0, 7);
        const [invFromY, invFromM] = invFromYM.split('-').map(Number);
        const [invToY, invToM]     = invToYM.split('-').map(Number);
        const invMonths: string[] = [];
        const invCursor = new Date(Date.UTC(invFromY, invFromM - 1, 1));
        const invToMonthStart = new Date(Date.UTC(invToY, invToM - 1, 1));
        while (invCursor <= invToMonthStart) {
          invMonths.push(`${invCursor.getUTCFullYear()}-${String(invCursor.getUTCMonth() + 1).padStart(2, '0')}`);
          invCursor.setUTCMonth(invCursor.getUTCMonth() + 1);
        }
        if (invMonths.length > 0) where.month = { in: invMonths };
      } else if (year) {
        where.month = { startsWith: year };
      }
      if (exportStatus && (VALID_STATUSES as readonly string[]).includes(exportStatus)) {
        where.status = exportStatus as (typeof VALID_STATUSES)[number];
      }
      if (expPartnerId) where.partnerId = expPartnerId;
      if (search) where.partner = { businessName: { contains: search, mode: 'insensitive' } };

      const invoices = await prisma.partnerCashbackPayment.findMany({
        where,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        include: { partner: { select: { businessName: true, city: true } } },
      });

      // Resolve paidBy UUIDs → admin display names for accounting readability.
      const invoiceNameMap = await resolveAdminNames(invoices.map(i => i.paidBy));

      // Stored amounts are BGN-denominated — convert to EUR before export
      // (BC-QA-031 — EUR-only responses).
      rows = invoices.map(i => ({
        invoiceNumber: i.invoiceNumber ?? '',
        id: i.id,
        partner: i.partner.businessName,
        city: i.partner.city ?? '',
        month: i.month,
        turnoverAmount: bgnToEur(i.turnoverAmount),
        contractedRate: i.contractedRate ?? '',
        totalCashbackOwed: bgnToEur(i.totalCashbackOwed),
        marginAmount: bgnToEur(i.marginAmount),
        obligation: bgnToEur(Math.round((i.totalCashbackOwed + i.marginAmount) * 100) / 100),
        status: i.status,
        paidAt: i.paidAt?.toISOString() ?? '',
        paidBy: i.paidBy ? (invoiceNameMap.get(i.paidBy) ?? i.paidBy) : '',
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

      // Resolve admin UUIDs → display names for human-readable export.
      const expNameMap = await resolveAdminNames([
        ...periods.map(p => p.openedBy),
        ...periods.map(p => p.reviewedBy),
        ...periods.map(p => p.lockedBy),
        ...periods.map(p => p.invoicedBy),
      ]);
      const resolveName = (id: string | null) =>
        id ? (expNameMap.get(id) ?? id) : '';

      // Stored amounts are BGN-denominated — convert to EUR before export
      // (BC-QA-031 — EUR-only responses).
      rows = periods.map(p => {
        const fin = finByMonth.get(p.month);
        return {
          month: p.month,
          status: p.status,
          partners: fin?.count ?? 0,
          cashback: bgnToEur(fin?.cashback ?? 0),
          margin: bgnToEur(fin?.margin ?? 0),
          total: bgnToEur(fin?.total ?? 0),
          paid: fin?.paid ?? 0,
          pending: fin?.pending ?? 0,
          overdue: fin?.overdue ?? 0,
          openedAt: p.openedAt?.toISOString() ?? '',
          openedBy: resolveName(p.openedBy),
          reviewedAt: p.reviewedAt?.toISOString() ?? '',
          reviewedBy: resolveName(p.reviewedBy),
          lockedAt: p.lockedAt?.toISOString() ?? '',
          lockedBy: resolveName(p.lockedBy),
          invoicedAt: p.invoicedAt?.toISOString() ?? '',
          invoicedBy: resolveName(p.invoicedBy),
          notes: p.notes ?? '',
        };
      });

    } else if (type === 'reports') {
      // Aggregate report export — covers all spec §6.4 dimensions:
      // period, partner, subscription plan, cashback, margin, invoices, payments
      const now = new Date();
      const from = fromParam
        ? (/^\d{4}-\d{2}-\d{2}$/.test(fromParam)
            ? new Date(fromParam + 'T00:00:00.000+02:00')
            : new Date(fromParam))
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = toParam
        ? (/^\d{4}-\d{2}-\d{2}$/.test(toParam)
            ? new Date(toParam + 'T23:59:59.999+02:00')
            : new Date(toParam))
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date range' });
      }
      if (from > to) {
        return res.status(400).json({ success: false, error: 'from date must be before or equal to to date' });
      }

      // Derive months in range for invoice filter — extract from original param strings to avoid
      // the same UTC-month shift that affects the /reports endpoint (see comment there).
      const expFromYM = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
        ? fromParam.slice(0, 7)
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const expToYM = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)
        ? toParam.slice(0, 7)
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [expFromY, expFromM] = expFromYM.split('-').map(Number);
      const [expToY, expToM] = expToYM.split('-').map(Number);
      const expMonths: string[] = [];
      const expCursor = new Date(Date.UTC(expFromY, expFromM - 1, 1));
      const expToMonthStart = new Date(Date.UTC(expToY, expToM - 1, 1));
      while (expCursor <= expToMonthStart) {
        expMonths.push(`${expCursor.getUTCFullYear()}-${String(expCursor.getUTCMonth() + 1).padStart(2, '0')}`);
        expCursor.setUTCMonth(expCursor.getUTCMonth() + 1);
      }

      // Partner, status, and plan filters — mirror the reports endpoint so exports match what you see
      const expPartnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId.trim() : '';
      const expInvoiceStatus = typeof req.query.invoiceStatus === 'string' ? req.query.invoiceStatus.trim() : '';
      const expPlanFilter = typeof req.query.plan === 'string' ? req.query.plan.trim() : '';
      const expPayoutStatus = typeof req.query.payoutStatus === 'string' ? req.query.payoutStatus.trim() : '';
      const EXP_VALID_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
      if (expPayoutStatus && !(VALID_PAYOUT_STATUSES as readonly string[]).includes(expPayoutStatus)) {
        return res.status(400).json({ success: false, error: `payoutStatus must be one of: ${VALID_PAYOUT_STATUSES.join(', ')}` });
      }
      if (expPlanFilter && !(VALID_PLANS as readonly string[]).includes(expPlanFilter)) {
        return res.status(400).json({ success: false, error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
      }
      const expInvoiceWhere: Parameters<typeof prisma.partnerCashbackPayment.findMany>[0]['where'] = {
        month: { in: expMonths },
      };
      if (expPartnerId) expInvoiceWhere.partnerId = expPartnerId;
      if (expInvoiceStatus && (EXP_VALID_STATUSES as readonly string[]).includes(expInvoiceStatus)) {
        expInvoiceWhere.status = expInvoiceStatus as (typeof EXP_VALID_STATUSES)[number];
      }

      // Plan filter narrows wallet/payout queries to users currently on that plan
      // (mirrors the /reports endpoint planUserIds path at lines ~515-545).
      // Kicked off as a promise so the partner-independent invoice/scan queries below
      // run concurrently with it; the wallet/payout queries chain off it via .then().
      // UNKNOWN is treated as "no subscribers" since it isn't a real Prisma enum value.
      const expPlanUserIdsPromise: Promise<string[] | undefined> =
        expPlanFilter === 'UNKNOWN'
          ? Promise.resolve([])
          : expPlanFilter
            ? prisma.subscription
                .findMany({
                  where: { plan: expPlanFilter as any },
                  select: { userId: true },
                  distinct: ['userId'],
                })
                .then(subs => subs.map(s => s.userId))
            : Promise.resolve(undefined);

      const expPayoutBreakdownWhereBase: Prisma.WalletTransactionWhereInput = {
        type: 'WITHDRAWAL',
        createdAt: { gte: from, lte: to },
      };
      if (expPayoutStatus) {
        expPayoutBreakdownWhereBase.status = expPayoutStatus as Prisma.WalletTransactionWhereInput['status'];
      }
      // Wallet stats — plan filter mirrors the /reports endpoint walletWhere at line ~525.
      const expWalletWhereBase: Prisma.WalletTransactionWhereInput = {
        createdAt: { gte: from, lte: to },
        status: 'COMPLETED',
      };
      const [walletStats, invoiceRows, expScans, expPayoutByStatus] = await Promise.all([
        expPlanUserIdsPromise.then(ids =>
          prisma.walletTransaction.groupBy({
            by: ['type'],
            where: ids !== undefined
              ? { ...expWalletWhereBase, wallet: { userId: { in: ids } } }
              : expWalletWhereBase,
            _sum: { amount: true },
            _count: { id: true },
          }),
        ),
        // Invoice rows with partner name and all financial columns
        prisma.partnerCashbackPayment.findMany({
          where: expInvoiceWhere,
          include: { partner: { select: { businessName: true } } },
          orderBy: [{ month: 'asc' }, { totalCashbackOwed: 'desc' }],
        }),
        // Scans for plan-dimension breakdown; createdAt needed for scan-time plan attribution.
        prisma.stickerScan.findMany({
          where: {
            status: ScanStatus.APPROVED,
            createdAt: { gte: from, lte: to },
            ...(expPartnerId ? { venue: { partnerId: expPartnerId } } : {}),
          },
          select: { userId: true, cashbackAmount: true, verifiedAmount: true, billAmount: true, createdAt: true },
        }),
        // Payout-by-status breakdown — spec §6.4 "плащания" dimension
        expPlanUserIdsPromise.then(ids =>
          prisma.walletTransaction.groupBy({
            by: ['status'],
            where: ids !== undefined
              ? { ...expPayoutBreakdownWhereBase, wallet: { userId: { in: ids } } }
              : expPayoutBreakdownWhereBase,
            _sum: { amount: true },
            _count: { id: true },
          }),
        ),
      ]);

      // Resolve scan userId → the subscription active AT scan time (not today's plan).
      const expScanUserIds = [...new Set(expScans.map(s => s.userId))];
      const expAllUserSubs = expScanUserIds.length > 0
        ? await prisma.subscription.findMany({
            where: { userId: { in: expScanUserIds } },
            select: { userId: true, plan: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : [];
      const expSubsByUser = new Map<string, Array<{ plan: string; createdAt: Date }>>();
      for (const sub of expAllUserSubs) {
        const arr = expSubsByUser.get(sub.userId) ?? [];
        arr.push({ plan: sub.plan as string, createdAt: sub.createdAt });
        expSubsByUser.set(sub.userId, arr);
      }
      const getExpPlanAtTime = (userId: string, at: Date): string => {
        const subs = expSubsByUser.get(userId) ?? [];
        let plan = 'UNKNOWN';
        for (const s of subs) {
          if (s.createdAt <= at) plan = s.plan;
        }
        return plan;
      };

      // Aggregate scans by plan, applying optional plan filter
      const expPlanAccum: Record<string, { scanCount: number; cashback: number; turnover: number }> = {};
      for (const scan of expScans) {
        const plan = getExpPlanAtTime(scan.userId, scan.createdAt);
        if (expPlanFilter && plan !== expPlanFilter) continue;
        const cur = expPlanAccum[plan] ?? { scanCount: 0, cashback: 0, turnover: 0 };
        cur.scanCount += 1;
        cur.cashback += scan.cashbackAmount;
        cur.turnover += scan.verifiedAmount ?? scan.billAmount ?? 0;
        expPlanAccum[plan] = cur;
      }

      // Section 1 — invoice rows: one row per partner-month (period + partner + cashback + margin + invoice status)
      const INVOICE_STATUS_BG: Record<string, string> = { PENDING: 'Чакащ', PAID: 'Платен', OVERDUE: 'Просрочен' };
      // Stored amounts are BGN-denominated — convert to EUR before export
      // (BC-QA-031 — EUR-only responses).
      const invoiceSection = invoiceRows.map(i => ({
        section: 'Фактура',
        period: i.month,
        partnerName: i.partner.businessName,
        partnerId: i.partnerId,
        plan: '',
        scanCount: '',
        cashback: bgnToEur(i.totalCashbackOwed),
        margin: bgnToEur(i.marginAmount),
        turnover: bgnToEur(i.turnoverAmount),
        invoiceStatus: INVOICE_STATUS_BG[i.status] ?? i.status,
        walletType: '',
        walletTotal: '',
        walletCount: '',
      }));

      // Section 2 — plan breakdown rows: one row per subscription plan (plan + cashback + turnover)
      const PLAN_LABELS_BG: Record<string, string> = {
        PREMIUM_WEEKLY: 'Premium Weekly', BASIC: 'Basic', PREMIUM: 'Premium Monthly', PREMIUM_MONTHLY: 'Premium Monthly', UNKNOWN: 'Без абонамент',
      };
      const planSection = Object.entries(expPlanAccum)
        .sort((a, b) => b[1].cashback - a[1].cashback)
        .map(([plan, stats]) => ({
          section: 'Разбивка по план',
          period: '',
          partnerName: '',
          partnerId: '',
          plan: PLAN_LABELS_BG[plan] ?? plan,
          scanCount: stats.scanCount,
          cashback: bgnToEur(stats.cashback),
          margin: '',
          turnover: bgnToEur(stats.turnover),
          invoiceStatus: '',
          walletType: '',
          walletTotal: '',
          walletCount: '',
        }));

      // Section 3 — wallet summary rows: one row per transaction type (payments dimension).
      // Wallet stats are subscriber-side; partner filter is intentionally not applied here.
      // When plan is set, the stats reflect users currently on that plan (mirrors /reports
      // walletWhere at line ~525).
      const WALLET_TYPE_BG: Record<string, string> = {
        CASHBACK_CREDIT: 'Кешбек кредит', WITHDRAWAL: 'Плащане към абонат', TOP_UP: 'Зареждане',
      };
      const EXP_PLAN_LABELS: Record<string, string> = { PREMIUM_WEEKLY: 'Premium Weekly', BASIC: 'Basic', PREMIUM: 'Premium Monthly', PREMIUM_MONTHLY: 'Premium Monthly', UNKNOWN: 'Без абонамент' };
      // Wallet stats are subscriber-side, so the partnerId filter does not apply here.
      // Lead the parenthetical with the plan scope (always shown when any filter is active
      // so the partner-only branch isn't ambiguous), then append the partner caveat as
      // an em-dash-separated explanation.
      const walletPlanLabel = expPlanFilter
        ? `план: ${EXP_PLAN_LABELS[expPlanFilter] ?? expPlanFilter}`
        : 'всички планове';
      const walletPartnerNote = expPartnerId ? 'партньорският филтър не се прилага' : '';
      let walletSectionLabel = 'Портфейл';
      if (expPlanFilter || expPartnerId) {
        walletSectionLabel = walletPartnerNote
          ? `Портфейл (${walletPlanLabel} — ${walletPartnerNote})`
          : `Портфейл (${walletPlanLabel})`;
      }
      const walletSection = walletStats.map(w => ({
        section: walletSectionLabel,
        period: '',
        partnerName: '',
        partnerId: '',
        plan: '',
        scanCount: '',
        cashback: '',
        margin: '',
        turnover: '',
        invoiceStatus: '',
        walletType: WALLET_TYPE_BG[w.type] ?? w.type,
        walletTotal: bgnToEur(w._sum.amount ?? 0),
        walletCount: w._count.id,
      }));

      // Section 4 — payout-by-status rows: WITHDRAWAL transactions grouped by payout status
      // (spec §6.4 "плащания" dimension)
      const PAYOUT_STATUS_BG_REPORT: Record<string, string> = {
        PENDING: 'Чака', PROCESSING: 'Обработва се', COMPLETED: 'Платено',
        FAILED: 'Неуспешно', RISK_HOLD: 'Задържано (риск)', CANCELLED: 'Отменено',
        ANNULLED: 'Анулирано', TRIAL_PENDING: 'Изчакване (пробен)',
      };
      const payoutFilterParts: string[] = [];
      if (expPayoutStatus) payoutFilterParts.push(`статус: ${PAYOUT_STATUS_BG_REPORT[expPayoutStatus] ?? expPayoutStatus}`);
      if (expPlanFilter) payoutFilterParts.push(`план: ${EXP_PLAN_LABELS[expPlanFilter] ?? expPlanFilter}`);
      const payoutSectionLabel = payoutFilterParts.length > 0
        ? `Плащания по статус (филтър: ${payoutFilterParts.join(', ')})`
        : 'Плащания по статус';
      const payoutSection = expPayoutByStatus.map(p => ({
        section: payoutSectionLabel,
        period: '',
        partnerName: '',
        partnerId: '',
        plan: '',
        scanCount: '',
        cashback: '',
        margin: '',
        turnover: '',
        invoiceStatus: '',
        walletType: PAYOUT_STATUS_BG_REPORT[p.status] ?? p.status,
        walletTotal: bgnToEur(Math.abs(p._sum.amount ?? 0)),
        walletCount: p._count.id,
      }));

      rows = [...invoiceSection, ...planSection, ...walletSection, ...payoutSection];

    } else if (type === 'payouts') {
      // Payout export — spec §6.4 "плащания" dimension: all WITHDRAWAL transactions
      const expFrom = fromParam
        ? (/^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? new Date(fromParam + 'T00:00:00.000+02:00') : new Date(fromParam))
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const expTo = toParam
        ? (/^\d{4}-\d{2}-\d{2}$/.test(toParam) ? new Date(toParam + 'T23:59:59.999+02:00') : new Date(toParam))
        : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

      // Plan filter — mirrors the /reports endpoint planUserIdsPromise logic so the
      // export matches what the payout breakdown table shows when a plan filter is active.
      const payoutPlanParam = typeof req.query.plan === 'string' ? req.query.plan.trim() : '';
      if (payoutPlanParam && !(VALID_PLANS as readonly string[]).includes(payoutPlanParam)) {
        return res.status(400).json({ success: false, error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
      }
      let payoutPlanUserIds: string[] | undefined;
      if (payoutPlanParam === 'UNKNOWN') {
        // UNKNOWN means "no active subscription" — no real userId set maps to this.
        payoutPlanUserIds = [];
      } else if (payoutPlanParam) {
        const planSubs = await prisma.subscription.findMany({
          where: { plan: payoutPlanParam as any },
          select: { userId: true },
          distinct: ['userId'],
        });
        payoutPlanUserIds = planSubs.map(s => s.userId);
      }

      const payoutsExp = await prisma.walletTransaction.findMany({
        where: {
          type: 'WITHDRAWAL',
          createdAt: { gte: expFrom, lte: expTo },
          ...(exportStatus ? { status: exportStatus as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'RISK_HOLD' | 'ANNULLED' | 'TRIAL_PENDING' } : {}),
          ...(payoutPlanUserIds !== undefined ? { wallet: { userId: { in: payoutPlanUserIds } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, amount: true, currency: true, status: true,
          description: true, createdAt: true, metadata: true,
          wallet: {
            select: {
              payoutIban: true, payoutBeneficiaryName: true,
              user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
        },
      });

      const PAYOUT_STATUS_BG: Record<string, string> = {
        PENDING: 'Чака', RISK_HOLD: 'Задържано (риск)', PROCESSING: 'Обработва се',
        COMPLETED: 'Платено', FAILED: 'Неуспешно', CANCELLED: 'Отменено',
        ANNULLED: 'Анулирано', TRIAL_PENDING: 'Изчакване (пробен)',
      };

      const parseCompletedAt = (meta: string | null): string => {
        if (!meta) return '';
        try {
          const parsed = JSON.parse(meta) as Record<string, unknown>;
          return typeof parsed.completedAt === 'string' ? parsed.completedAt : '';
        } catch { return ''; }
      };

      // Stored amount is denominated in the payout row's own currency — convert
      // to EUR before export (BC-QA-031 — EUR-only responses), keyed on the row
      // rather than assumed BGN (BC-QA-031-FOLLOWUP-1 impl-r1 F3): the CSV's
      // `currency` column must state the unit its `amount` column is actually
      // in, which a hardcoded 'EUR' beside an unconditional `bgnToEur` cannot
      // guarantee once the write guard admits EUR on this column.
      rows = payoutsExp.map(p => ({
        id: p.id,
        subscriberName: [p.wallet.user.firstName, p.wallet.user.lastName].filter(Boolean).join(' ') || '',
        email: p.wallet.user.email,
        phone: p.wallet.user.phone ?? '',
        iban: p.wallet.payoutIban ?? '',
        beneficiaryName: p.wallet.payoutBeneficiaryName ?? '',
        amount: toEur(Math.abs(p.amount), p.currency),
        currency: displayCurrency(p.currency),
        status: PAYOUT_STATUS_BG[p.status] ?? p.status,
        description: p.description ?? '',
        requestedAt: p.createdAt.toISOString(),
        completedAt: parseCompletedAt(p.metadata),
      }));

    } else if (type === 'cashback-summary') {
      const VALID_CB_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
      const cbStatus = exportStatus && (VALID_CB_STATUSES as readonly string[]).includes(exportStatus)
        ? exportStatus as 'PENDING' | 'PAID' | 'OVERDUE'
        : undefined;
      const summary = await adminCashbackService.getSummary({ month: month || undefined, status: cbStatus });

      const CB_STATUS_BG: Record<string, string> = {
        PENDING: 'Изчакващо',
        PAID: 'Платено',
        OVERDUE: 'Просрочено',
      };

      // totalOwed is BGN-denominated — convert to EUR before export
      // (BC-QA-031 — EUR-only responses).
      rows = summary.map(s => ({
        partnerId: s.partnerId,
        partnerName: s.partnerName,
        partnerEmail: s.partnerEmail ?? '',
        month: s.month,
        receiptCount: s.receiptCount,
        totalOwed: bgnToEur(s.totalOwed),
        paymentStatus: CB_STATUS_BG[s.paymentStatus] ?? s.paymentStatus,
        paidAt: s.paidAt ?? '',
        notes: s.notes ?? '',
      }));
    }

    const filename = `boomcard_${type}_${new Date().toISOString().slice(0, 10)}`;

    // Always use the canonical column order, regardless of row shape.
    // Object.keys(rows[0]) would give wrong results for the 'reports' type
    // because wallet rows and cashback rows have different keys — the first
    // row alone does not represent the full schema.
    const HEADERS: Record<string, string[]> = {
      invoices:          ['invoiceNumber', 'id', 'partner', 'city', 'month', 'turnoverAmount', 'contractedRate', 'totalCashbackOwed', 'marginAmount', 'obligation', 'status', 'paidAt', 'paidBy', 'notes', 'createdAt'],
      periods:           ['month', 'status', 'partners', 'cashback', 'margin', 'total', 'paid', 'pending', 'overdue', 'openedAt', 'openedBy', 'reviewedAt', 'reviewedBy', 'lockedAt', 'lockedBy', 'invoicedAt', 'invoicedBy', 'notes'],
      reports:           ['section', 'period', 'partnerName', 'partnerId', 'plan', 'scanCount', 'cashback', 'margin', 'turnover', 'invoiceStatus', 'walletType', 'walletTotal', 'walletCount'],
      payouts:           ['id', 'subscriberName', 'email', 'phone', 'iban', 'beneficiaryName', 'amount', 'currency', 'status', 'description', 'requestedAt', 'completedAt'],
      'cashback-summary': ['partnerId', 'partnerName', 'partnerEmail', 'month', 'receiptCount', 'totalOwed', 'paymentStatus', 'paidAt', 'notes'],
    };
    // Bulgarian column header labels for all export types (accounting-friendly)
    const INVOICES_DISPLAY_HEADERS: Record<string, string> = {
      invoiceNumber: 'Номер на фактура',
      id: 'ID',
      partner: 'Партньор',
      city: 'Град',
      month: 'Месец',
      turnoverAmount: 'Оборот (€)',
      contractedRate: 'Договорена ставка (%)',
      totalCashbackOwed: 'Кешбек (€)',
      marginAmount: 'Марджин (€)',
      obligation: 'Задължение общо (€)',
      status: 'Статус',
      paidAt: 'Платено на',
      paidBy: 'Платено от',
      notes: 'Бележки',
      createdAt: 'Дата на създаване',
    };
    const PERIODS_DISPLAY_HEADERS: Record<string, string> = {
      month: 'Месец',
      status: 'Статус',
      partners: 'Партньори',
      cashback: 'Кешбек (€)',
      margin: 'Марджин (€)',
      total: 'Общо задължение (€)',
      paid: 'Платено',
      pending: 'Чакащи',
      overdue: 'Просрочени',
      openedAt: 'Дата на отваряне',
      openedBy: 'Отворено от',
      reviewedAt: 'Дата за преглед',
      reviewedBy: 'Прегледано от',
      lockedAt: 'Дата на заключване',
      lockedBy: 'Заключено от',
      invoicedAt: 'Дата на фактуриране',
      invoicedBy: 'Фактурирано от',
      notes: 'Бележки',
    };
    const REPORTS_DISPLAY_HEADERS: Record<string, string> = {
      section: 'Секция',
      period: 'Период',
      partnerName: 'Партньор',
      partnerId: 'ID на партньор',
      plan: 'Абонатен план',
      scanCount: 'Брой сканирания',
      cashback: 'Кешбек (€)',
      margin: 'Марджин (€)',
      turnover: 'Оборот (€)',
      invoiceStatus: 'Статус на фактура',
      walletType: 'Тип транзакция',
      walletTotal: 'Общо портфейл (€)',
      walletCount: 'Брой транзакции',
    };
    const PAYOUTS_DISPLAY_HEADERS: Record<string, string> = {
      id: 'ID',
      subscriberName: 'Абонат',
      email: 'Имейл',
      phone: 'Телефон',
      iban: 'IBAN',
      beneficiaryName: 'Получател',
      // No `(€)` in the header (BC-QA-031-FOLLOWUP-1 task-r1 F5): the adjacent
      // "Валута" column now states each row's OWN currency via
      // `displayCurrency(p.currency)`, so a legacy row can legitimately export a
      // USD magnitude here. A euro-denominated header over that figure is the
      // same amount/label disagreement this task removes everywhere else — and
      // a CSV is the artifact most likely to be read outside the app, where the
      // currency column is the only thing disambiguating it.
      amount: 'Сума',
      currency: 'Валута',
      status: 'Статус',
      description: 'Бележка',
      requestedAt: 'Дата на заявка',
      completedAt: 'Платено на',
    };
    const CASHBACK_SUMMARY_DISPLAY_HEADERS: Record<string, string> = {
      partnerId:     'ID на партньор',
      partnerName:   'Партньор',
      partnerEmail:  'Имейл',
      month:         'Месец',
      receiptCount:  'Брой сканирания',
      totalOwed:     'Дължимо (€)',
      paymentStatus: 'Статус',
      paidAt:        'Платено на',
      notes:         'Бележки',
    };
    const DISPLAY_HEADERS_MAP: Record<string, Record<string, string>> = {
      invoices:          INVOICES_DISPLAY_HEADERS,
      periods:           PERIODS_DISPLAY_HEADERS,
      reports:           REPORTS_DISPLAY_HEADERS,
      payouts:           PAYOUTS_DISPLAY_HEADERS,
      'cashback-summary': CASHBACK_SUMMARY_DISPLAY_HEADERS,
    };

    const fieldKeys = HEADERS[type] ?? [];
    const labelMap = DISPLAY_HEADERS_MAP[type] ?? {};
    const displayHeaders = fieldKeys.map(k => labelMap[k] ?? k);

    if (format === 'csv') {
      // RFC-4180 quoting + spreadsheet formula-injection neutralization.
      // Partner-controlled values (businessName, notes, \u2026) flow into these cells
      // verbatim, so we must (1) wrap every cell in double quotes and double any
      // internal quote, and (2) prefix a leading =/+/-/@/tab/CR with a single quote
      // so Excel/Sheets treats it as text rather than a formula.
      const csvCell = (value: unknown): string => {
        let s = value === null || value === undefined ? '' : String(value);
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return `"${s.replace(/"/g, '""')}"`;
      };
      const csvLines = [
        displayHeaders.map(csvCell).join(','),
        ...rows.map(r => fieldKeys.map(h => csvCell(r[h])).join(',')),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      // RFC-4180 records are CRLF-delimited.
      return res.send('\uFEFF' + csvLines.join('\r\n'));
    }

    // xlsx — rename columns to Bulgarian display headers then write sheet
    const wsRows = rows.map(r => {
      const out: Record<string, unknown> = {};
      fieldKeys.forEach((k, i) => { out[displayHeaders[i]] = r[k] ?? ''; });
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(wsRows, { header: displayHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buf);
  })
);

export default router;
