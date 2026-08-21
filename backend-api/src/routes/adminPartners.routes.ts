/**
 * Admin Partner-Requests Routes — spec sections 5.1–5.3
 *
 * Permission matrix (source of truth — see also docs/permission-matrix.md):
 *
 *   §5.1 / §5.2 Requests pipeline (partners.requests.*)
 *   ─────────────────────────────────────────────────
 *   GET    /                              partners.requests.read
 *   GET    /_assignable-admins            partners.requests.write  (write-scope — it backs the assign action)
 *   GET    /:id                           partners.requests.read
 *   GET    /:id/onboarding-readiness      partners.requests.read
 *   GET    /:id/notes                     partners.requests.read
 *   POST   /:id/notes                     partners.requests.write
 *   PATCH  /:id/status                    partners.requests.write
 *   PATCH  /:id/assign                    partners.requests.write
 *   PATCH  /:id/contract                  partners.requests.write
 *   POST   /:id/approve                   partners.requests.write
 *   POST   /:id/reject                    partners.requests.write
 *   POST   /:id/resend-activation         partners.requests.write
 *   GET    /:id/activation-links          partners.requests.read
 *   PATCH  /:id/visibility                partners.requests.write
 *   GET    /:id/audit                     partners.requests.read
 *
 *   §5.3 Active-partner controls (partners.*)
 *   ─────────────────────────────────────────
 *   PATCH  /:id/category                  partners.requests.write  (spec §3.5 — edit business category post-onboarding)
 *   PATCH  /:id/partner-status            partners.write           (post-onboarding status transitions)
 *   PATCH  /:id/discount-rate             partners.write           (spec §13 — ADMIN only, not PARTNER_MANAGER)
 *   POST   /:id/propose-discount-rate     partners.requests.write  (spec §13 — PARTNER_MANAGER proposal → critical-action queue)
 *   GET    /:id/status-history            partners.read            (paired with /partner-status write)
 *   PATCH  /:id/visibility                partners.requests.write  (spec §8.1 rule 7 — ACTIVE partners only)
 *
 * The split is deliberate: §5.1/§5.2 model the *application pipeline* and use
 * the partners.requests.* namespace; §5.3 deals with *operational state* of
 * an already-active partner and uses the partners.* namespace. Roles can be
 * granted one without the other (a partner-onboarding admin doesn't
 * automatically get permission to suspend live partners).
 *
 * §13 note: PARTNER_MANAGER does NOT hold partners.write. That is intentional —
 * rate negotiation and live-partner suspension require ADMIN authority.
 */

