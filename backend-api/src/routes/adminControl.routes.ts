/**
 * Admin Control Routes
 *
 * GET  /api/admin/control/security                    — security-focused AuditLog viewer
 * GET  /api/admin/control/disputes                    — receipts in MANUAL_REVIEW status
 * POST /api/admin/control/disputes/:id/approve        — approve a disputed receipt
 * POST /api/admin/control/disputes/:id/reject         — reject a disputed receipt
 * GET  /api/admin/control/risk-queue                  — G4: receipts by fraudScore risk tier
 * GET  /api/admin/control/dispute-cases               — G5: dispute case list
 * POST /api/admin/control/dispute-cases               — G5: create dispute case from receipt
 * GET  /api/admin/control/dispute-cases/:id           — G5: dispute case detail
 * PATCH /api/admin/control/dispute-cases/:id          — G5: advance status / set decision
 * POST  /api/admin/control/dispute-cases/:id/notes    — G5: add note to dispute
 * GET   /api/admin/control/dispute-cases/:id/notes    — G5: list notes on dispute
 * GET  /api/admin/control/receipt-templates           — G6: list VenueReceiptTemplates
 * POST /api/admin/control/receipt-templates           — G6: create template
 * PATCH /api/admin/control/receipt-templates/:id      — G6: update template metadata
 * DELETE /api/admin/control/receipt-templates/:id     — G6: deactivate template
 */

import { Router, Response } from 'express';
import { DisputeStatus } from '@prisma/client';
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
  requirePermission('control.risk.read'),
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

/* ─── G4: Risk Queue (Spec §7.1) ─────────────────────────────────────────── */

/**
 * GET /api/admin/control/risk-queue
 * Query: tier (REVIEW_31_60 | HIGH_61_PLUS | all), page, limit, venueId
 * Returns receipts filtered by fraudScore risk tier for the twice-weekly review queue.
 */
router.get(
  '/risk-queue',
  requirePermission('control.risk.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const tier = typeof req.query.tier === 'string' ? req.query.tier.trim() : 'all';
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId.trim() : '';

    let fraudScoreFilter: { gte?: number; lt?: number } = { gte: 31 };
    if (tier === 'REVIEW_31_60') fraudScoreFilter = { gte: 31, lt: 61 };
    else if (tier === 'HIGH_61_PLUS') fraudScoreFilter = { gte: 61 };

    const where: Parameters<typeof prisma.receipt.findMany>[0]['where'] = {
      fraudScore: fraudScoreFilter,
      status: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED'] },
    };
    if (venueId) where.venueId = venueId;

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fraudScore: 'desc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, riskBucket: true } },
        },
      }),
      prisma.receipt.count({ where }),
    ]);

    res.json({
      success: true,
      data: receipts,
      meta: { total, page, limit, pages: Math.ceil(total / limit), tier },
    });
  })
);

/* ─── G5: Dispute Cases (Spec §7.3) ─────────────────────────────────────── */

const DISPUTE_STATUS_ORDER: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'];

/**
 * GET /api/admin/control/dispute-cases
 * Query: status, assignedTo, page, limit
 */
