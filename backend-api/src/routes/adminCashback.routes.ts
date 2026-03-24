/**
 * Admin Cashback Routes
 *
 * GET  /api/admin/cashback/summary        — monthly per-partner cashback totals
 * GET  /api/admin/cashback/stats          — dashboard stat cards
 * POST /api/admin/cashback/:id/:month/mark-paid  — mark a partner month as paid
 * POST /api/admin/cashback/:id/remind     — send email reminder to partner
 */

import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { adminCashbackService } from '../services/adminCashback.service';
import { logger } from '../utils/logger';

const router = Router();

// All routes require admin auth
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

// ------------------------------------------------------------------
// GET /api/admin/cashback/stats
// Dashboard stat cards: pending total, paid this month, overdue count
// ------------------------------------------------------------------
router.get('/stats', async (_req: AuthRequest, res: Response) => {
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
router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month as string | undefined;
    const status = req.query.status as 'PENDING' | 'PAID' | 'OVERDUE' | undefined;
    const summary = await adminCashbackService.getSummary({ month, status });
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
router.post('/:partnerId/:month/mark-paid', async (req: AuthRequest, res: Response) => {
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
router.post('/:partnerId/remind', async (req: AuthRequest, res: Response) => {
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

export default router;