import { Router } from 'express';
import { PartnerStatus, PartnerRequestStatus, ActivationLinkReason } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { auditMiddleware, writeAudit } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { issueActivationLink, sendActivationEmail, stampEmailOutcome } from '../services/partnerActivation.service';
import { emailService } from '../services/email.service';
import { partnerService, derivePartnerInactiveSubType } from '../services/partner.service';
import { computePartnerSla } from '../services/partnerSla.helper';
import { getClientIp } from '../utils/requestIp';
import {
  parseVenueCountBucket,
  formatVenueCountBucket,
  VENUE_COUNT_BUCKET_DISPLAY_VALUES,
} from '../services/partnerVenueCountBucket.helper';
import { CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';
import { fraudDetectionService } from '../services/fraudDetection.service';
import { parsePagination } from '../utils/pagination';
import { detach } from '../utils/detach';
import { isMainCategoryId, isSubcategoryId } from '../constants/categoryRegistry';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

// Shared rate-limit window for activation-link issuance (both /approve and /resend-activation).
const RESEND_RATE_LIMIT_MS = 60 * 1000; // 1 link per partner per minute

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
  features: true,
  status: true,
  requestStatus: true,
  assignedAdminId: true,
  isVisible: true,
  // M3 (§1.6) — SLA clock anchors on createdAt (application creation), not joinedAt.
  createdAt: true,
  joinedAt: true,
  verifiedAt: true,
  onboardingCompletedAt: true,
  // M2/M3 (§1.4/§1.6) — sub-type metadata on the Inactive status: distinguishes
  // ONBOARDING_INACTIVE (Onboarding stage) and VOLUNTARY_PAUSE/ADMIN_SUSPENSION
  // (Пауза/Спрян). Surfaced so the admin UI can render the correct sub-state label
  // without the canonical status enum being extended.
  statusReason: true,
  // Spec §5.1 v1.1 — declared venue count bucket and activation state.
  requestObjectCount: true,
  partnerType: { select: { id: true, name: true, color: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  _count: { select: { requestNotes: true } },
} as const;

// SLA helper lives in services/partnerSla.helper.ts — single source of truth
// shared between the live routes here and the unit tests in
// tests/unit/adminPartnersSla.test.ts.

// ─── List partner requests ────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const { search, status, requestStatus, objectCount } = req.query as Record<string, string>;
    const { skip, take, page: pageNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const where: Parameters<typeof prisma.partner.findMany>[0]['where'] = {};

    if (status && Object.values(PartnerStatus).includes(status as PartnerStatus)) {
      where.status = status as PartnerStatus;
    } else {
      where.status = PartnerStatus.PENDING;
    }

    if (requestStatus && Object.values(PartnerRequestStatus).includes(requestStatus as PartnerRequestStatus)) {
      where.requestStatus = requestStatus as PartnerRequestStatus;
    }

    // Spec §5.1 v1.1 — filter by declared venue count bucket. Whitelisted to the
    // four canonical values so a malformed query can't return surprising matches.
    // The column is the PartnerVenueCountBucket enum; parseVenueCountBucket
    // translates the wire-format ("1" / "2-5" / "6-10" / "11+") to the enum.
    if (objectCount && (VENUE_COUNT_BUCKET_DISPLAY_VALUES as readonly string[]).includes(objectCount)) {
      const bucket = parseVenueCountBucket(objectCount);
      if (bucket) where.requestObjectCount = bucket;
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
    const enriched = partners.map((p) => {
      let features: Record<string, unknown> | null = null;
      if (p.features) { try { features = JSON.parse(p.features) as Record<string, unknown>; } catch { /* ignore */ } }
      return {
        ...p,
        // Serialise the enum back to the wire-format string the UI renders directly.
        requestObjectCount: formatVenueCountBucket(p.requestObjectCount),
        features,
        assignedAdmin: p.assignedAdminId ? adminMap.get(p.assignedAdminId) ?? null : null,
        sla: computePartnerSla(p.createdAt as Date, p.requestStatus ?? null, p.assignedAdminId ?? null),
        // M3 (§1.4) — canonical Inactive sub_type derived from status + statusReason.
        inactiveSubType: derivePartnerInactiveSubType(p),
      };
    });

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

    // features is stored as a JSON string (String? column); parse it so the
    // frontend receives an object it can access without manual JSON.parse.
    let features: Record<string, unknown> | null = null;
    if (partner.features) {
      try { features = JSON.parse(partner.features) as Record<string, unknown>; } catch { /* ignore */ }
    }

    res.json({
      partner: {
        ...partner,
        requestObjectCount: formatVenueCountBucket(partner.requestObjectCount),
        assignedAdmin,
        features,
        sla: computePartnerSla(partner.createdAt as Date, partner.requestStatus ?? null, partner.assignedAdminId ?? null),
        // M3 (§1.4) — canonical Inactive sub_type derived from status + statusReason.
        inactiveSubType: derivePartnerInactiveSubType(partner),
      },
    });
  })
);

// ─── Advance pipeline status ──────────────────────────────────────────────────

// Legal pipeline advances for PATCH /:id/status ONLY.
//
// Terminal transitions are deliberately NOT reachable from this table, because
// each of them owns side effects that this generic "advance the pipeline"
// handler does not perform:
//
//   • → APPROVED  is owned by POST /:id/approve, which additionally ISSUES THE
//     PARTNER ACTIVATION LINK (spec §1.6, §3.5 step 3) via
//     activationLink.service and emails it. BC-QA-045: `ONBOARDING: ['APPROVED']`
//     used to sit here, so PATCH /:id/status could flip a partner's
//     requestStatus to APPROVED with no activation link ever created — the
//     partner was marked approved but had never been sent the link they need to
//     activate. Removing APPROVED from the table makes the link-issuing endpoint
//     the only door into that state.
//
//     Such a partner is NOT permanently stranded: because PATCH /:id/status
//     never writes `partner.status`, it leaves the row at
//     requestStatus=APPROVED + status=PENDING, and POST /:id/approve has a
//     deliberate resend-activation carve-out (see its guards, which accept an
//     APPROVED source ONLY while status is still PENDING) that re-issues the
//     link for exactly that combination. So the operational damage was a
//     partner sitting un-activated until someone noticed, not an unrecoverable
//     row — and that carve-out is load-bearing, not dead code: do not delete it
//     on the strength of this edge having been removed.
//   • → REJECTED  is owned by POST /:id/reject (audit trail + link
//     invalidation) and is already rejected explicitly a few lines below, with
//     a message naming the correct endpoint.
//
// With APPROVED gone, ONBOARDING has no onward PATCH transition, so its entry is
// an empty list exactly like the terminal APPROVED entry. An attempt to advance
// past it falls through to the standard pipeline rejection below (400 +
// `allowedTransitions`), which is the same shape every other illegal transition
// in this handler returns.
const VALID_PIPELINE_TRANSITIONS: Partial<Record<PartnerRequestStatus, PartnerRequestStatus[]>> = {
  NEW: ['COMMUNICATION'],
  COMMUNICATION: ['NEGOTIATION'],
  NEGOTIATION: ['ONBOARDING'],
  ONBOARDING: [],
  APPROVED: [],
};

router.patch(
  '/:id/status',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    let { requestStatus } = req.body as { requestStatus?: string };

    // Normalize database-mapped names to TypeScript enum names (frontend sends NOVA/KOMUNIKACIYA/etc.,
    // we need NEW/COMMUNICATION/etc. for validation and Prisma).
    // Map database @map values back to enum names.
    const DB_TO_ENUM_MAP: Record<string, PartnerRequestStatus> = {
      'NOVA': PartnerRequestStatus.NEW,
      'KOMUNIKACIYA': PartnerRequestStatus.COMMUNICATION,
      'DOGOVARYANE': PartnerRequestStatus.NEGOTIATION,
      'ONBOARDING': PartnerRequestStatus.ONBOARDING,
      'ODOBRENA': PartnerRequestStatus.APPROVED,
      'OTKAZANA': PartnerRequestStatus.REJECTED,
    };

    if (!requestStatus) {
      return res.status(400).json({ error: 'requestStatus is required' });
    }

    // Accept either TypeScript enum names or database-mapped names
    const normalized = DB_TO_ENUM_MAP[requestStatus] || (requestStatus as PartnerRequestStatus);

    if (!Object.values(PartnerRequestStatus).includes(normalized)) {
      return res.status(400).json({
        error: 'Invalid requestStatus',
        validValues: Object.values(PartnerRequestStatus),
      });
    }

    requestStatus = normalized;

    if (requestStatus === PartnerRequestStatus.REJECTED) {
      return res.status(400).json({
        error: 'Cannot set requestStatus to REJECTED via PATCH. Use POST /:id/reject to reject a partner — it handles the full rejection workflow including status flip, audit trail, and link invalidation.',
      });
    }

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const current: PartnerRequestStatus = partner.requestStatus ?? 'NEW';
    const allowed = VALID_PIPELINE_TRANSITIONS[current] ?? [];
    if (!allowed.includes(requestStatus as PartnerRequestStatus)) {
      return res.status(400).json({
        error: `Cannot transition from ${current} to ${requestStatus}`,
        allowedTransitions: allowed,
      });
    }

    // BC-QA-045: the APPROVED bookkeeping that used to live here — an
    // `isOdobrenaTransition` flag stamping `onboardingCompletedAt` and clearing
    // the ONBOARDING_INACTIVE marker — has been REMOVED rather than left in place.
    // No entry in VALID_PIPELINE_TRANSITIONS yields APPROVED any more, so the
    // guard above always rejects first and those branches could never evaluate
    // true again. `onboardingCompletedAt` is stamped by POST /:id/approve, which
    // is now the only door to APPROVED.

    // M2 (Spec §1.6) — at the Onboarding stage the partner account exists in a
    // distinct "Inactive, read-only" operational state. The canonical partner
    // status enum is Active|Inactive|Archived and the partner row stays PENDING
    // until activation (the approve flow keys on status===PENDING, so we must NOT
    // flip the enum here — that would also need a migration we're not allowed to
    // make). Instead we record the Onboarding-Inactive operational sub-state as a
    // structured marker on `statusReason` (the same metadata field used for the
    // Пауза/Спрян sub-types — §1.4). Read surfaces already map PENDING → canonical
    // "Inactive" (partners.routes.toCanonicalPartnerStatus / partnerStatus
    // middleware), and writes are already blocked for non-ACTIVE partners, so the
    // operational behavior (Inactive + read-only) is enforced; this marker makes
    // the state explicit and queryable.
    // NB (BC-QA-045, corrected BC-QA-045-FOLLOWUP-2): this marker is stale, not
    // permanently stuck. It is written here and cleared in two places: POST
    // /:id/approve clears it as soon as the partner leaves the onboarding stage
    // (the only door to APPROVED), and setPartnerStatus (partner.service.ts)
    // clears statusReason to null on every later transition to ACTIVE/ARCHIVED.
    // So the marker is only accurate for the PENDING window between this
    // ONBOARDING transition and approval — do not read it as valid outside that
    // window, but it is not orphaned indefinitely either.
    const isOnboardingTransition =
      requestStatus === PartnerRequestStatus.ONBOARDING && current !== PartnerRequestStatus.ONBOARDING;
    const ONBOARDING_INACTIVE_MARKER = 'ONBOARDING_INACTIVE';

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        requestStatus: requestStatus as PartnerRequestStatus,
        // M2 — stamp the Onboarding-Inactive sub-state marker.
        ...(isOnboardingTransition ? { statusReason: ONBOARDING_INACTIVE_MARKER } : {}),
      },
      select: PARTNER_SELECT,
    });

    // Spec §10.4 — log every pipeline status change with before/after context.
    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.request.status',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { requestStatus: current },
      // BC-QA-045: the `onboardingCompleted: true` audit annotation that used to
      // be spread in here was also gated on the now-impossible APPROVED
      // transition, so it could never appear. POST /:id/approve writes its own
      // audit entry for the approval.
      after: { requestStatus },
    }), (err) => logger.error('[adminPartners] pipeline writeAudit failed:', err));

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

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.assign',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { assignedAdminId: partner.assignedAdminId },
      after: { assignedAdminId: adminId ?? null },
    }), (err) => logger.error('[adminPartners] assign writeAudit failed:', err));

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

    // Bug-fix: initialise requestStatus and create the note atomically so a
    // failed note-create can't leave requestStatus=NOVA without a note, and so
    // two concurrent first-notes on the same partner don't race.
    // Scope guard: only set NOVA for PENDING partners; never touch an already-
    // active/inactive partner's requestStatus (the pipeline field is irrelevant
    // for post-onboarding records and NOVA would be misleading).
    const needsInit = !partner.requestStatus && partner.status === 'PENDING';

    const note = await prisma.$transaction(async (tx) => {
      if (needsInit) {
        await tx.partner.update({ where: { id: req.params.id }, data: { requestStatus: 'NEW' } });
      }
      return tx.partnerRequestNote.create({
        data: {
          partnerId: req.params.id,
          authorId: req.user!.id,
          body: body.trim(),
          isInternal: Boolean(isInternal),
        },
        include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
      });
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

// ─── Contract tracking (spec §5.2 — control principle) ───────────────────────
// Stores contract-signed status and date in partner.features JSON.
router.patch(
  '/:id/contract',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { signed } = req.body as { signed?: boolean };
    if (typeof signed !== 'boolean') {
      return res.status(400).json({ error: 'signed (boolean) is required' });
    }
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const existingFeatures: Record<string, unknown> = partner.features
      ? (JSON.parse(partner.features) as Record<string, unknown>)
      : {};
    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        features: JSON.stringify({
          ...existingFeatures,
          contractSigned: signed,
          contractSignedAt: signed ? new Date().toISOString() : null,
          contractSignedBy: signed && req.user ? req.user.id : null,
        }),
      },
      select: { id: true, features: true },
    });
    let parsedFeatures: Record<string, unknown> | null = null;
    if (updated.features) { try { parsedFeatures = JSON.parse(updated.features); } catch { /* ignore */ } }

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.contract.update',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { contractSigned: existingFeatures.contractSigned ?? null },
      after: { contractSigned: signed },
    }), (err) => logger.error('[adminPartners] contract writeAudit failed:', err));

    res.json({ partner: { ...updated, features: parsedFeatures } });
  })
);

