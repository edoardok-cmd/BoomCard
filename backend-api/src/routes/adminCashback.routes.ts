/**
 * Admin Cashback Routes
 *
 * GET  /api/admin/cashback/summary                   — monthly per-partner cashback totals
 * GET  /api/admin/cashback/stats                     — dashboard stat cards
 * GET  /api/admin/cashback/subscriber/:userId        — per-entry cashback for a subscriber (spec §4.4)
 * GET  /api/admin/cashback/rates                     — full cashback rate history
 * GET  /api/admin/cashback/rates/current             — currently effective rate per step
 * POST /api/admin/cashback/rates                     — create new versioned rate set
 * POST /api/admin/cashback/:partnerId/:month/mark-paid — mark a partner month as paid
 * POST /api/admin/cashback/:partnerId/remind         — send email reminder to partner
 * GET  /api/admin/cashback/:partnerId/:month/receipts — receipts for reconciliation
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { adminCashbackService } from '../services/adminCashback.service';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

// All routes require admin auth
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

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
// GET /api/admin/cashback/subscriber/:userId
// Entry-based cashback entries for a specific subscriber with per-entry status
// and expiry countdown. Required by spec §4.4 (rolling 60-day expiry per entry).
// ------------------------------------------------------------------
router.get('/subscriber/:userId', requirePermission('cashback.read'), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Subscriber wallet not found' });
    }

    const [entries, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id, type: 'CASHBACK_CREDIT' },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          status: true,
          cashbackExpiresAt: true,
          description: true,
          createdAt: true,
          receiptId: true,
          receipt: {
            select: {
              id: true,
              totalAmount: true,
              merchantName: true,
            },
          },
        },
      }),
      prisma.walletTransaction.count({ where: { walletId: wallet.id, type: 'CASHBACK_CREDIT' } }),
    ]);

    const now = new Date();

    const result = entries.map((e) => {
      let entryStatus: 'Pending' | 'Cleared' | 'Locked' | 'Expired';
      if (e.status === 'PENDING' || e.status === 'TRIAL_PENDING' || e.status === 'PROCESSING') {
        entryStatus = 'Pending';
      } else if (e.status === 'CANCELLED') {
        // The nightly expiry job marks entries CANCELLED once cashbackExpiresAt passes.
        // Trial voids also use CANCELLED but do so before the natural expiry date.
        entryStatus = e.cashbackExpiresAt && e.cashbackExpiresAt <= now ? 'Expired' : 'Locked';
      } else if (e.status === 'ANNULLED' || e.status === 'FAILED') {
        entryStatus = 'Locked';
      } else if (e.cashbackExpiresAt && e.cashbackExpiresAt <= now) {
        // COMPLETED but the window has since closed (scheduler hasn't run yet)
        entryStatus = 'Expired';
      } else {
        entryStatus = 'Cleared';
      }

      const daysUntilExpiry = e.cashbackExpiresAt
        ? Math.max(0, Math.ceil((e.cashbackExpiresAt.getTime() - now.getTime()) / 86_400_000))
        : null;

      return {
        id: e.id,
        amount: e.amount,
        status: entryStatus,
        rawStatus: e.status,
        cashbackExpiresAt: e.cashbackExpiresAt,
        daysUntilExpiry,
        description: e.description,
        createdAt: e.createdAt,
        receipt: e.receipt ?? null,
      };
    });

    res.json({ success: true, data: result, total, page, limit });
  } catch (error: any) {
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

export default router;
