/**
 * Admin Control Routes
 *
 * GET /api/admin/control/security    — security-focused AuditLog viewer
 * GET /api/admin/control/disputes    — receipts in MANUAL_REVIEW status
 * POST /api/admin/control/disputes/:id/approve — approve a disputed receipt
 * POST /api/admin/control/disputes/:id/reject  — reject a disputed receipt
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import { receiptService } from '../services/receipt.service';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

/* ─── Security Audit Log ─────────────────────────────────────────────────── */

const SECURITY_ACTION_PREFIXES = [
  'admin.',
  'auth.',
  'permission.',
  'role.',
  'user.delete',
  'user.suspend',
  'user.ban',
  'partner.approve',
  'partner.reject',
  'partner.suspend',
];

/**
 * GET /api/admin/control/security
 * Query: page, limit, action, actorId, from, to
 */
router.get(
  '/security',
  requirePermission('admins.audit.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const actorId = typeof req.query.actorId === 'string' ? req.query.actorId.trim() : '';
    const fromParam = req.query.from as string;
    const toParam = req.query.to as string;

    const where: Parameters<typeof prisma.auditLog.findMany>[0]['where'] = {};

    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    } else {
      // Default: show only security-relevant actions
      where.OR = SECURITY_ACTION_PREFIXES.map((prefix) => ({
        action: { startsWith: prefix },
      }));
    }

    if (actorId) where.actorUserId = actorId;
    if (fromParam) {
      const d = new Date(fromParam);
      if (!isNaN(d.getTime())) where.createdAt = { ...((where.createdAt as object) ?? {}), gte: d };
    }
    if (toParam) {
      const d = new Date(toParam);
      if (!isNaN(d.getTime())) where.createdAt = { ...((where.createdAt as object) ?? {}), lte: d };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/* ─── Disputes (Manual Review Receipts) ──────────────────────────────────── */

/**
 * GET /api/admin/control/disputes
 * Query: page, limit, status (MANUAL_REVIEW|PROCESSING), venueId
 */
router.get(
  '/disputes',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'MANUAL_REVIEW';
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId.trim() : '';

    const where: Parameters<typeof prisma.receipt.findMany>[0]['where'] = {
      status: status as never,
    };
    if (venueId) where.venueId = venueId;

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      prisma.receipt.count({ where }),
    ]);

    res.json({
      success: true,
      data: receipts,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/control/disputes/:id/approve
 * Body: { verifiedAmount?: number; notes?: string }
 * Approves a manual-review receipt via receiptService.reviewReceipt(), which
 * calculates cashback, credits the user's wallet, records reviewedBy, and
 * rolls back on failure. Do NOT bypass this with a raw Prisma update.
 */
router.post(
  '/disputes/:id/approve',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const verifiedAmount = typeof req.body?.verifiedAmount === 'number' ? req.body.verifiedAmount : undefined;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;

    const updated = await receiptService.reviewReceipt({
      receiptId: id,
      action: 'APPROVE',
      reviewedBy: req.user!.id,
      verifiedAmount,
      notes,
    });

    res.json({ success: true, data: updated, message: 'Receipt approved' });
  })
);

/**
 * POST /api/admin/control/disputes/:id/reject
 * Body: { reason?: string }
 */
router.post(
  '/disputes/:id/reject',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const rejectionReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined;

    const updated = await receiptService.reviewReceipt({
      receiptId: id,
      action: 'REJECT',
      reviewedBy: req.user!.id,
      rejectionReason,
    });

    res.json({ success: true, data: updated, message: 'Receipt rejected' });
  })
);

export default router;