// ─── Contracted discount-rate (spec §13) ──────────────────────────────────────
// Allows ADMIN+ to adjust a partner's individual cashback discount rate post-approval.
// Partners cannot call this endpoint (no ADMIN/SUPER_ADMIN role). PARTNER_MANAGER is
// also excluded — they do not hold partners.write per the §13 permission matrix.
router.patch(
  '/:id/discount-rate',
  requirePermission('partners.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { rate } = req.body as { rate?: number | null };

    // Reject missing field early — undefined would fall through both guards and silently
    // set discountRate to null via the `?? null` coercion below.
    if (rate === undefined) {
      return res.status(400).json({ error: 'rate is required (pass null to clear the override)' });
    }

    // null clears the override — partner falls back to partnerType default
    if (rate !== null) {
      if (!CASHBACK_MATRIX_STEPS.includes(rate as (typeof CASHBACK_MATRIX_STEPS)[number])) {
        return res.status(400).json({
          error: `rate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}, or null to clear`,
        });
      }
    }

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: { partnerType: { select: { maxDiscountRate: true } } },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    if (rate !== null && rate !== undefined && partner.partnerType?.maxDiscountRate != null) {
      if (rate > partner.partnerType.maxDiscountRate) {
        return res.status(400).json({
          error: `rate (${rate}%) exceeds the maximum for this partner type (${partner.partnerType.maxDiscountRate}%)`,
        });
      }
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { discountRate: rate ?? null },
      select: PARTNER_SELECT,
    });

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.discount-rate.update',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { discountRate: partner.discountRate },
      after: { discountRate: rate ?? null },
    }), (err) => logger.error('[adminPartners] writeAudit failed:', err));

    res.json({ partner: updated });
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
    // Bug-fix: INACTIVE is a post-onboarding status — re-activating must go
    // through /partner-status, not through the onboarding approve endpoint.
    // Without this guard, an INACTIVE partner (requestStatus=APPROVED, verifiedAt
    // set) would receive a stale "Onboarding approved" email + a superfluous
    // activation link, and the PartnerStatusChange row would carry the wrong label.
    if (partner.status === PartnerStatus.REJECTED) {
      return res.status(400).json({ error: 'Partner was rejected during onboarding and cannot be approved. A new partner application must be submitted — the rejected record cannot be reactivated.' });
    }
    const NON_APPROVABLE_STATUSES: PartnerStatus[] = [
      PartnerStatus.INACTIVE,
      PartnerStatus.PAUSED,
      PartnerStatus.SUSPENDED,
      PartnerStatus.ARCHIVED,
    ];
    if (NON_APPROVABLE_STATUSES.includes(partner.status)) {
      return res.status(400).json({ error: 'Cannot approve a partner in this state. Use /partner-status to manage post-onboarding partner statuses.' });
    }
    // L5 / Spec §1.6 + §5.2 — the single application-status approval edge is
    // ONBOARDING → Approved; approval directly from NEW/Communication/Negotiation
    // bypasses required onboarding-quality steps and is rejected here.
    //
    // The APPROVED source is accepted ONLY as an idempotent RESEND-ACTIVATION case,
    // NOT as a second approval edge: a partner whose requestStatus is already
    // APPROVED but whose operational status is still PENDING never consumed their
    // 72h activation link. Re-hitting /approve in that exact state re-issues the
    // link (the status edge is still PENDING → ACTIVE — the same activation edge,
    // not a new application-status transition). This carve-out is tightly guarded
    // below: any APPROVED partner NOT in PENDING is rejected. Removing the APPROVED
    // branch entirely would break this resend-activation path (noted per L5).
    if (partner.requestStatus !== PartnerRequestStatus.ONBOARDING && partner.requestStatus !== PartnerRequestStatus.APPROVED) {
      return res.status(400).json({
        error: `Partner must reach the ONBOARDING stage before approval. Current stage: ${partner.requestStatus ?? 'NEW'}`,
        currentStatus: partner.requestStatus ?? 'NEW',
      });
    }
    // Guard the resend carve-out: if requestStatus is already APPROVED but
    // partner.status is not PENDING, the pipeline was manually advanced (via PATCH
    // /status) without consuming an activation link, OR the partner is already
    // post-onboarding. PENDING is the ONLY status where an APPROVED-source approve
    // (= resend activation) is legitimate. Any other status is rejected so APPROVED
    // can never act as a second approval edge.
    if (
      partner.requestStatus === PartnerRequestStatus.APPROVED &&
      partner.status !== PartnerStatus.PENDING
    ) {
      return res.status(400).json({
        error: 'Partner pipeline shows APPROVED but operational status is not PENDING. Use /partner-status for post-onboarding transitions.',
        currentStatus: partner.status,
      });
    }

    // Spec §5.2 v1.1 — approve + issue must be coherent. The status flip and
    // the activation-link create both go inside one transaction; the
    // activationLinkService uses SERIALIZABLE isolation internally so two
    // concurrent approves can't both end up with a non-invalidated link.
    //
    // We do this in two steps because activationLinkService.issue opens its
    // own transaction; nesting via `tx` would require passing the client
    // around. The Partner row's status change is the durable mark — if the
    // link create fails, the admin can resend from the drawer.
    // Spec §1.6 / §3.5 — do NOT advance partner.status to ACTIVE here.
    // The partner only becomes Active when they consume the activation link
    // (activationLink.service.ts:consume). No PartnerStatusChange record is created
    // here because partner.status does not change at approval time; the approval
    // event is captured by writeAudit below. The PENDING→ACTIVE transition is
    // recorded by consume() in activationLink.service.ts.
    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        requestStatus: PartnerRequestStatus.APPROVED,
        // Spec §3.2 — stamp onboarding completion the first time the partner
        // gets approved; later approvals (re-activation) don't bump it.
        ...(partner.onboardingCompletedAt ? {} : { onboardingCompletedAt: new Date() }),
        // BC-QA-045-FOLLOWUP-2 (Item 1): clear the ONBOARDING_INACTIVE marker
        // stamped on statusReason by the PATCH /status → ONBOARDING transition
        // above. This route is the only door to APPROVED (partner.status is
        // always PENDING here — see the guards above), so it is the correct
        // owner of retiring that marker. Without this, statusReason stays
        // 'ONBOARDING_INACTIVE' for the rest of the PENDING window between
        // approval and activation-link consumption; setPartnerStatus already
        // clears statusReason to null on every later transition to
        // ACTIVE/ARCHIVED, so the marker was never permanently stuck — it was
        // just stale here.
        statusReason: null,
      },
      select: PARTNER_SELECT,
    });

    // L2 — rate-limit ALL activation-link sends (both initial and re-approve).
    // A rapid second POST /approve bypasses the /resend rate-limit because it
    // uses reason='initial'. Guard against this by checking whether ANY non-consumed
    // link was issued within the last minute, regardless of reason.
    const recentAnyLink = await prisma.activationLink.findFirst({
      where: {
        partnerId: updated.id,
        consumedAt: null,
        createdAt: { gte: new Date(Date.now() - RESEND_RATE_LIMIT_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recentAnyLink) {
      return res.status(429).json({
        error: 'An activation link was issued less than a minute ago. Please wait before issuing another.',
      });
    }

    // Spec §5.2 v1.1 — issue a 72h activation link and email it. We await the
    // link issuance so that on success the API response can confirm a link
    // exists; the email send is still fire-and-forget (a transient SMTP
    // failure shouldn't unwind the approval, admins can resend).
    let issued: Awaited<ReturnType<typeof issueActivationLink>> | null = null;
    let issueError: string | null = null;
    try {
      issued = await issueActivationLink({
        partnerId: updated.id,
        adminId: (req as AuthRequest).user!.id,
        reason: 'initial',
      });
    } catch (err) {
      issueError = String((err as Error)?.message ?? err);
      logger.error('[partner-activation] issue failed:', err);
    }

    const recipientEmail = updated.email ?? updated.user.email ?? null;
    if (issued && recipientEmail) {
      const linkId = issued.linkId;
      const { url, expiresAt } = issued;
      detach(sendActivationEmail({
        email: recipientEmail,
        firstName: updated.user.firstName || updated.businessName,
        businessName: updated.businessName,
        activationUrl: url,
        expiresAt,
      })
        .then(() => stampEmailOutcome(linkId, { sent: true })), (err) => {
          logger.error('[partner-activation] email failed:', err);
          // The failure-stamp is itself a fire-and-forget DB write; register it
          // through detach() so it settles inside this request's test boundary
          // and cannot consume a later, unrelated suite's prisma mock queue.
          detach(stampEmailOutcome(linkId, { sent: false, error: String((err as Error)?.message ?? err) }),
            (e) => logger.error('[partner-activation] stampEmailOutcome (fail) failed:', e));
        });
    } else if (issued && !recipientEmail) {
      // Link issued but no email to send to — stamp the row so the drawer
      // shows the failure state and an admin can fix the email + resend.
      detach(stampEmailOutcome(issued.linkId, { sent: false, error: 'No recipient email on partner record' }),
        (e) => logger.error('[partner-activation] stampEmailOutcome (no-recipient) failed:', e));
    }

    // partner.approved automation fires when the partner clicks the activation link
    // (POST /api/auth/partner/activate), not at admin-approval time. See auth.routes.ts.

    detach(writeAudit({
      actorUserId: (req as AuthRequest).user!.id,
      action: 'partner.approve',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { status: partner.status, requestStatus: partner.requestStatus },
      after: { status: partner.status, requestStatus: PartnerRequestStatus.APPROVED },
    }), (err) => logger.error('[adminPartners] approve writeAudit failed:', err));

    // Spec §5.2 v1.1 — H4 fix: response now reflects the actual outcome of
    // link issuance so the UI can warn the admin to resend (the drawer also
    // surfaces this from /activation-links, but the response is the
    // immediate signal).
    res.json({
      success: true,
      partner: updated,
      activationLink: issued
        ? { issued: true, expiresAt: issued.expiresAt }
        : { issued: false, error: issueError ?? 'Unknown error issuing activation link' },
    });
  })
);

// ─── Resend activation link (spec §5.2 v1.1) ─────────────────────────────────
// Admin-only: regenerate the 72h activation token, invalidating any prior
// unconsumed token, log the resend, and email the new link. Rate-limited
// per-partner so a misclick (or a hostile admin token) can't flood the
// applicant's inbox. RESEND_RATE_LIMIT_MS is declared at module top level
// and shared with the /approve endpoint.
router.post(
  '/:id/resend-activation',
  // Spec §5.2: resend is accessible from both the onboarding pipeline
  // (partners.requests.write) AND the Active Partners section (partners.write).
  requirePermission(['partners.requests.write', 'partners.write']),
  asyncHandler(async (req: AuthRequest, res) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        businessName: true,
        status: true,
        verifiedAt: true,
        user: { select: { email: true, firstName: true } },
      },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    if (partner.verifiedAt) {
      return res.status(400).json({
        error: 'Partner is already activated. Resending an activation link is unnecessary.',
      });
    }
    // Spec §5.2 — resend is valid whenever the partner has an un-consumed activation
    // link regardless of status. PENDING partners are admin-onboarded partners for whom
    // a link was issued but never consumed (consume() advances them to ACTIVE). Blocking
    // resend on PENDING was a bug: the ONLY way forward for those partners IS the link.
    // Block only terminal/irreversible statuses that genuinely cannot be re-activated via link.
    const RESEND_BLOCKED_STATUSES: PartnerStatus[] = [PartnerStatus.ARCHIVED, PartnerStatus.REJECTED];
    if (RESEND_BLOCKED_STATUSES.includes(partner.status)) {
      return res.status(400).json({
        error: `Activation links cannot be resent to a partner with status ${partner.status}.`,
      });
    }

    // Rate limit: don't allow a new link within RESEND_RATE_LIMIT_MS of any
    // prior unconsummed link, regardless of reason. Without this, an admin can
    // call /approve (issues an INITIAL link) and immediately /resend-activation
    // (reason=RESEND), bypassing the per-minute cap because the old check only
    // looked at RESEND-reason links. Checking any reason closes that gap and
    // mirrors the /approve endpoint's own rate-limit query.
    const recentResend = await prisma.activationLink.findFirst({
      where: {
        partnerId: partner.id,
        consumedAt: null,
        createdAt: { gte: new Date(Date.now() - RESEND_RATE_LIMIT_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recentResend) {
      return res.status(429).json({
        error: 'Activation link was resent less than a minute ago. Please wait before resending.',
      });
    }

    const { url, expiresAt, linkId } = await issueActivationLink({
      partnerId: partner.id,
      adminId: req.user!.id,
      reason: 'resend',
    });

    detach(sendActivationEmail({
      email: partner.email ?? partner.user.email,
      firstName: partner.user.firstName || partner.businessName,
      businessName: partner.businessName,
      activationUrl: url,
      expiresAt,
      isResend: true,
    })
      .then(() => stampEmailOutcome(linkId, { sent: true })), (err) => {
        logger.error('[partner-activation] resend email failed:', err);
        detach(stampEmailOutcome(linkId, { sent: false, error: String((err as Error)?.message ?? err) }),
          (e) => logger.error('[partner-activation] stampEmailOutcome (resend-fail) failed:', e));
      });

    // Spec §10.4 — record an explicit AuditLog entry with useful context.
    // auditMiddleware would write after:{} (empty body) for this endpoint;
    // suppress it and write a richer entry instead.
    req.skipAudit = true;
    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.activation-link.resend',
      objectType: 'Partner',
      objectId: partner.id,
      after: { linkId, expiresAt: expiresAt.toISOString(), sentTo: partner.email ?? partner.user.email },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }), (err) => logger.error('[adminPartners] resend writeAudit failed:', err));

    res.json({ success: true, expiresAt });
  })
);