router.get(
  '/dispute-cases',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const assignedTo = typeof req.query.assignedTo === 'string' ? req.query.assignedTo.trim() : '';

    const where: Parameters<typeof prisma.dispute.findMany>[0]['where'] = {};
    if (status && Object.values(DisputeStatus).includes(status as DisputeStatus)) {
      where.status = status as DisputeStatus;
    }
    if (assignedTo) where.assignedTo = assignedTo;

    const [cases, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
          receipt: { select: { id: true, merchantName: true, totalAmount: true, fraudScore: true, status: true } },
          _count: { select: { notes: true } },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      success: true,
      data: cases,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/control/dispute-cases
 * Body: { receiptId, notes? }
 * Opens a new dispute case for a receipt; receipt must belong to a user.
 */
router.post(
  '/dispute-cases',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiptId, notes } = req.body as { receiptId?: string; notes?: string };

    if (!receiptId) {
      return res.status(400).json({ success: false, error: 'receiptId is required' });
    }

    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { id: true, userId: true, status: true },
    });
    if (!receipt) return res.status(404).json({ success: false, error: 'Receipt not found' });

    const existing = await prisma.dispute.findFirst({
      where: { receiptId, status: { notIn: ['CLOSED'] } },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'An open dispute case already exists for this receipt', disputeId: existing.id });
    }

    const disputeCase = await prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          receiptId,
          userId: receipt.userId,
          assignedTo: req.user!.id,
          status: 'OPEN',
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          receipt: { select: { id: true, merchantName: true, totalAmount: true, fraudScore: true } },
        },
      });

      if (notes?.trim()) {
        await tx.disputeNote.create({
          data: {
            disputeId: created.id,
            authorId: req.user!.id,
            body: notes.trim(),
            isAdmin: true,
          },
        });
      }

      return created;
    });

    res.status(201).json({ success: true, data: disputeCase });
  })
);

/**
 * GET /api/admin/control/dispute-cases/:id
 */
router.get(
  '/dispute-cases/:id',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const disputeCase = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        receipt: {
          select: {
            id: true, merchantName: true, totalAmount: true, verifiedAmount: true,
            fraudScore: true, fraudReasons: true, status: true, imageUrl: true,
            ocrData: true, createdAt: true,
          },
        },
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });

    res.json({ success: true, data: disputeCase });
  })
);

/**
 * PATCH /api/admin/control/dispute-cases/:id
 * Body: { status?, assignedTo?, decision? }
 * Status must advance forward in: OPEN → IN_REVIEW → RESOLVED → CLOSED
 */
