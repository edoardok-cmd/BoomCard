/**
 * Admin Partner-Requests Routes — spec sections 5.1–5.3
 *
 * GET  /api/admin/partner-requests                         — list (PENDING + pipeline)
 * GET  /api/admin/partner-requests/:id                     — single request detail
 * PATCH /api/admin/partner-requests/:id/status             — advance pipeline status
 * PATCH /api/admin/partner-requests/:id/assign             — assign "Отговорник"
 * POST /api/admin/partner-requests/:id/notes               — add communication note
 * GET  /api/admin/partner-requests/:id/notes               — list notes for request
 * POST /api/admin/partner-requests/:id/approve             — final approve (→ ACTIVE)
 * POST /api/admin/partner-requests/:id/reject              — reject
 * PATCH /api/admin/partner-requests/:id/visibility         — toggle isVisible
 * PATCH /api/admin/partner-requests/:id/partner-status     — set active-partner status
 */

import { Router } from 'express';
import { PartnerStatus, PartnerRequestStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { fireAutomation } from '../lib/automationDispatcher';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

const PARTNER_SELECT = {
  id: true,
  businessName: true,
  category: true,
  categories: true,
  email: true,
  phone: true,
  city: true,
  address: true,
  discountRate: true,
  status: true,
  requestStatus: true,
  assignedAdminId: true,
  isVisible: true,
  joinedAt: true,
  verifiedAt: true,
  onboardingCompletedAt: true,
  partnerType: { select: { id: true, name: true, color: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
} as const;

// ─── List partner requests ────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const { search, status, requestStatus, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.partner.findMany>[0]['where'] = {};

    if (status && Object.values(PartnerStatus).includes(status as PartnerStatus)) {
      where.status = status as PartnerStatus;
    } else {
      where.status = PartnerStatus.PENDING;
    }

    if (requestStatus && Object.values(PartnerRequestStatus).includes(requestStatus as PartnerRequestStatus)) {
      where.requestStatus = requestStatus as PartnerRequestStatus;
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({ where, skip, take, orderBy: { joinedAt: 'asc' }, select: PARTNER_SELECT }),
      prisma.partner.count({ where }),
    ]);

    // Spec §5.1 "Отговорник" — fetch assigned admin profile for each row.
    // Done as a follow-up query because Prisma doesn't have a relation defined for assignedAdminId.
    const adminIds = Array.from(
      new Set(partners.map((p) => p.assignedAdminId).filter((x): x is string => !!x))
    );
    const admins = adminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const adminMap = new Map(admins.map((a) => [a.id, a]));
    const enriched = partners.map((p) => ({
      ...p,
      assignedAdmin: p.assignedAdminId ? adminMap.get(p.assignedAdminId) ?? null : null,
    }));

    res.json({ partners: enriched, total, page: pageNum, limit: take });
  })
);

// ─── Assignable admins (spec §5.1 — assign to any super admin / admin) ───────
// Lightweight list of admin profiles for the request-assignment dropdown.
// Gated by partners.requests.write because assignment is a write op; this
// avoids requiring the broader admins.read permission.

router.get(
  '/_assignable-admins',
  requirePermission('partners.requests.write'),
  asyncHandler(async (_req, res) => {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
    });
    res.json({ admins });
  })
);

// ─── Onboarding readiness (spec §5.2 — locations / receipts / QR settings) ──
// For a partner in onboarding, returns counts of the three artifacts the
// spec requires the team to collect before activation: venues (locations),
// receipt templates (касови бележки), and sticker config (QR settings).

router.get(
  '/:id/onboarding-readiness',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const venues = await prisma.venue.findMany({
      where: { partnerId: partner.id },
      select: {
        id: true,
        name: true,
        stickerConfig: { select: { id: true, isActive: true } },
        _count: { select: { stickers: true } },
      },
    });

    const venueIds = venues.map((v) => v.id);

    // Spec §5.2 — onboarding requires receipt templates AND QR settings to be
    // collected. Both checks must be per-venue, not global: a 5-venue partner
    // shouldn't pass with one template (or one sticker config) covering one
    // venue. Group active templates by venueId so we count distinct venues
    // covered, not raw template rows.
    const venueIdsWithReceipts = venueIds.length
      ? await prisma.venueReceiptTemplate.groupBy({
          by: ['venueId'],
          where: { venueId: { in: venueIds }, isActive: true },
        })
      : [];
    const venuesWithReceipts = venueIdsWithReceipts.length;

    // Total active template rows — kept around as an informational count for
    // the UI (a partner may have multiple templates per venue covering
    // different receipt formats); readiness is gated on per-venue coverage.
    const receiptTemplateCount = venueIds.length
      ? await prisma.venueReceiptTemplate.count({
          where: { venueId: { in: venueIds }, isActive: true },
        })
      : 0;

    const venueCount = venues.length;
    // Sticker config counts only ACTIVE configs — an inactive config means the
    // QR isn't actually live, so it must not count as ready (spec §5.4 — QR
    // настройки collected and operational).
    const venuesWithActiveStickerConfig = venues.filter(
      (v) => v.stickerConfig && v.stickerConfig.isActive
    ).length;
    const venuesWithStickers = venues.filter((v) => v._count.stickers > 0).length;

    res.json({
      venueCount,
      // Distinct venue coverage — what the readiness gate evaluates
      venuesWithReceipts,
      // Raw template-row count — informational, may exceed venueCount
      receiptTemplateCount,
      stickerConfigCount: venuesWithActiveStickerConfig,
      venuesWithStickers,
      ready:
        venueCount > 0 &&
        venuesWithReceipts >= venueCount &&
        venuesWithActiveStickerConfig >= venueCount,
    });
  })
);