// ─── Activation link history (spec §5.2 v1.1 — admin sees resend audit) ──────
router.get(
  '/:id/activation-links',
  requirePermission('partners.requests.read'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const links = await prisma.activationLink.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ links });
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
    // Mirror NON_APPROVABLE_STATUSES from POST /approve — INACTIVE is post-onboarding
    // (re-activation must go through /partner-status, not the onboarding pipeline).
    const POST_ONBOARDING_STATUSES: PartnerStatus[] = [
      PartnerStatus.ACTIVE, PartnerStatus.INACTIVE, PartnerStatus.PAUSED, PartnerStatus.SUSPENDED, PartnerStatus.ARCHIVED,
    ];
    if (POST_ONBOARDING_STATUSES.includes(partner.status)) {
      return res.status(400).json({ error: 'Cannot reject a post-onboarding partner via this endpoint. Use /partner-status to manage post-onboarding partner statuses.' });
    }

    const [updated] = await prisma.$transaction([
      prisma.partner.update({
        where: { id: req.params.id },
        data: { status: PartnerStatus.REJECTED, requestStatus: PartnerRequestStatus.REJECTED },
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
      prisma.partnerStatusChange.create({
        data: {
          partnerId: req.params.id,
          fromStatus: partner.status,
          toStatus: PartnerStatus.REJECTED,
          reason: reason.trim(),
          changedById: req.user!.id,
        },
      }),
      // Spec §1.6 / §3.5 step 6: Invalidate unconsumed activation links when rejecting
      // a partner. This mirrors the logic in setPartnerStatus (lines 261-271) and prevents
      // the scheduler's remindExpiringActivationLinks from emailing the rejected applicant.
      prisma.activationLink.updateMany({
        where: {
          partnerId: req.params.id,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: new Date() },
      }),
    ]);

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.reject',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { status: partner.status, requestStatus: partner.requestStatus },
      after: { status: PartnerStatus.REJECTED, requestStatus: PartnerRequestStatus.REJECTED, reason: reason.trim() },
    }), (err) => logger.error('[adminPartners] reject writeAudit failed:', err));

    res.json({ success: true, partner: updated, reason });
  })
);