router.patch(
  '/dispute-cases/:id',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, assignedTo, decision } = req.body as {
      status?: string;
      assignedTo?: string;
      decision?: string;
    };

    const disputeCase = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });
    if (disputeCase.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: 'Cannot modify a closed dispute case' });
    }

    const data: Parameters<typeof prisma.dispute.update>[0]['data'] = {};

    if (status) {
      if (!Object.values(DisputeStatus).includes(status as DisputeStatus)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${DISPUTE_STATUS_ORDER.join(', ')}` });
      }
      const currentIdx = DISPUTE_STATUS_ORDER.indexOf(disputeCase.status);
      const newIdx = DISPUTE_STATUS_ORDER.indexOf(status as DisputeStatus);
      if (newIdx <= currentIdx) {
        return res.status(400).json({ success: false, error: `Status can only advance forward (current: ${disputeCase.status})` });
      }
      data.status = status as DisputeStatus;
      if (status === 'RESOLVED') data.resolvedAt = new Date();
      if (status === 'CLOSED') {
        // Set resolvedAt if the case jumps directly to CLOSED without passing through RESOLVED
        if (!disputeCase.resolvedAt) data.resolvedAt = new Date();
        data.closedAt = new Date();
      }
    }

    if (assignedTo !== undefined) data.assignedTo = assignedTo || null;
    if (decision !== undefined) data.decision = decision || null;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const updated = await prisma.dispute.update({
      where: { id: req.params.id },
      data,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * POST /api/admin/control/dispute-cases/:id/notes
 * Body: { body }
 */
router.post(
  '/dispute-cases/:id/notes',
  requirePermission('control.disputes.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { body } = req.body as { body?: string };
    if (!body?.trim()) {
      return res.status(400).json({ success: false, error: 'Note body is required' });
    }

    const disputeCase = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });
    if (disputeCase.status === 'CLOSED') {
      return res.status(400).json({ success: false, error: 'Cannot add notes to a closed dispute case' });
    }

    const note = await prisma.disputeNote.create({
      data: {
        disputeId: req.params.id,
        authorId: req.user!.id,
        body: body.trim(),
        isAdmin: true,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.status(201).json({ success: true, data: note });
  })
);

/**
 * GET /api/admin/control/dispute-cases/:id/notes
 */
router.get(
  '/dispute-cases/:id/notes',
  requirePermission('control.disputes.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const disputeCase = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!disputeCase) return res.status(404).json({ success: false, error: 'Dispute case not found' });

    const notes = await prisma.disputeNote.findMany({
      where: { disputeId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ success: true, data: notes });
  })
);

/* ─── G6: VenueReceiptTemplate CRUD (Spec §5.5) ─────────────────────────── */

/**
 * GET /api/admin/control/receipt-templates
 * Query: venueId, active (true|false), page, limit
 */
router.get(
  '/receipt-templates',
  requirePermission('control.risk.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId.trim() : '';
    const activeParam = req.query.active as string;

    const where: Parameters<typeof prisma.venueReceiptTemplate.findMany>[0]['where'] = {};
    if (venueId) where.venueId = venueId;
    if (activeParam !== undefined) where.isActive = activeParam !== 'false';

    const [templates, total] = await Promise.all([
      prisma.venueReceiptTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.venueReceiptTemplate.count({ where }),
    ]);

    res.json({
      success: true,
      data: templates,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/control/receipt-templates
 * Body: { venueId, merchantName, imageUrl, imageKey, perceptualHash, description?, expectedKeywords? }
 */
router.post(
  '/receipt-templates',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { venueId, merchantName, imageUrl, imageKey, perceptualHash, description, expectedKeywords } =
      req.body as {
        venueId?: string;
        merchantName?: string;
        imageUrl?: string;
        imageKey?: string;
        perceptualHash?: string;
        description?: string;
        expectedKeywords?: string[];
      };

    if (!venueId) return res.status(400).json({ success: false, error: 'venueId is required' });
    if (!merchantName?.trim()) return res.status(400).json({ success: false, error: 'merchantName is required' });
    if (!imageUrl?.trim()) return res.status(400).json({ success: false, error: 'imageUrl is required' });
    if (!imageKey?.trim()) return res.status(400).json({ success: false, error: 'imageKey is required' });
    if (!perceptualHash?.trim()) return res.status(400).json({ success: false, error: 'perceptualHash is required' });

    const venueExists = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venueExists) return res.status(404).json({ success: false, error: 'Venue not found' });

    const template = await prisma.venueReceiptTemplate.create({
      data: {
        venueId,
        merchantName: merchantName.trim(),
        imageUrl: imageUrl.trim(),
        imageKey: imageKey.trim(),
        perceptualHash: perceptualHash.trim(),
        description: description?.trim() ?? null,
        expectedKeywords: expectedKeywords ? JSON.stringify(expectedKeywords) : null,
        uploadedBy: req.user!.id,
      },
    });

    res.status(201).json({ success: true, data: template });
  })
);

/**
 * PATCH /api/admin/control/receipt-templates/:id
 * Body: { merchantName?, description?, expectedKeywords?, isActive? }
 * Image fields are intentionally excluded — re-upload via POST if image changes.
 */
router.patch(
  '/receipt-templates/:id',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { merchantName, description, expectedKeywords, isActive } = req.body as {
      merchantName?: string;
      description?: string | null;
      expectedKeywords?: string[] | null;
      isActive?: boolean;
    };

    const template = await prisma.venueReceiptTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ success: false, error: 'Receipt template not found' });

    const data: Parameters<typeof prisma.venueReceiptTemplate.update>[0]['data'] = {};
    if (merchantName !== undefined) data.merchantName = merchantName.trim();
    if (description !== undefined) data.description = description;
    if (expectedKeywords !== undefined) data.expectedKeywords = expectedKeywords ? JSON.stringify(expectedKeywords) : null;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const updated = await prisma.venueReceiptTemplate.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: updated });
  })
);

/**
 * DELETE /api/admin/control/receipt-templates/:id
 * Soft-deactivates the template (preserves audit trail).
 */
router.delete(
  '/receipt-templates/:id',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = await prisma.venueReceiptTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ success: false, error: 'Receipt template not found' });

    await prisma.venueReceiptTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Template deactivated' });
  })
);

export default router;