// ─── Single request detail ────────────────────────────────────────────────────

router.get(
  '/:id',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: {
        ...PARTNER_SELECT,
        description: true,
        website: true,
        address: true,
        region: true,
        pendingChanges: true,
        pendingChangesAt: true,
      },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    // Hydrate assignedAdmin the same way the list endpoint does so the request
    // drawer can render the "Отговорник" without a second roundtrip. There's no
    // Prisma relation on assignedAdminId — that's intentional (kept simple) so
    // we resolve via a follow-up findUnique.
    let assignedAdmin = null;
    if (partner.assignedAdminId) {
      assignedAdmin = await prisma.user.findUnique({
        where: { id: partner.assignedAdminId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
    }

    res.json({ partner: { ...partner, assignedAdmin } });
  })
);

// ─── Advance pipeline status ──────────────────────────────────────────────────

const VALID_PIPELINE_TRANSITIONS: Partial<Record<PartnerRequestStatus, PartnerRequestStatus[]>> = {
  NOVA: ['KOMUNIKACIYA', 'OTKAZANA'],
  KOMUNIKACIYA: ['DOGOVARYANE', 'OTKAZANA'],
  DOGOVARYANE: ['ONBOARDING', 'OTKAZANA'],
  ONBOARDING: ['ODOBRENA', 'OTKAZANA'],
  ODOBRENA: [],
  OTKAZANA: [],
};

router.patch(
  '/:id/status',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { requestStatus } = req.body as { requestStatus?: string };

    if (!requestStatus || !Object.values(PartnerRequestStatus).includes(requestStatus as PartnerRequestStatus)) {
      return res.status(400).json({ error: 'Invalid requestStatus' });
    }

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const current: PartnerRequestStatus = partner.requestStatus ?? 'NOVA';
    const allowed = VALID_PIPELINE_TRANSITIONS[current] ?? [];
    if (!allowed.includes(requestStatus as PartnerRequestStatus)) {
      return res.status(400).json({
        error: `Cannot transition from ${current} to ${requestStatus}`,
        allowedTransitions: allowed,
      });
    }

    const isOdobrenaTransition =
      requestStatus === PartnerRequestStatus.ODOBRENA && current !== PartnerRequestStatus.ODOBRENA;

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        requestStatus: requestStatus as PartnerRequestStatus,
        // Spec §3.2 informational alert needs an explicit completion timestamp.
        // Stamp once on the first ODOBRENA transition; later edits don't reset it.
        ...(isOdobrenaTransition && !partner.onboardingCompletedAt
          ? { onboardingCompletedAt: new Date() }
          : {}),
      },
      select: PARTNER_SELECT,
    });

    res.json({ partner: updated });
  })
);

// ─── Assign "Отговорник" ──────────────────────────────────────────────────────

router.patch(
  '/:id/assign',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { adminId } = req.body as { adminId?: string | null };

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    if (adminId !== null && adminId !== undefined) {
      const admin = await prisma.user.findFirst({ where: { id: adminId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } } });
      if (!admin) return res.status(400).json({ error: 'Admin not found' });
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { assignedAdminId: adminId ?? null },
      select: PARTNER_SELECT,
    });

    res.json({ partner: updated });
  })
);

// ─── Communication notes ──────────────────────────────────────────────────────

router.post(
  '/:id/notes',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { body, isInternal = true } = req.body as { body?: string; isInternal?: boolean };

    if (!body?.trim()) return res.status(400).json({ error: 'Note body is required' });

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    if (!partner.requestStatus) {
      await prisma.partner.update({ where: { id: req.params.id }, data: { requestStatus: 'NOVA' } });
    }

    const note = await prisma.partnerRequestNote.create({
      data: {
        partnerId: req.params.id,
        authorId: req.user!.id,
        body: body.trim(),
        isInternal: Boolean(isInternal),
      },
      include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    res.status(201).json({ note });
  })
);