// ─── Edit business category (spec §3.5 / §1.4) ────────────────────────────────
// Allows ADMIN+ to update the partner's business category/type after onboarding.
// Requires partners.requests.write permission.

router.patch(
  '/:id/category',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { category } = req.body as { category?: string };

    if (!category?.trim()) {
      return res.status(400).json({ error: 'category (non-empty string) is required' });
    }

    const categoryTrimmed = category.trim();

    // Validate category against the category registry (spec §3.5 — business category)
    if (!isMainCategoryId(categoryTrimmed) && !isSubcategoryId(categoryTrimmed)) {
      return res.status(400).json({
        error: `Invalid category: "${categoryTrimmed}". Category must be a valid main category (e.g., restaurants, accommodation) or subcategory (e.g., restaurants/fast-food)`,
      });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { id: true, businessName: true, category: true, status: true },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    // Spec §3.5 — category edits are only valid for ACTIVE partners
    if (partner.status !== PartnerStatus.ACTIVE) {
      return res.status(400).json({
        error: `Cannot edit category of non-ACTIVE partner. Partner must be ACTIVE. Current status: ${partner.status}. Use /partner-status to change the partner's operational status first.`,
        currentStatus: partner.status,
      });
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { category: categoryTrimmed },
      select: PARTNER_SELECT,
    });

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.category.update',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { category: partner.category },
      after: { category: categoryTrimmed },
    }), (err) => logger.error('[adminPartners] category writeAudit failed:', err));

    res.json({ partner: updated });
  })
);

