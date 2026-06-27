/**
 * Admin Cashback Routes
 *
 * GET  /api/admin/cashback/summary                   — monthly per-partner cashback totals
 * GET  /api/admin/cashback/stats                     — dashboard stat cards
 * GET  /api/admin/cashback/subscriber/:userId        — per-entry cashback for a subscriber (spec §4.4)
 * GET    /api/admin/cashback/rates                          — full cashback rate history
 * GET    /api/admin/cashback/rates/current                  — currently effective rate per step
 * POST   /api/admin/cashback/rates                          — create new versioned rate set
 * DELETE /api/admin/cashback/rates/snapshot/:iso            — cancel a future-scheduled snapshot
 * POST /api/admin/cashback/:partnerId/:month/mark-paid — mark a partner month as paid
 * POST /api/admin/cashback/:partnerId/remind         — send email reminder to partner
 * GET  /api/admin/cashback/:partnerId/:month/receipts — receipts for reconciliation
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import {
  adminCashbackService, getSubscriberCashbackEntries, getAllCashbackEntries,
  exportCashbackEntriesCsv,
  CashbackEntryStatus, approveEntry, lockEntry, expireEntry, payEntry, voidEntry, backfillCashbackExpiry,
} from '../services/adminCashback.service';
import { getPayoutThresholdBGN } from '../utils/payoutThreshold';
import { isCurrencyTransitionWindowOpen, toDualCurrency } from '../utils/currencyDisplay';
import { parsePagination } from '../utils/pagination';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

// All routes require admin auth
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

// ------------------------------------------------------------------
// GET /api/admin/cashback/stats
// Dashboard stat cards: pending total, paid this month, overdue count
// ------------------------------------------------------------------
router.get('/stats', requirePermission('cashback.read'), async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await adminCashbackService.getDashboardStats();
    const windowOpen = await isCurrencyTransitionWindowOpen();

    // M1 FIX: Gate all BGN monetary fields through toDualCurrency so raw BGN is nulled when window is closed.
    // Spec §8.1 rule 4 / Clash 12.1: when window CLOSED, NO raw BGN scalar may leave the API.
    const gatedStats = {
      totalAccrued: toDualCurrency(stats.totalAccrued, windowOpen),
      totalCleared: toDualCurrency(stats.totalCleared, windowOpen),
      totalPending: toDualCurrency(stats.totalPending, windowOpen),
      expiringTotal: toDualCurrency(stats.expiringTotal, windowOpen),
      totalLocked: toDualCurrency(stats.totalLocked, windowOpen),
      totalPaid: toDualCurrency(stats.totalPaid, windowOpen),
      totalExpired: toDualCurrency(stats.totalExpired, windowOpen),
      totalVoided: toDualCurrency(stats.totalVoided, windowOpen),
    };

    res.json({ success: true, data: gatedStats });
  } catch (error: any) {
    logger.error('Failed to fetch cashback stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cashback stats' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/summary?month=YYYY-MM&status=PENDING|PAID|OVERDUE
// Monthly per-partner cashback summary
// ------------------------------------------------------------------
router.get('/summary', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string | undefined;
    const status = req.query.status as string | undefined;

    if (month !== undefined && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });
    }

    const VALID_STATUSES = ['PENDING', 'PAID', 'OVERDUE'] as const;
    if (status !== undefined && !(VALID_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const summary = await adminCashbackService.getSummary({
      month,
      status: status as 'PENDING' | 'PAID' | 'OVERDUE' | undefined,
    });

    const windowOpen = await isCurrencyTransitionWindowOpen();

    // M1 FIX: Gate totalOwed (raw BGN) through toDualCurrency so it's nulled when window is closed.
    // Spec §8.1 rule 4 / Clash 12.1: when window CLOSED, NO raw BGN scalar may leave the API.
    const gatedSummary = summary.map(entry => ({
      ...entry,
      totalOwed: toDualCurrency(entry.totalOwed, windowOpen),
    }));

    res.json({ success: true, data: gatedSummary });
  } catch (error: any) {
    logger.error('Failed to fetch cashback summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cashback summary' });
  }
});

// ------------------------------------------------------------------
// POST /api/admin/cashback/:partnerId/:month/mark-paid
// body: { notes?: string }
// ------------------------------------------------------------------
router.post('/:partnerId/:month/mark-paid', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId, month } = req.params;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });
    }

    await adminCashbackService.markPaid({
      partnerId,
      month,
      adminUserId: req.user!.id,
      notes: req.body.notes,
    });

    res.json({ success: true, message: `Cashback for ${month} marked as paid` });
  } catch (error: any) {
    logger.error('Failed to mark cashback as paid:', error);
    // markPaid throws AppError (409 period-locked, 400 already-paid) for guard
    // rejections — surface those statuses/messages instead of a blanket 500.
    const status =
      typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    res.status(status).json({
      success: false,
      error: status === 500 ? 'Failed to mark cashback as paid' : error.message,
    });
  }
});

// ------------------------------------------------------------------
// POST /api/admin/cashback/:partnerId/remind
// body: { month?: string }
// ------------------------------------------------------------------
router.post('/:partnerId/remind', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.params;
    const month = req.body.month as string | undefined;

    const result = await adminCashbackService.sendReminder(partnerId, month);

    if (!result.sent) {
      return res.status(400).json({ success: false, error: result.reason || 'Could not send reminder' });
    }

    res.json({ success: true, message: 'Reminder sent successfully' });
  } catch (error: any) {
    logger.error('Failed to send cashback reminder:', error);
    res.status(500).json({ success: false, error: 'Failed to send reminder' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/rates
// Full history of all cashback rate rows, newest first.
// ------------------------------------------------------------------
router.get('/rates', requirePermission('cashback.read'), async (_req: AuthRequest, res: Response) => {
  try {
    const rates = await adminCashbackService.getCashbackRates();
    res.json({ success: true, data: rates });
  } catch (error: any) {
    logger.error('Failed to fetch cashback rates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cashback rates' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/rates/current
// Currently effective rate for each discount step (one row per step).
// ------------------------------------------------------------------
router.get('/rates/current', requirePermission('cashback.read'), async (_req: AuthRequest, res: Response) => {
  try {
    const rates = await adminCashbackService.getCurrentRates();
    res.json({ success: true, data: rates });
  } catch (error: any) {
    logger.error('Failed to fetch current cashback rates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch current cashback rates' });
  }
});

// ------------------------------------------------------------------
// POST /api/admin/cashback/rates
// Create a new versioned rate set.
// body: { rates: [{ discountStep, basic, premium }], effectiveFrom?, notes? }
// ------------------------------------------------------------------
router.post('/rates', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    const { rates, effectiveFrom, notes } = req.body;

    if (!Array.isArray(rates) || rates.length === 0) {
      return res.status(400).json({ success: false, error: 'rates must be a non-empty array' });
    }

    const parsedEffectiveFrom = effectiveFrom ? new Date(effectiveFrom) : undefined;
    if (parsedEffectiveFrom && isNaN(parsedEffectiveFrom.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid effectiveFrom date' });
    }

    await adminCashbackService.createCashbackRates({
      rates,
      effectiveFrom: parsedEffectiveFrom,
      adminUserId: req.user!.id,
      notes,
    });

    req.auditAction = 'cashback.rates.create';
    req.auditObjectType = 'cashback';
    res.status(201).json({ success: true, message: 'Cashback rates created' });
  } catch (error: any) {
    logger.error('Failed to create cashback rates:', error);
    // The service tags client-input validation failures as AppError with an explicit
    // statusCode (typically 400). Honour that status directly rather than pattern-matching
    // the message text — the previous substring whitelist missed several validation
    // messages (e.g. "cashback cannot exceed the partner discount") and mis-returned 500.
    const status =
      typeof error?.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to create cashback rates' });
  }
});

// ------------------------------------------------------------------
// DELETE /api/admin/cashback/rates/snapshot/:iso
// Cancels a future-scheduled rate snapshot by its effectiveFrom timestamp.
// Returns 409 if the snapshot is already past/current (active rates cannot be deleted).
//
// DEFECT C FIX: Robust timestamp matching. The stored effectiveFrom may have
// millisecond precision; the client's ISO string (e.g., from GET /rates) may
// truncate or reformat. Match within a 1-second tolerance window to avoid
// confusing 404 when a snapshot exists but doesn't match exactly.
// ------------------------------------------------------------------
router.delete('/rates/snapshot/:iso', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    const targetDate = new Date(req.params.iso);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid ISO date in path' });
    }

    const now = new Date();
    if (targetDate <= now) {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete a past or currently active snapshot — only future-scheduled snapshots may be cancelled',
      });
    }

    // Match any snapshot within ±500ms of targetDate (1-second tolerance window).
    // This accommodates client-side ISO round-trip artifacts while remaining strict
    // enough to catch accidental mismatches. If multiple snapshots exist within the
    // window (highly unlikely), delete all of them atomically (all or nothing).
    const windowStart = new Date(targetDate.getTime() - 500);
    const windowEnd = new Date(targetDate.getTime() + 500);

    const { count } = await prisma.cashbackRate.deleteMany({
      where: { effectiveFrom: { gte: windowStart, lte: windowEnd } },
    });

    if (count === 0) {
      return res.status(404).json({ success: false, error: 'No snapshot found within 1 second of this timestamp' });
    }

    logger.info(`Admin ${req.user!.id} cancelled future snapshot ${targetDate.toISOString()} (${count} rows deleted)`);
    req.auditAction = 'cashback.rate.delete';
    req.auditObjectType = 'cashback';
    res.json({ success: true, message: `Cancelled future snapshot — ${count} rate rows removed` });
  } catch (error: any) {
    logger.error('Failed to delete snapshot:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete snapshot' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/payout-thresholds
// Returns per-plan payout thresholds from DB; falls back to constants.
// Spec §3.7 + §8.1 rule 4 — dual-currency display gated by transition window.
// ------------------------------------------------------------------
router.get('/payout-thresholds', requirePermission('cashback.read'), async (_req: AuthRequest, res: Response) => {
  try {
    // 'cashback.read' permission is seeded in services/permission.service.ts (SUPPORT/FINANCE/RISK_REVIEW roles)
    // M1 (spec §3.7) — the spec-canonical plan key set is `BASIC, PREMIUM_WEEKLY,
    // PREMIUM`. The SubscriptionPlan enum stores the third plan as `PREMIUM_MONTHLY`;
    // we read the threshold by the enum key but emit it under the spec key `PREMIUM`
    // so the response shape matches §3.7 exactly. `PREMIUM_MONTHLY` is retained as a
    // backward-compat alias (additive — no key removed) because some enum-native
    // callers reference it; the spec-canonical surface is `BASIC/PREMIUM_WEEKLY/PREMIUM`.
    const [basic, premiumWeekly, premiumMonthly] = await Promise.all([
      getPayoutThresholdBGN('BASIC'),
      getPayoutThresholdBGN('PREMIUM_WEEKLY'),
      getPayoutThresholdBGN('PREMIUM_MONTHLY'),
    ]);
    // Spec §3.7 + §8.1 rule 4 — dual-currency display for payout thresholds
    // (stored BGN). Raw BGN values gated by window state.
    const windowOpen = await isCurrencyTransitionWindowOpen();
    res.json({
      success: true,
      data: {
        ...(windowOpen && { BASIC: basic }),
        ...(windowOpen && { PREMIUM_WEEKLY: premiumWeekly }),
        ...(windowOpen && { PREMIUM: premiumMonthly }),
        // Backward-compat alias for enum-native consumers (spec key is PREMIUM).
        ...(windowOpen && { PREMIUM_MONTHLY: premiumMonthly }),
      },
      display: {
        BASIC: toDualCurrency(basic, windowOpen),
        PREMIUM_WEEKLY: toDualCurrency(premiumWeekly, windowOpen),
        PREMIUM: toDualCurrency(premiumMonthly, windowOpen),
        // Backward-compat alias for enum-native consumers (spec key is PREMIUM).
        PREMIUM_MONTHLY: toDualCurrency(premiumMonthly, windowOpen),
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch payout thresholds:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payout thresholds' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/entries/export
// Spec §3.4 — Export cashback entries as CSV. Must be registered BEFORE /entries
// so Express does not try to match "export" as an :id param.
// Query params: ?status=, ?dateFrom=, ?dateTo= (same as /entries filter)
// Caps at 10,000 rows. Returns CSV with Content-Disposition: attachment.
// ------------------------------------------------------------------
router.get('/entries/export', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const validStatuses: CashbackEntryStatus[] = ['Pending', 'TrialPending', 'Cleared', 'Locked', 'Paid', 'Expired', 'Voided'];
    const statusFilter = status && (validStatuses as string[]).includes(status)
      ? (status as CashbackEntryStatus)
      : undefined;

    const dateFrom = typeof req.query.dateFrom === 'string' && req.query.dateFrom
      ? new Date(req.query.dateFrom)
      : undefined;
    const dateTo = typeof req.query.dateTo === 'string' && req.query.dateTo
      ? new Date(req.query.dateTo + 'T23:59:59.999Z')
      : undefined;

    const VALID_RISK_LEVELS = ['Low', 'Medium', 'High'] as const;
    type RiskLevelFilter = typeof VALID_RISK_LEVELS[number];
    const riskLevelParam = typeof req.query.riskLevel === 'string' ? req.query.riskLevel : undefined;
    const riskLevelFilter = riskLevelParam && (VALID_RISK_LEVELS as readonly string[]).includes(riskLevelParam)
      ? (riskLevelParam as RiskLevelFilter)
      : undefined;

    const { data } = await getAllCashbackEntries(1, 10000, statusFilter, undefined, dateFrom, dateTo, riskLevelFilter);
    const csv = exportCashbackEntriesCsv(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cashback-export.csv"');
    res.send(csv);
  } catch (error: any) {
    logger.error('Failed to export cashback entries:', error);
    res.status(500).json({ success: false, error: 'Failed to export cashback entries' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/entries
// Spec §4.4 — global per-entry cashback listing with all 7 states
// (Pending / TrialPending / Cleared / Locked / Paid / Expired / Voided). Filter by ?status=...
// Optional: ?search=, ?dateFrom=, ?dateTo=, ?riskLevel=Low|Medium|High for server-side filtering.
// ------------------------------------------------------------------
router.get('/entries', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 10000 });
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const validStatuses: CashbackEntryStatus[] = ['Pending', 'TrialPending', 'Cleared', 'Locked', 'Paid', 'Expired', 'Voided'];
    const statusFilter = status && (validStatuses as string[]).includes(status)
      ? (status as CashbackEntryStatus)
      : undefined;

    const search = typeof req.query.search === 'string' && req.query.search.trim()
      ? req.query.search.trim()
      : undefined;

    const dateFrom = typeof req.query.dateFrom === 'string' && req.query.dateFrom
      ? new Date(req.query.dateFrom)
      : undefined;
    const dateTo = typeof req.query.dateTo === 'string' && req.query.dateTo
      ? new Date(req.query.dateTo + 'T23:59:59.999Z')
      : undefined;

    // L2: Optional riskLevel filter — translates to a user riskScore range on the
    // joined wallet.user (same bands as the subscribers listing: Low≤20, 20<Medium≤50, High>50).
    const VALID_RISK_LEVELS = ['Low', 'Medium', 'High'] as const;
    type RiskLevelFilter = typeof VALID_RISK_LEVELS[number];
    const riskLevelParam = typeof req.query.riskLevel === 'string' ? req.query.riskLevel : undefined;
    const riskLevelFilter = riskLevelParam && (VALID_RISK_LEVELS as readonly string[]).includes(riskLevelParam)
      ? (riskLevelParam as RiskLevelFilter)
      : undefined;

    const result = await getAllCashbackEntries(page, limit, statusFilter, search, dateFrom, dateTo, riskLevelFilter);
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Failed to fetch cashback entries:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cashback entries' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/subscriber/:userId
// Entry-based cashback entries for a specific subscriber (spec §4.4).
// Also accessible at GET /api/admin/subscribers/:userId/cashback (spec §4 navigation).
// ------------------------------------------------------------------
router.get('/subscriber/:userId', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const result = await getSubscriberCashbackEntries(userId, page, limit);
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return res.status(404).json({ success: false, error: error.message });
    }
    logger.error('Failed to fetch subscriber cashback entries:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscriber cashback entries' });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/:partnerId/:month/receipts
// Returns all APPROVED receipts for reconciliation of a partner-month payment.
// ------------------------------------------------------------------
router.get('/:partnerId/:month/receipts', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId, month } = req.params;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });
    }

    const result = await adminCashbackService.getReceiptsByPartnerMonth({ partnerId, month });
    const windowOpen = await isCurrencyTransitionWindowOpen();

    // M1 FIX: Gate cashback amounts (raw BGN) through toDualCurrency so they're nulled when window is closed.
    // Spec §8.1 rule 4 / Clash 12.1: when window CLOSED, NO raw BGN scalar may leave the API.
    const gatedResult = {
      ...result,
      receipts: result.receipts.map(r => ({
        ...r,
        cashbackAmount: toDualCurrency(r.cashbackAmount, windowOpen),
      })),
      totalCashbackOwed: toDualCurrency(result.totalCashbackOwed, windowOpen),
    };

    res.json({ success: true, data: gatedResult });
  } catch (error: any) {
    logger.error('Failed to fetch partner receipts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch partner receipts' });
  }
});

// ------------------------------------------------------------------
// POST /api/admin/cashback/entries/:id/approve   — Pending → Cleared
// POST /api/admin/cashback/entries/:id/lock      — Cleared → Locked
// POST /api/admin/cashback/entries/:id/expire    — any active → Expired
// ------------------------------------------------------------------
router.post('/entries/:id/approve', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    await approveEntry(req.params.id, req.user!.id);
    // approveEntry writes its own CASHBACK_CLEARED audit row with before/after diff;
    // skip the middleware row to avoid duplicate, less-informative entries.
    req.skipAudit = true;
    res.json({ success: true, message: 'Entry approved' });
  } catch (error: any) {
    const status = error.statusCode ?? 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// M1 / Spec §3.4: Locked status "cannot be manually changed" — Locked is only
// entered via the automated payout pipeline, not arbitrary admin action. This
// endpoint is for the payout system (internal/system use) and should NOT appear
// in normal admin UI. Restricted to SUPER_ADMIN to prevent accidental locking
// by regular admins outside the payout pipeline context.
router.post('/entries/:id/lock', (req: AuthRequest, res: Response, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Only SUPER_ADMIN may manually lock a cashback entry (automated payout pipeline use only — spec §3.4)' });
  }
  next();
}, async (req: AuthRequest, res: Response) => {
  try {
    await lockEntry(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Entry locked' });
  } catch (error: any) {
    const status = error.statusCode ?? 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/entries/:id/expire', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    // L3 — Pending→Expired requires an explicit admin override (spec §8.1 / §3.4).
    const allowPendingOverride = req.body?.adminOverride === true;
    await expireEntry(req.params.id, req.user!.id, { allowPendingOverride });
    res.json({ success: true, message: 'Entry expired' });
  } catch (error: any) {
    const status = error.statusCode ?? 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/admin/cashback/entries/:id/pay  — Locked → Paid (spec §4.4)
router.post('/entries/:id/pay', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    await payEntry(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Entry marked as paid' });
  } catch (error: any) {
    const status = error.statusCode ?? 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST /api/admin/cashback/entries/:id/void  — any active state → Voided (spec §4.4 v1.1)
// body: { reason: string, forceVoidLocked?: boolean }
// The entry stays visible to the user as "Анулиран" with the reason; balance is
// adjusted by cashbackLifecycleService.markVoided when the entry was Cleared/Locked.
// skipAudit=true: cashbackLifecycleService.markVoided writes its own AuditLog row
// with full before/after diff. Middleware would log a second, less-informative row.
//
// M2 / Spec §3.4 + §1.3: Locked → Voided (force-void) is an emergency operational
// path not in the base spec (spec state machine only allows Locked → Paid). It is
// restricted to SUPER_ADMIN to prevent accidental destruction of in-flight payouts.
router.post('/entries/:id/void', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ success: false, error: 'reason is required to void a cashback entry' });
    }

    // M2: Before delegating to voidEntry, check if the target entry is LOCKED.
    // If so, only SUPER_ADMIN may proceed — Locked→Voided is an emergency operational
    // path (spec state machine allows Locked→Paid only; Locked→Voided is a controlled
    // exception for stuck/fraudulent locked payouts, not routine admin action).
    if (req.user?.role !== 'SUPER_ADMIN') {
      const targetEntry = await prisma.walletTransaction.findUnique({
        where: { id: req.params.id },
        select: { cashbackStatus: true },
      });
      if (targetEntry?.cashbackStatus === 'LOCKED') {
        return res.status(403).json({
          success: false,
          error: 'Only SUPER_ADMIN may void a LOCKED cashback entry (emergency path — spec §3.4)',
        });
      }
    }

    await voidEntry(req.params.id, req.user!.id, reason);
    req.skipAudit = true;
    res.json({ success: true, message: 'Entry voided' });
  } catch (error: any) {
    const status = error.statusCode ?? 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ------------------------------------------------------------------
// POST /api/admin/cashback/backfill-expiry
// One-time backfill: set cashbackExpiresAt for legacy entries with null.
// ------------------------------------------------------------------
router.post('/backfill-expiry', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
  try {
    const count = await backfillCashbackExpiry();
    req.auditAction = 'cashback.backfill-expiry';
    req.auditObjectType = 'cashback';
    res.json({ success: true, message: `Backfilled ${count} entries` });
  } catch (error: any) {
    logger.error('Backfill failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
