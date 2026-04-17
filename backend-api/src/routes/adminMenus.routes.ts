/**
 * Admin Menu Routes — vetting flow for partner-submitted menu URLs
 *
 * GET    /api/admin/menus/pending            — list all venues awaiting menu review
 * POST   /api/admin/venues/:id/menu/approve  — promote pendingMenuUrl → menuUrl, APPROVED
 * POST   /api/admin/venues/:id/menu/reject   — REJECTED with reason; pendingMenuUrl kept for partner visibility
 * PUT    /api/admin/venues/:id/menu          — direct edit (bypasses vetting), sets menuUrl + APPROVED
 */

import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

const validateMenuUrl = (raw: unknown): { ok: true; url: string } | { ok: false; error: string } => {
  if (typeof raw !== 'string') return { ok: false, error: 'Menu URL is required' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Menu URL is required' };
  if (trimmed.length > 2048) return { ok: false, error: 'Menu URL is too long (max 2048 characters)' };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Menu URL must use http or https' };
    }
  } catch {
    return { ok: false, error: 'Menu URL is not a valid URL' };
  }
  return { ok: true, url: trimmed };
};

/**
 * GET /api/admin/menus/pending
 * Queue of venues with an unreviewed partner submission.
 */
router.get(
  '/pending',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const venues = await prisma.venue.findMany({
      where: { menuStatus: 'PENDING' },
      orderBy: { menuSubmittedAt: 'asc' },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        menuUrl: true,
        pendingMenuUrl: true,
        menuStatus: true,
        menuSubmittedAt: true,
        partner: {
          select: { id: true, businessName: true },
        },
      },
    });

    res.json({ success: true, data: venues, meta: { count: venues.length } });
  })
);

export default router;

// Separate router mounted at /api/admin/venues (for :id-keyed mutations)
export const adminVenueMenuRouter = Router();
adminVenueMenuRouter.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

/**
 * POST /api/admin/venues/:id/menu/approve
 * Promote pendingMenuUrl → menuUrl. Clears pending & rejection reason.
 * Optional body { expectedUrl } guards against approving a URL that changed
 * between preview and approve.
 */
adminVenueMenuRouter.post(
  '/:id/menu/approve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const expectedUrl = typeof req.body?.expectedUrl === 'string' ? req.body.expectedUrl : null;
    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    if (!venue.pendingMenuUrl) {
      return res.status(400).json({ success: false, error: 'No pending menu URL to approve' });
    }
    if (expectedUrl && expectedUrl !== venue.pendingMenuUrl) {
      return res.status(409).json({
        success: false,
        error: 'The pending URL changed since you loaded the queue. Refresh and review again.',
      });
    }

    const updated = await prisma.venue.update({
      where: { id },
      data: {
        menuUrl: venue.pendingMenuUrl,
        pendingMenuUrl: null,
        menuStatus: 'APPROVED',
        menuRejectionReason: null,
        menuReviewedAt: new Date(),
        menuReviewedBy: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: {
        menuUrl: updated.menuUrl,
        menuStatus: updated.menuStatus,
        menuReviewedAt: updated.menuReviewedAt,
      },
      message: 'Menu approved',
    });
  })
);

/**
 * POST /api/admin/venues/:id/menu/reject
 * Body: { reason: string }
 * Leaves pendingMenuUrl intact so partner can see what was rejected.
 */
adminVenueMenuRouter.post(
  '/:id/menu/reject',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }
    if (reason.length > 1000) {
      return res.status(400).json({ success: false, error: 'Rejection reason is too long (max 1000 characters)' });
    }

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    if (!venue.pendingMenuUrl) {
      return res.status(400).json({ success: false, error: 'No pending menu URL to reject' });
    }

    const updated = await prisma.venue.update({
      where: { id },
      data: {
        menuStatus: 'REJECTED',
        menuRejectionReason: reason,
        menuReviewedAt: new Date(),
        menuReviewedBy: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: {
        menuStatus: updated.menuStatus,
        menuRejectionReason: updated.menuRejectionReason,
        pendingMenuUrl: updated.pendingMenuUrl,
        menuReviewedAt: updated.menuReviewedAt,
      },
      message: 'Menu rejected',
    });
  })
);

/**
 * PUT /api/admin/venues/:id/menu
 * Body: { url: string }
 * Direct edit — bypasses vetting. Sets menuUrl + APPROVED, clears pending.
 */
adminVenueMenuRouter.put(
  '/:id/menu',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const check = validateMenuUrl(req.body?.url);
    if (check.ok === false) {
      return res.status(400).json({ success: false, error: check.error });
    }

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    const updated = await prisma.venue.update({
      where: { id },
      data: {
        menuUrl: check.url,
        pendingMenuUrl: null,
        menuStatus: 'APPROVED',
        menuRejectionReason: null,
        menuReviewedAt: new Date(),
        menuReviewedBy: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: {
        menuUrl: updated.menuUrl,
        menuStatus: updated.menuStatus,
        menuReviewedAt: updated.menuReviewedAt,
      },
      message: 'Menu URL updated',
    });
  })
);

/**
 * DELETE /api/admin/venues/:id/menu
 * Admin removes the live menu URL (e.g., dead link, takedown). Clears everything.
 */
adminVenueMenuRouter.delete(
  '/:id/menu',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const venue = await prisma.venue.findUnique({ where: { id } });
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    await prisma.venue.update({
      where: { id },
      data: {
        menuUrl: null,
        pendingMenuUrl: null,
        menuStatus: 'NONE',
        menuRejectionReason: null,
        menuSubmittedAt: null,
        menuReviewedAt: new Date(),
        menuReviewedBy: req.user!.id,
      },
    });

    res.json({ success: true, message: 'Menu cleared' });
  })
);