// ─── Toggle visibility (spec §8.1 rule 7) ─────────────────────────────────────
// Allows visibility control on ACTIVE partners only. Visibility has no effect
// on non-ACTIVE partners per spec §8.1 rule 7 (status overrides visibility).

router.patch(
  '/:id/visibility',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { isVisible } = req.body as { isVisible?: boolean };
    if (typeof isVisible !== 'boolean') return res.status(400).json({ error: 'isVisible (boolean) is required' });

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    // Spec §8.1 rule 7 — visibility is meaningful only for ACTIVE partners.
    // Reject toggle attempts on non-ACTIVE partners to maintain data hygiene.
    if (partner.status !== PartnerStatus.ACTIVE) {
      return res.status(400).json({
        error: `Visibility toggle is only valid for ACTIVE partners. Current status: ${partner.status}. Use /partner-status to change the partner's operational status first.`,
        currentStatus: partner.status,
      });
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { isVisible },
      select: PARTNER_SELECT,
    });

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.visibility.update',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { isVisible: partner.isVisible },
      after: { isVisible },
    }), (err) => logger.error('[adminPartners] visibility writeAudit failed:', err));

    res.json({ partner: updated });
  })
);

// ─── Active-partner status (spec 5.3) ─────────────────────────────────────────

