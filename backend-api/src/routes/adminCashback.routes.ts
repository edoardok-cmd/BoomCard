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
  CashbackEntryStatus, approveEntry, lockEntry, expireEntry, payEntry, backfillCashbackExpiry,
} from '../services/adminCashback.service';
import {
  PAYOUT_THRESHOLD_BASIC_EUR,
  PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR,
  PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR,
  EUR_TO_BGN_RATE,
} from '../constants/receipt.constants';
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
    res.json({ success: true, data: stats });
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
    res.json({ success: true, data: summary });
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
    res.status(500).json({ success: false, error: 'Failed to mark cashback as paid' });
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
    // Service throws validation errors with recognisable messages; treat them all as 400
    const isValidationError = error.message && (
      error.message.includes('Invalid') ||
      error.message.includes('Duplicate') ||
      error.message.includes('Missing discount steps') ||
      error.message.includes('must all be numbers') ||
      error.message.includes('must be between')
    );
    res.status(isValidationError ? 400 : 500).json({ success: false, error: error.message || 'Failed to create cashback rates' });
  }
});

// ------------------------------------------------------------------
// DELETE /api/admin/cashback/rates/snapshot/:iso
// Cancels a future-scheduled rate snapshot by its effectiveFrom timestamp.
// Returns 409 if the snapshot is already past/current (active rates cannot be deleted).
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

    const { count } = await prisma.cashbackRate.deleteMany({
      where: { effectiveFrom: targetDate },
    });

    if (count === 0) {
      return res.status(404).json({ success: false, error: 'No snapshot found for this date' });
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
// ------------------------------------------------------------------
router.get('/payout-thresholds', requirePermission('cashback.read'), async (_req: AuthRequest, res: Response) => {
  const fallback = {
    BASIC:   Math.round(PAYOUT_THRESHOLD_BASIC_EUR * EUR_TO_BGN_RATE * 100) / 100,
    LIGHT:   Math.round(PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR * EUR_TO_BGN_RATE * 100) / 100,
    PREMIUM: Math.round(PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR * EUR_TO_BGN_RATE * 100) / 100,
  };
  try {
    const plans = ['BASIC', 'LIGHT', 'PREMIUM'] as const;
    const rows = await Promise.all(
      plans.map((plan) =>
        prisma.payoutThreshold.findFirst({ where: { plan }, orderBy: { createdAt: 'desc' } })
      )
    );
    const data: Record<string, number> = { ...fallback };
    for (let i = 0; i < plans.length; i++) {
      const row = rows[i];
      if (row) data[plans[i]] = row.minAmount;
    }
    res.json({ success: true, data });
  } catch {
    res.json({ success: true, data: fallback });
  }
});

// ------------------------------------------------------------------
// GET /api/admin/cashback/entries
// Spec §4.4 — global per-entry cashback listing with all 5 states
// (Pending / Cleared / Locked / Paid / Expired). Filter by ?status=...
// Optional: ?search=, ?dateFrom=, ?dateTo= for server-side filtering.
// ------------------------------------------------------------------
router.get('/entries', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 10000);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const validStatuses: CashbackEntryStatus[] = ['Pending', 'Cleared', 'Locked', 'Paid', 'Expired'];
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

    const result = await getAllCashbackEntries(page, limit, statusFilter, search, dateFrom, dateTo);
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
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);

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
    res.json({ success: true, data: result });
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
    res.json({ success: true, message: 'Entry approved' });
  } catch (error: any) {
    const status = error.statusCode ?? 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/entries/:id/lock', requirePermission('cashback.write'), async (req: AuthRequest, res: Response) => {
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
    await expireEntry(req.params.id, req.user!.id);
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