router.get(
  '/:id/notes',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const notes = await prisma.partnerRequestNote.findMany({
      where: { partnerId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    res.json({ notes });
  })
);

// ─── Approve → ACTIVE ─────────────────────────────────────────────────────────

router.post(
  '/:id/approve',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    if (partner.status === PartnerStatus.ACTIVE) {
      return res.status(400).json({ error: 'Partner is already ACTIVE' });
    }
    const NON_APPROVABLE_STATUSES: PartnerStatus[] = [PartnerStatus.REJECTED, PartnerStatus.PAUSED, PartnerStatus.SUSPENDED, PartnerStatus.ARCHIVED];
    if (NON_APPROVABLE_STATUSES.includes(partner.status)) {
      return res.status(400).json({ error: 'Cannot approve a partner in this state. Use /partner-status to manage post-onboarding partner statuses.' });
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        status: PartnerStatus.ACTIVE,
        requestStatus: PartnerRequestStatus.ODOBRENA,
        verifiedAt: new Date(),
        // Spec §3.2 — stamp onboarding completion the first time the partner
        // gets approved; later approvals (re-activation) don't bump it.
        ...(partner.onboardingCompletedAt ? {} : { onboardingCompletedAt: new Date() }),
      },
      select: PARTNER_SELECT,
    });

    fireAutomation('partner.approved', {
      partnerId: updated.id,
      recipientEmail: updated.email ?? undefined,
      recipientName: updated.businessName,
    }).catch((err) => logger.error('[automation] partner.approved fire failed:', err));

    res.json({ success: true, partner: updated });
  })
);

// ─── Reject ───────────────────────────────────────────────────────────────────

router.post(
  '/:id/reject',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason is required' });

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    if (partner.status === PartnerStatus.REJECTED) {
      return res.status(400).json({ error: 'Partner is already rejected' });
    }
    const POST_ONBOARDING_STATUSES: PartnerStatus[] = [
      PartnerStatus.ACTIVE, PartnerStatus.PAUSED, PartnerStatus.SUSPENDED, PartnerStatus.ARCHIVED,
    ];
    if (POST_ONBOARDING_STATUSES.includes(partner.status)) {
      return res.status(400).json({ error: 'Cannot reject an active partner via this endpoint. Use /partner-status to manage active partner statuses.' });
    }

    const [updated] = await prisma.$transaction([
      prisma.partner.update({
        where: { id: req.params.id },
        data: { status: PartnerStatus.REJECTED, requestStatus: PartnerRequestStatus.OTKAZANA },
        select: PARTNER_SELECT,
      }),
      prisma.partnerRequestNote.create({
        data: {
          partnerId: req.params.id,
          authorId: req.user!.id,
          body: reason.trim(),
          isInternal: false,
        },
      }),
    ]);

    res.json({ success: true, partner: updated, reason });
  })
);

// ─── Toggle visibility ────────────────────────────────────────────────────────

router.patch(
  '/:id/visibility',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req, res) => {
    const { isVisible } = req.body as { isVisible?: boolean };
    if (typeof isVisible !== 'boolean') return res.status(400).json({ error: 'isVisible (boolean) is required' });

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { isVisible },
      select: { id: true, businessName: true, isVisible: true },
    });

    res.json({ partner: updated });
  })
);

// ─── Active-partner status (spec 5.3) ─────────────────────────────────────────

const ACTIVE_PARTNER_STATUSES: PartnerStatus[] = [
  PartnerStatus.ACTIVE,
  PartnerStatus.PAUSED,
  PartnerStatus.SUSPENDED,
  PartnerStatus.ARCHIVED,
];

router.patch(
  '/:id/partner-status',
  requirePermission('partners.write'),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status?: string };

    if (!status || !ACTIVE_PARTNER_STATUSES.includes(status as PartnerStatus)) {
      return res.status(400).json({
        error: 'status must be one of: ACTIVE, PAUSED, SUSPENDED, ARCHIVED (use ARCHIVED instead of INACTIVE)',
      });
    }

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    if (!ACTIVE_PARTNER_STATUSES.includes(partner.status)) {
      return res.status(400).json({ error: 'This endpoint only manages post-onboarding partners. Use the onboarding pipeline for partners not yet active.' });
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { status: status as PartnerStatus },
      select: PARTNER_SELECT,
    });

    res.json({ partner: updated });
  })
);

// ─── Partner audit log ────────────────────────────────────────────────────────

router.get(
  '/:id/audit',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const entries = await prisma.auditLog.findMany({
      where: { objectType: 'Partner', objectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    res.json({ entries });
  })
);

export default router;