// Spec §5.3 v1.1 matrix — these four are the post-onboarding statuses an admin
// can move a partner between. ACTIVE = full operational, INACTIVE = read-only
// no new tx, SUSPENDED (Спрян) = temporarily blocked, ARCHIVED = permanently
// deactivated. PAUSED is retained as an alias for SUSPENDED for back-compat.
const ACTIVE_PARTNER_STATUSES: PartnerStatus[] = [
  PartnerStatus.ACTIVE,
  PartnerStatus.INACTIVE,
  PartnerStatus.PAUSED,
  PartnerStatus.SUSPENDED,
  PartnerStatus.ARCHIVED,
];

router.patch(
  '/:id/partner-status',
  requirePermission('partners.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { status, reason } = req.body as { status?: string; reason?: string };

    if (!status || !ACTIVE_PARTNER_STATUSES.includes(status as PartnerStatus)) {
      return res.status(400).json({
        error: 'status must be one of: ACTIVE, INACTIVE, PAUSED, SUSPENDED, ARCHIVED',
      });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, firstName: true } } },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    if (!ACTIVE_PARTNER_STATUSES.includes(partner.status)) {
      return res.status(400).json({ error: 'This endpoint only manages post-onboarding partners. Use the onboarding pipeline for partners not yet active.' });
    }

    if (partner.status === status) {
      return res.status(400).json({ error: `Partner is already in ${status} state` });
    }

    // Spec §5.3 / §5.4 v1.1 — delegate to the centralized helper. Status flip
    // + PartnerStatusChange row are written atomically. QR "auto-deactivation"
    // is an atomic DB write inside setPartnerStatus's transaction
    // (partner.service.syncQrCodesForPartnerTx); the scan-time isPartnerOperationallyActive
    // gate is defense-in-depth.
    const change = await partnerService.setPartnerStatus({
      partnerId: req.params.id,
      toStatus: status as PartnerStatus,
      reason,
      changedById: req.user!.id,
    });

    // Spec §10.4 — record an AuditLog entry with actor metadata. The
    // PartnerStatusChange row above is the user-facing history; this is the
    // append-only admin audit trail.
    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.status.update',
      objectType: 'Partner',
      objectId: req.params.id,
      before: { status: change.fromStatus },
      after: {
        status: change.toStatus,
        reason: reason?.trim() || null,
      },
    }), (err) => logger.error('[adminPartners] writeAudit failed:', err));

    // Spec §8.2 v1.1 — notify the partner by email about the status change.
    // Prefer the partner contact email, fall back to the linked user account.
    // Fire-and-forget: a delivery failure must not roll back the status move.
    const notifyTo = partner.email || partner.user?.email || null;
    if (notifyTo) {
      detach(emailService
        .sendPartnerStatusChangeEmail(notifyTo, {
          firstName: partner.user?.firstName || partner.businessName,
          businessName: partner.businessName,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          reason: reason ?? null,
        }), (err) => logger.error('[adminPartners] partner status email failed:', err));
    } else {
      logger.warn(`[adminPartners] partner ${req.params.id} has no contact email — status change email skipped`);
    }

    const updated = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: PARTNER_SELECT,
    });

    res.json({ partner: updated });
  })
);

