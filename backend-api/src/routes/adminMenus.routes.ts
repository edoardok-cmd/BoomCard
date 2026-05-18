/**
 * Admin Menu Routes — vetting flow for partner-submitted menu URLs
 *
 * GET    /api/admin/menus/pending            — list all venues awaiting menu review
 * POST   /api/admin/venues/:id/menu/approve  — promote pendingMenuUrl → menuUrl, APPROVED
 * POST   /api/admin/venues/:id/menu/reject   — REJECTED with reason; pendingMenuUrl kept for partner visibility
 * PUT    /api/admin/venues/:id/menu          — direct edit (bypasses vetting), sets menuUrl + APPROVED
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

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
  requirePermission('partners.locations.read'),
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

// Separate router mounted at /api/admin/venues (list + :id-keyed mutations)
export const adminVenueMenuRouter = Router();
adminVenueMenuRouter.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
adminVenueMenuRouter.use(auditMiddleware);

/**
 * GET /api/admin/venues
 * Paginated list of all venues across all partners.
 * Query: page, limit, search, city, menuStatus, partnerId
 */
adminVenueMenuRouter.get(
  '/',
  requirePermission('partners.locations.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    const menuStatus = typeof req.query.menuStatus === 'string' ? req.query.menuStatus.trim() : '';
    const venueStatus = typeof req.query.venueStatus === 'string' ? req.query.venueStatus.trim() : '';
    const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId.trim() : '';

    const where: Parameters<typeof prisma.venue.findMany>[0]['where'] = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { partner: { businessName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (menuStatus) where.menuStatus = menuStatus as never;
    if (venueStatus) where.venueStatus = venueStatus as never;
    if (partnerId) where.partnerId = partnerId;

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          region: true,
          phone: true,
          menuStatus: true,
          menuUrl: true,
          pendingMenuUrl: true,
          venueStatus: true,
          venueStatusNote: true,
          venueStatusAt: true,
          createdAt: true,
          updatedAt: true,
          partner: {
            select: {
              id: true,
              businessName: true,
              status: true,
              partnerType: { select: { name: true, color: true } },
            },
          },
          stickerConfig: {
            select: {
              cashbackPercent: true,
              isActive: true,
              gpsVerificationEnabled: true,
              maxScansPerDay: true,
            },
          },
          _count: {
            select: { stickers: true, statusHistory: true },
          },
          stickers: {
            select: { createdAt: true, status: true, stickerId: true, qrCode: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      prisma.venue.count({ where }),
    ]);

    res.json({
      success: true,
      data: venues,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  })
);

/**
 * POST /api/admin/venues/:id/menu/approve
 * Promote pendingMenuUrl → menuUrl. Clears pending & rejection reason.
 * Optional body { expectedUrl } guards against approving a URL that changed
 * between preview and approve.
 */
adminVenueMenuRouter.post(
  '/:id/menu/approve',
  requirePermission('partners.locations.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const expectedUrl = typeof req.body?.expectedUrl === 'string' ? req.body.expectedUrl : null;
    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        partner: {
          select: { businessName: true, user: { select: { id: true, email: true } } },
        },
      },
    });
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

    logger.info('[menu-audit] APPROVED', {
      venueId: id,
      venueName: venue.name,
      adminId: req.user!.id,
      menuUrl: updated.menuUrl,
      at: new Date().toISOString(),
    });

    const partnerUserId = venue.partner?.user?.id;
    if (partnerUserId && updated.menuUrl) {
      notificationService.notifyMenuApproved({
        partnerUserId,
        venueId: id,
        venueName: venue.name,
        menuUrl: updated.menuUrl,
      }).catch((err) => logger.error('[menu-audit] Failed to send approval notification:', err));
    }

    const partnerEmail = venue.partner?.user?.email;
    if (partnerEmail) {
      emailService.sendMenuApprovedEmail(partnerEmail, {
        partnerName: venue.partner!.businessName,
        venueName: venue.name,
        menuUrl: updated.menuUrl!,
        dashboardUrl: process.env.PARTNER_DASHBOARD_URL,
      }).catch((err) => logger.error('[menu-audit] Failed to send approval email:', err));
    }

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
  requirePermission('partners.locations.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }
    if (reason.length > 1000) {
      return res.status(400).json({ success: false, error: 'Rejection reason is too long (max 1000 characters)' });
    }

    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        partner: {
          select: { businessName: true, user: { select: { id: true, email: true } } },
        },
      },
    });
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

    logger.info('[menu-audit] REJECTED', {
      venueId: id,
      venueName: venue.name,
      adminId: req.user!.id,
      reason,
      at: new Date().toISOString(),
    });

    const partnerUserId = venue.partner?.user?.id;
    if (partnerUserId) {
      notificationService.notifyMenuRejected({
        partnerUserId,
        venueId: id,
        venueName: venue.name,
        reason,
      }).catch((err) => logger.error('[menu-audit] Failed to send rejection notification:', err));
    }

    const partnerEmail = venue.partner?.user?.email;
    if (partnerEmail) {
      emailService.sendMenuRejectedEmail(partnerEmail, {
        partnerName: venue.partner!.businessName,
        venueName: venue.name,
        rejectedUrl: venue.pendingMenuUrl,
        reason,
        dashboardUrl: process.env.PARTNER_DASHBOARD_URL,
      }).catch((err) => logger.error('[menu-audit] Failed to send rejection email:', err));
    }

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
  requirePermission('partners.locations.write'),
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

    logger.info('[menu-audit] DIRECT_EDIT', {
      venueId: id,
      adminId: req.user!.id,
      menuUrl: updated.menuUrl,
      at: new Date().toISOString(),
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
  requirePermission('partners.locations.write'),
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

    logger.info('[menu-audit] CLEARED', {
      venueId: id,
      adminId: req.user!.id,
      at: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Menu cleared' });
  })
);

/**
 * PATCH /api/admin/venues/:id/status
 * Update location status (ACTIVE / SUSPENDED / REPLACED) — spec §5.4
 */
adminVenueMenuRouter.patch(
  '/:id/status',
  requirePermission('partners.locations.write'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { venueStatus, note } = req.body as { venueStatus?: string; note?: string };

    const VALID = ['ACTIVE', 'SUSPENDED', 'REPLACED'];
    if (!venueStatus || !VALID.includes(venueStatus)) {
      return res.status(400).json({ success: false, error: 'venueStatus must be ACTIVE, SUSPENDED, or REPLACED' });
    }

    const trimmedNote = note?.trim() || null;

    // Spec §5.4 — "Всяка локация има уникален QR код — основата на връзката."
    // Block activation of a venue that has no active sticker config (= no QR).
    // An admin can still override by first setting up the QR config.
    if (venueStatus === 'ACTIVE') {
      const stickerConfig = await prisma.venueStickerConfig.findUnique({
        where: { venueId: id },
        select: { isActive: true },
      });
      if (!stickerConfig || !stickerConfig.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Не може да се активира локация без QR код. Настройте QR / стикер конфигурацията първо.',
          code: 'MISSING_QR_CONFIG',
        });
      }
    }

    // Spec §5.4 — append a history row on every status change so the locations
    // page can render the full "Кога и защо е сменян" timeline. We append even
    // when the status didn't change (e.g. note-only edit) so the audit trail
    // captures every admin action; the UI differentiates via fromStatus===toStatus.
    //
    // Read fromStatus *inside* the interactive transaction so concurrent PATCHes
    // can't both read the same prior status and produce diverging audit rows.
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.venue.findUnique({
        where: { id },
        select: { venueStatus: true, venueStatusNote: true },
      });
      if (!before) return null;
      const updated = await tx.venue.update({
        where: { id },
        data: {
          venueStatus: venueStatus as never,
          venueStatusNote: trimmedNote,
          venueStatusAt: new Date(),
        },
        select: { id: true, venueStatus: true, venueStatusNote: true, venueStatusAt: true },
      });
      // Only append a history row when something actually changed: a status
      // transition OR a note edit. A pure no-op save (same status, same note)
      // would otherwise clutter the timeline with empty "Бележка обновена"
      // entries. fromStatus === toStatus on a written row still encodes
      // "note-only edit" for the UI to render.
      const statusChanged = before.venueStatus !== (venueStatus as never);
      const noteChanged = (before.venueStatusNote ?? null) !== trimmedNote;
      if (statusChanged || noteChanged) {
        await tx.venueStatusHistory.create({
          data: {
            venueId: id,
            fromStatus: before.venueStatus,
            toStatus: venueStatus as never,
            note: trimmedNote,
            changedById: req.user?.id ?? null,
          },
        });
      }
      return updated;
    });

    if (!result) return res.status(404).json({ success: false, error: 'Venue not found' });
    res.json({ success: true, data: result });
  })
);

/**
 * GET /api/admin/venues/:id/status-history
 * Returns the full status-change timeline for a venue (spec §5.4 — История).
 * Each row carries from→to, an optional note, and the actor who made the change.
 */
adminVenueMenuRouter.get(
  '/:id/status-history',
  requirePermission('partners.locations.read'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true } });
    if (!venue) return res.status(404).json({ success: false, error: 'Venue not found' });

    // take: 100 is a deliberate cap — a real venue accruing >100 status
    // events would indicate a misuse problem we'd want to investigate, not
    // paginate around. If the cap ever bites in practice, swap this for a
    // cursor-based scheme (e.g. ?before=createdAt&limit=N).
    const history = await prisma.venueStatusHistory.findMany({
      where: { venueId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Hydrate actor profiles in a follow-up query — same pattern as
    // assignedAdmin enrichment in adminPartners.routes.ts (no Prisma relation
    // on User to keep that model's relation list untouched).
    const actorIds = Array.from(
      new Set(history.map((h) => h.changedById).filter((x): x is string => !!x))
    );
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    res.json({
      success: true,
      data: history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        createdAt: h.createdAt,
        changedBy: h.changedById ? actorMap.get(h.changedById) ?? null : null,
      })),
    });
  })
);