// Spec §5.3 v1.1 — partner status-change history for the admin "История" tab.
// Reads pair with the partners.write status PATCH that writes the rows; the
// drawer's "История на промени" panel needs both, so we gate on the read
// permission of the same domain (partners.read).
router.get(
  '/:id/status-history',
  requirePermission('partners.read'),
  asyncHandler(async (req, res) => {
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    const entries = await prisma.partnerStatusChange.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Hydrate the actor (no FK relation defined — mirrors assignedAdminId pattern).
    const actorIds = Array.from(
      new Set(entries.map((e) => e.changedById).filter((x): x is string => !!x))
    );
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    res.json({
      entries: entries.map((e) => ({
        ...e,
        actor: e.changedById ? actorMap.get(e.changedById) ?? null : null,
      })),
    });
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
      where: { objectType: { in: ['Partner', 'partner'] }, objectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    res.json({ entries });
  })
);

// NOTE: The legacy POST /:id/activation-link/resend endpoint that lived here
// was removed. It hand-built a broken URL (`/activate/<token>` instead of the
// real partner-side route `/partner/activate?token=...`), used a different
// permission key (partners.write vs partners.requests.write), and duplicated
// the resend logic. The canonical resend is POST /:id/resend-activation
// above.

// ─── Propose discount-rate change (spec §13 PARTNER_MANAGER path) ─────────────
// PARTNER_MANAGER lacks partners.write so cannot call PATCH /:id/discount-rate directly.
// This endpoint lets them propose a rate change which lands in CriticalActionRequest
// (actionType='DISCOUNT_RATE_CHANGE').  A SUPER_ADMIN must approve via
// POST /api/admin/admins/critical-actions/:id/approve — approval atomically writes
// the new rate to the partner row.
router.post(
  '/:id/propose-discount-rate',
  requirePermission('partners.requests.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { rate, note } = req.body as { rate?: number | null; note?: string };

    if (rate === undefined) {
      return res.status(400).json({ error: 'rate is required (pass null to clear the override)' });
    }

    if (rate !== null) {
      if (!CASHBACK_MATRIX_STEPS.includes(rate as (typeof CASHBACK_MATRIX_STEPS)[number])) {
        return res.status(400).json({
          error: `rate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}, or null to clear`,
        });
      }
    }

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: { partnerType: { select: { maxDiscountRate: true } } },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    if (rate !== null && partner.partnerType?.maxDiscountRate != null) {
      if (rate > partner.partnerType.maxDiscountRate) {
        return res.status(400).json({
          error: `rate (${rate}%) exceeds the maximum for this partner type (${partner.partnerType.maxDiscountRate}%)`,
        });
      }
    }

    // Prevent duplicate PENDING proposals for the same partner
    const existingPending = await prisma.criticalActionRequest.findFirst({
      where: {
        actionType: 'DISCOUNT_RATE_CHANGE',
        status: 'PENDING',
        payload: { path: ['partnerId'], equals: req.params.id },
      },
    });
    if (existingPending) {
      return res.status(409).json({
        error: 'A PENDING discount-rate proposal already exists for this partner',
        existingId: existingPending.id,
      });
    }

    const proposal = await prisma.criticalActionRequest.create({
      data: {
        actionType: 'DISCOUNT_RATE_CHANGE',
        payload: {
          partnerId: req.params.id,
          partnerName: partner.businessName,
          currentRate: partner.discountRate,
          proposedRate: rate,
        },
        note: note?.trim() || null,
        requestedById: req.user!.id,
        status: 'PENDING',
      },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    detach(writeAudit({
      actorUserId: req.user!.id,
      action: 'partner.discount-rate.propose',
      objectType: 'Partner',
      objectId: req.params.id,
      after: { proposalId: proposal.id, proposedRate: rate },
    }), (err) => logger.error('[adminPartners] writeAudit failed:', err));

    res.status(201).json({ proposal });
  })
);

// ─── Partner risk flag ────────────────────────────────────────────────────────

/**
 * PATCH /api/admin/partners/:id/risk-flag
 *
 * Set or clear the partner-level risk flag (spec §2.1 Signal 5 — +10 fraud points).
 * Requires control.risk.write (RISK_REVIEW role). Inactive admins (aro=true) are
 * blocked by requirePermission's write-suffix guard automatically.
 *
 * Body: { flagValue: boolean, reason: string }
 * Response: { success: true, flagValue: boolean }
 */
router.patch(
  '/:id/risk-flag',
  requirePermission('control.risk.write'),
  asyncHandler(async (req: AuthRequest, res) => {
    const { flagValue, reason } = req.body as { flagValue?: unknown; reason?: unknown };

    if (typeof flagValue !== 'boolean') {
      return res.status(400).json({ error: 'flagValue (boolean) is required' });
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'reason (non-empty string) is required' });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { id: true, businessName: true },
    });
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    // VenueFraudConfig.venueId stores Partner.id (not Venue.id) — pass partner.id directly.
    await fraudDetectionService.setPartnerRiskFlag(
      partner.id,
      flagValue,
      req.user!.id,
      reason.trim(),
      req.ip,
      req.get('user-agent') ?? undefined,
    );

    res.json({ success: true, flagValue });
  })
);

export default router;
