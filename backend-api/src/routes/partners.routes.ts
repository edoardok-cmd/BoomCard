/**
 * Partners Routes
 *
 * Security model:
 * - Public GET endpoints are visible to all users.
 * - Offer redemption is gated by subscription plan (enforced in offers.service.ts).
 * - Partner profile edits require ownership (PARTNER role + own record) or ADMIN.
 * - Partner creation (POST) is ADMIN-only.
 * - Partner type assignment is ADMIN-only and determines the maximum discount %.
 *
 * Partner types and their rates are managed dynamically via /api/admin/partner-types.
 */

import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, optionalAuthenticate, AuthRequest } from '../middleware/auth.middleware';
import { requireActivePartnerForWritesAuthed } from '../middleware/partnerStatus.middleware';
import { prisma } from '../lib/prisma';
import { CashbackPaymentStatus, LocationType, OfferStatus, PartnerRequestStatus, PartnerStatus, ScanStatus, UserStatus } from '@prisma/client';
import { partnerTypeService } from '../services/partnerType.service';
import { CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { fireAutomation } from '../lib/automationDispatcher';
import { findInvalidCategoryEntry } from '../constants/categoryRegistry';
import { writeAudit } from '../middleware/audit.middleware';
import { issueActivationLink, sendActivationEmail, stampEmailOutcome } from '../services/partnerActivation.service';
import { partnerService } from '../services/partner.service';
import { notificationService } from '../services/notification.service';
import { publicPartnerFilter } from '../services/publicPartnerFilter';
import { parsePagination } from '../utils/pagination';
import { detach } from '../utils/detach';
import { isCurrencyTransitionWindowOpen, toDualCurrency } from '../utils/currencyDisplay';

/**
 * Normalize a categories[] payload alongside its main category id.
 * Returns the validated, deduplicated array (always including the main id),
 * or throws an HTTP-400-style error message string if invalid.
 *
 * Pass-through if `categoriesInput` is undefined/null and we have a main id —
 * we mirror the legacy `[mainCategory]` behavior.
 */
function normalizePartnerCategories(
  mainCategory: string,
  categoriesInput: unknown,
): { value: string[]; error: null } | { value: null; error: string } {
  const list: string[] = Array.isArray(categoriesInput)
    ? categoriesInput.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(Boolean)
    : [];
  // Always include the main category id; admins/partners may submit only the subs.
  const merged = Array.from(new Set([mainCategory, ...list]));
  const invalid = findInvalidCategoryEntry(mainCategory, merged);
  if (invalid) {
    return { value: null, error: `Invalid category value: ${invalid}` };
  }
  return { value: merged, error: null };
}

/**
 * Coerce an unknown value into a non-negative integer, defaulting to 0.
 * Used for the `tables` / `cashDesks` fields on a venue payload.
 */
function normalizeInt(v: unknown): number {
  const n = typeof v === 'number' ? v : v === undefined || v === null || v === '' ? NaN : Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Like normalizeInt but preserves the "absent" signal as null.
 * Used for `capacity` (venues may genuinely have no capacity recorded).
 */
function normalizeIntOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

const PARTNER_TYPE_SELECT = {
  id: true,
  name: true,
  nameBg: true,
  color: true,
  maxDiscountRate: true,
} as const;

/**
 * Spec §1.1 — the public/partner-facing API exposes ONLY the canonical
 * three-value status enum (ACTIVE | INACTIVE | ARCHIVED). The DB carries
 * additional internal sub-states (PAUSED, SUSPENDED, PENDING, REJECTED) that
 * are implementation details and must never be serialised into a
 * partner-visible response.
 *
 * Mapping (kept in sync with partnerStatus.middleware.toCanonicalStatus):
 *   ACTIVE                                   → ACTIVE
 *   INACTIVE | PAUSED | SUSPENDED | PENDING  → INACTIVE
 *   ARCHIVED | REJECTED                      → ARCHIVED
 *
 * PENDING maps to INACTIVE (not ARCHIVED): it is the onboarding read-only
 * stage, not a closed/terminated account — mapping it to ARCHIVED would
 * trigger "account closed" UI for a partner that is merely awaiting activation.
 */
// Spec §1.1/§14.1: the partner-facing API exposes the canonical status as the
// TITLE-CASE literal Active | Inactive | Archived (matching the frontend
// PartnerStatusRoute contract and partner_account_status on /auth/me). This is
// the API-response mapper only; partner.service has its own UPPERCASE variant for
// the notification-canonicalization Set-check — keep them separate.
export function toCanonicalPartnerStatus(s: string): 'Active' | 'Inactive' | 'Archived' {
  if (s === 'ACTIVE') return 'Active';
  if (s === 'INACTIVE' || s === 'PAUSED' || s === 'SUSPENDED' || s === 'PENDING') return 'Inactive';
  return 'Archived'; // ARCHIVED, REJECTED only
}

const router = Router();

// Spec §5.3 v1.1 — PARTNER role write operations are blocked when the linked
// Partner.status != ACTIVE. Read methods (GET/HEAD/OPTIONS) bypass so an
// Inactive partner can still view their data. Admin roles bypass entirely.
// Mounted at router level for breadth; the middleware is a no-op for
// admin-only or public-GET paths.
//
// HIGH (security) fix: use the *Authed wrapper. The bare gate, mounted here at
// the top, ran BEFORE each route's own authenticate, so req.user was undefined
// and the gate's `if (!user) return next()` bypassed it for every write. The
// wrapper runs authenticate first (only when an Authorization header is present)
// so an Inactive partner's writes are correctly blocked; tokenless writes still
// fall through to the route's own auth handling.
router.use(requireActivePartnerForWritesAuthed);

// ----------------------------------------------------------------
// GET /api/partners
// Public — all partners visible to everyone
// ----------------------------------------------------------------
router.get(
  '/',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { category, city, status, search, partnerTypeId,
            verifiedAfter, onboardingCompletedAfter } = req.query as Record<string, string>;

    // Spec §1.4 and §12 rule 2: non-admin callers ALWAYS see only ACTIVE +
    // verifiedAt + isVisible partners. Only ADMIN/SUPER_ADMIN may use ?status=
    // to override the visibility gate.
    const callerIsAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    // Validate admin-supplied status against enum to prevent PrismaClientValidationError 500
    const validStatuses = Object.values(PartnerStatus) as string[];
    if (callerIsAdmin && status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status value. Must be one of: ${validStatuses.join(', ')}` });
    }
    // L4 — reuse the shared publicPartnerFilter (status=ACTIVE + verifiedAt + isVisible)
    // for the non-admin path instead of duplicating the §5.3 visibility gate inline.
    // Admins with an explicit ?status= bypass the gate (status only); everyone else
    // gets the full shared filter so the public matrix stays consistent across routes.
    const where: any =
      callerIsAdmin && status
        ? { status }
        : { ...publicPartnerFilter };
    if (category) {
      // Match on the categories array (new records) OR the category field (legacy records with empty array)
      if (!where.AND) where.AND = [];
      where.AND.push({ OR: [{ categories: { has: category } }, { category }] });
    }
    if (city) where.city = city;
    if (partnerTypeId) where.partnerTypeId = partnerTypeId;
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { businessNameBg: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (verifiedAfter) {
      const from = new Date(verifiedAfter);
      // verifiedAfter narrows an already-existing verifiedAt filter (set by the
      // §5.3 gate above). Convert to AND so we don't overwrite "not: null".
      if (!isNaN(from.getTime())) {
        where.AND = where.AND ?? [];
        where.AND.push({ verifiedAt: { gte: from } });
      }
    }
    if (onboardingCompletedAfter) {
      const from = new Date(onboardingCompletedAfter);
      if (!isNaN(from.getTime())) where.onboardingCompletedAt = { gte: from };
    }

    const { page: pageNum, limit: limitNum, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        select: {
          id: true,
          businessName: true,
          businessNameBg: true,
          category: true,
          categories: true,
          partnerType: { select: PARTNER_TYPE_SELECT },
          status: true,
          city: true,
          region: true,
          logo: true,
          coverImage: true,
          rating: true,
          reviewCount: true,
          website: true,
          joinedAt: true,
          _count: { select: { venues: true } },
        },
        orderBy: [{ rating: 'desc' }],
        skip,
        take: limitNum,
      }),
      prisma.partner.count({ where }),
    ]);

    // LOW (spec §1.1) — non-admin callers receive the canonical title-case
    // status enum (Active|Inactive|Archived), consistent with GET /:id and
    // GET /me. The §5.3 gate above already restricts non-admins to ACTIVE
    // partners, so this is defence-in-depth against an internal sub-state ever
    // leaking; admins keep the raw uppercase status for ops visibility.
    const data = partners.map(({ _count, ...p }) => ({
      ...p,
      status: callerIsAdmin ? p.status : toCanonicalPartnerStatus(p.status),
      venueCount: _count.venues,
    }));

    res.json({
      success: true,
      data,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/me
// Returns the authenticated partner user's own profile
// ----------------------------------------------------------------
router.get(
  '/me',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        businessName: true,
        businessNameBg: true,
        category: true,
        categories: true,
        description: true,
        descriptionBg: true,
        logo: true,
        coverImage: true,
        city: true,
        region: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        openingHours: true,
        rating: true,
        reviewCount: true,
        discountRate: true,
        joinedAt: true,
        verifiedAt: true,
        isVisible: true,
        status: true,
        partnerType: { select: PARTNER_TYPE_SELECT },
        offers: { where: { status: 'ACTIVE' }, select: { id: true, title: true, discountPercent: true, status: true } },
        venues: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            menuUrl: true,
            pendingMenuUrl: true,
            menuStatus: true,
            menuRejectionReason: true,
            menuSubmittedAt: true,
            menuReviewedAt: true,
          },
        },
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner profile not found' });
    }

    // Normalize to spec §1.1 canonical enum (Active|Inactive|Archived)
    const apiStatus = toCanonicalPartnerStatus(partner.status);

    const typeMaxDiscount = partner.partnerType?.maxDiscountRate ?? null;

    res.json({
      success: true,
      data: {
        ...partner,
        status: apiStatus,
        typeMaxDiscountPercent: typeMaxDiscount,
        effectiveDiscountRate: partner.discountRate ?? typeMaxDiscount,
      },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/me/analytics?days=30
// Returns real scan analytics aggregated across the partner's venues
// ----------------------------------------------------------------
router.get(
  '/me/analytics',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Clamp to [1, 365] — a negative/zero days would build a future/empty window.
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);

    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, venues: { select: { id: true, name: true } } },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner profile not found' });
    }

    const venueIds = partner.venues.map(v => v.id);

    if (venueIds.length === 0) {
      const windowOpenEmpty = await isCurrencyTransitionWindowOpen();
      const { windowOpen: _wSE, ...totalSavingsDisplayEmpty } = toDualCurrency(0, windowOpenEmpty);
      return res.json({
        success: true,
        data: {
          period: { days, startDate: new Date(), endDate: new Date() },
          stats: {
            ...(windowOpenEmpty && { totalSavings: 0 }),
            totalSavingsDisplay: totalSavingsDisplayEmpty,
            activeCards: 0,
            totalUses: 0,
            avgDiscount: 0,
          },
          changes: { totalSavings: 0, activeCards: 0, totalUses: 0, avgDiscount: 0 },
          timeSeries: [],
          byVenue: [],
        },
      });
    }

    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);

    const [currentScans, previousScans, activeOffers] = await Promise.all([
      prisma.stickerScan.findMany({
        where: { venueId: { in: venueIds }, createdAt: { gte: currentStart } },
        select: {
          id: true,
          venueId: true,
          cardId: true,
          cashbackAmount: true,
          // cashbackPercent omitted — internal Business Formula component (spec §11.3, Clash 10.6)
          status: true,
          createdAt: true,
        },
      }),
      prisma.stickerScan.findMany({
        where: { venueId: { in: venueIds }, createdAt: { gte: previousStart, lt: currentStart } },
        select: { cardId: true, cashbackAmount: true, status: true },
      }),
      // avgDiscount is the average customer-facing discount across the partner's
      // currently-ACTIVE offers (the public discountPercent, NOT the internal
      // cashbackPercent component). It is a configuration figure rather than a
      // time-series metric, so changes.avgDiscount is reported as 0 below.
      prisma.offer.findMany({
        where: { partnerId: partner.id, status: OfferStatus.ACTIVE },
        select: { discountPercent: true },
      }),
    ]);

    const approved = currentScans.filter(s => s.status === ScanStatus.APPROVED);
    const prevApproved = previousScans.filter(s => s.status === ScanStatus.APPROVED);

    const totalSavings = approved.reduce((sum, s) => sum + s.cashbackAmount, 0);
    const activeCards = new Set(approved.map(s => s.cardId).filter(Boolean)).size;
    const totalUses = approved.length;

    const prevSavings = prevApproved.reduce((sum, s) => sum + s.cashbackAmount, 0);
    const prevCards = new Set(prevApproved.map(s => s.cardId).filter(Boolean)).size;
    const prevUses = prevApproved.length;

    // Average customer-facing discount across active offers (configuration figure).
    const discountValues = activeOffers
      .map(o => o.discountPercent)
      .filter((d): d is number => typeof d === 'number');
    const avgDiscount = discountValues.length > 0
      ? Math.round((discountValues.reduce((sum, d) => sum + d, 0) / discountValues.length) * 10) / 10
      : 0;

    const pctChange = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 1000) / 10;

    // Time series — group by day (7d/30d), by week (90d), by month (1y)
    const buckets: Record<string, { label: string; savings: number; uses: number }> = {};
    const bucketKey = (date: Date) => {
      if (days <= 30) {
        return date.toISOString().slice(0, 10);
      } else if (days <= 90) {
        const d = new Date(date);
        d.setDate(d.getDate() - d.getDay());
        return d.toISOString().slice(0, 10);
      } else {
        return date.toISOString().slice(0, 7);
      }
    };
    const bucketLabel = (key: string) => {
      if (days <= 30) {
        const d = new Date(key);
        return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      } else if (days <= 90) {
        const d = new Date(key);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      } else {
        const [y, m] = key.split('-');
        return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short' });
      }
    };

    for (const scan of approved) {
      const key = bucketKey(scan.createdAt);
      if (!buckets[key]) buckets[key] = { label: bucketLabel(key), savings: 0, uses: 0 };
      buckets[key].savings = Math.round((buckets[key].savings + scan.cashbackAmount) * 100) / 100;
      buckets[key].uses += 1;
    }
    const timeSeries = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // By venue breakdown
    const COLORS = ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const venueTotals: Record<string, number> = {};
    for (const scan of approved) {
      venueTotals[scan.venueId] = (venueTotals[scan.venueId] || 0) + scan.cashbackAmount;
    }
    const sortedVenues = partner.venues
      .map((v) => ({
        venueId: v.id,
        venueName: v.name,
        savings: Math.round((venueTotals[v.id] || 0) * 100) / 100,
      }))
      .filter(v => v.savings > 0)
      .sort((a, b) => b.savings - a.savings);
    let runningPct = 0;
    const byVenue = sortedVenues.map((v, i, arr) => {
      const isLast = i === arr.length - 1;
      const percentage = totalSavings > 0
        ? (isLast ? 100 - runningPct : Math.round((v.savings / totalSavings) * 100))
        : 0;
      if (!isLast) runningPct += percentage;
      return { ...v, color: COLORS[i % COLORS.length], percentage };
    });

    const windowOpen = await isCurrencyTransitionWindowOpen();
    const roundedSavings = Math.round(totalSavings * 100) / 100;
    const { windowOpen: _wS, ...totalSavingsDisplay } = toDualCurrency(roundedSavings, windowOpen);

    res.json({
      success: true,
      data: {
        period: { days, startDate: currentStart, endDate: now },
        stats: {
          ...(windowOpen && { totalSavings: roundedSavings }),
          totalSavingsDisplay,
          activeCards,
          totalUses,
          avgDiscount,
        },
        changes: {
          totalSavings: pctChange(totalSavings, prevSavings),
          activeCards: pctChange(activeCards, prevCards),
          totalUses: pctChange(totalUses, prevUses),
          // avgDiscount is a configuration figure (active-offer average), not a
          // period-comparable metric, so there is no meaningful period delta.
          avgDiscount: 0,
        },
        timeSeries: timeSeries.map(({ savings, ...rest }) => {
          const { windowOpen: _wTS, ...savingsDisplay } = toDualCurrency(savings, windowOpen);
          return { ...rest, ...(windowOpen && { savings }), savingsDisplay };
        }),
        byVenue: byVenue.map(({ savings, ...rest }) => {
          const { windowOpen: _wBV, ...savingsDisplay } = toDualCurrency(savings, windowOpen);
          return { ...rest, ...(windowOpen && { savings }), savingsDisplay };
        }),
      },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/me/stickers — spec §5.4 v1.1
// Partner-side READ-ONLY view of their own venues + sticker QR codes.
// Returns each venue with the status mirror of:
//   - sticker config (Активен / В обработка / Неактивен)
//   - sticker count
//   - the partner's overall status (since QR is gated on Partner.status=ACTIVE)
// Partners cannot manage QR codes from this endpoint; admin is source of truth.
// ----------------------------------------------------------------
router.get(
  '/me/stickers',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        status: true,
        verifiedAt: true,
        venues: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            venueStatus: true,
            stickerConfig: { select: { isActive: true, updatedAt: true } },
            stickers: {
              select: {
                id: true,
                // stickerId omitted — raw QR token, spec §4.3/§11.3
                status: true,
                locationType: true,
                location: { select: { name: true, locationNumber: true } },
                lastScannedAt: true,
                totalScans: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner profile not found' });
    }

    // Spec §5.4 — operational status mirror per venue. The partner-side panel
    // shows a single display-status badge per sticker derived from the partner
    // status + the sticker row's status. Spec-defined display labels:
    //   Активен      → ACTIVE (partner operationally active + sticker ACTIVE)
    //   Неактивен    → partner not ACTIVE, OR sticker INACTIVE/DAMAGED
    //   В обработка  → sticker PENDING or PROCESSING (ordered, not yet deployed)
    //   Заменен      → sticker RETIRED or REPLACED (physically swapped out)
    const partnerOperationallyActive = partner.status === 'ACTIVE' && !!partner.verifiedAt;

    // Map raw StickerStatus enum values to the spec's four display labels.
    const toDisplayStatus = (stickerStatus: string): string => {
      if (!partnerOperationallyActive) return 'INACTIVE';
      switch (stickerStatus) {
        case 'ACTIVE':     return 'ACTIVE';
        case 'INACTIVE':
        case 'DAMAGED':    return 'INACTIVE';
        case 'PENDING':
        case 'PROCESSING': return 'PROCESSING';
        case 'RETIRED':
        case 'REPLACED':   return 'REPLACED';
        default:           return 'INACTIVE';
      }
    };

    const venues = partner.venues.map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      city: v.city,
      venueStatus: v.venueStatus,
      stickerConfigActive: v.stickerConfig?.isActive ?? false,
      stickerConfigUpdatedAt: v.stickerConfig?.updatedAt ?? null,
      stickers: v.stickers.map((s) => ({
        ...s,
        displayStatus: toDisplayStatus(s.status),
      })),
    }));

    res.json({
      success: true,
      data: {
        // Spec §1.1 — canonicalize so internal sub-states (PAUSED/SUSPENDED/
        // PENDING/REJECTED) never leak to the partner-facing client.
        partnerStatus: toCanonicalPartnerStatus(partner.status),
        partnerActivated: !!partner.verifiedAt,
        readonlyNotice: 'QR кодовете се управляват от BoomCard администратор. Изпратете заявка чрез „Заяви промяна" за корекции.',
        venues,
      },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/me/transactions — spec §6 / BC-PARTNER-PORTAL-SCOPE-B B1
// Partner-scoped, read-only list of StickerScan rows across the partner's own
// venues. Paginated + filterable (date range, venue, status, amount).
//
// Security (spec §11.3 / prior partner-portal audit): an explicit `select`
// allowlist is used so NO internal field (cashbackPercent, cashbackAmount,
// fraudScore, fraudReasons, specRiskLevel, ipAddress, userAgent, latitude,
// longitude, distance, deviceFingerprint*, ocrData, stickerId, userId, cardId,
// receiptImage*) can ever leak. Scoped strictly to Partner.userId === req.user.id
// — there is no :id param, so cross-partner access is structurally impossible.
// Per-scan cashbackPercent is internal and is NOT exposed; an offer-level
// discount is not cheaply joinable per scan (StickerScan has no offer FK), so
// the optional `discountPercent` column is omitted entirely (frontend shows "—").
// ----------------------------------------------------------------
router.get(
  '/me/transactions',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    if (!partner) {
      return res.status(403).json({ success: false, error: 'No partner context for this account' });
    }

    const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const {
      dateFrom, dateTo, venueId, status, minAmount, maxAmount,
    } = req.query as Record<string, string>;

    // Scope every scan to a venue owned by THIS partner.
    const where: any = { venue: { partnerId: partner.id } };

    // Optional venue filter — additionally constrained to ownership above, so a
    // foreign venueId simply yields zero rows (no cross-partner leak).
    if (venueId) where.venueId = venueId;

    if (status) {
      const validStatuses = Object.values(ScanStatus) as string[];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status value. Must be one of: ${validStatuses.join(', ')}`,
        });
      }
      where.status = status;
    }

    // Date range on createdAt (ISO strings). Invalid dates are ignored.
    const createdAt: any = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) createdAt.gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) createdAt.lte = to;
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    // Amount filters apply to the partner-visible amount, which is
    // verifiedAmount ?? billAmount. Prisma cannot express the COALESCE in a
    // single field filter, so we OR the two candidates: a row matches if its
    // verifiedAmount is in range, or (verifiedAmount is null and billAmount is
    // in range). This keeps server-side filtering consistent with the rendered
    // `amount` value.
    const minNum = minAmount !== undefined && minAmount !== '' ? Number(minAmount) : undefined;
    const maxNum = maxAmount !== undefined && maxAmount !== '' ? Number(maxAmount) : undefined;
    const hasMin = minNum !== undefined && Number.isFinite(minNum);
    const hasMax = maxNum !== undefined && Number.isFinite(maxNum);
    if (hasMin || hasMax) {
      const range: any = {};
      if (hasMin) range.gte = minNum;
      if (hasMax) range.lte = maxNum;
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { verifiedAmount: range },
            { verifiedAmount: null, billAmount: range },
          ],
        },
      ];
    }

    const [scans, total] = await Promise.all([
      prisma.stickerScan.findMany({
        where,
        // Explicit allowlist — internal fields are intentionally absent.
        select: {
          id: true,
          createdAt: true,
          venueId: true,
          billAmount: true,
          verifiedAmount: true,
          status: true,
          transactionId: true,
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.stickerScan.count({ where }),
    ]);

    const windowOpen = await isCurrencyTransitionWindowOpen();

    const data = scans.map((s) => {
      const rawAmount = s.verifiedAmount ?? s.billAmount;
      const { windowOpen: _wT, ...amountDisplay } = toDualCurrency(rawAmount ?? 0, windowOpen);
      return {
        id: s.id,
        createdAt: s.createdAt,
        venueId: s.venueId,
        venueName: s.venue?.name ?? null,
        ...(windowOpen && rawAmount != null && { amount: rawAmount }),
        amountDisplay,
        status: s.status,
        transactionId: s.transactionId,
      };
    });

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/me/finance — spec §7.1 / BC-PARTNER-PORTAL-SCOPE-B B2
// Partner-scoped PartnerCashbackPayment rows, newest month first, joined to the
// ReportingPeriod.status (by month) for the §7.2 period state.
//
// Security: explicit `select` allowlist omits the internal fields marginAmount,
// paidBy, notes, partnerId. Scoped to Partner.userId === req.user.id; no :id
// param. Feeds BOTH §7.1 tables (Месечни справки + История на плащания).
// ----------------------------------------------------------------
router.get(
  '/me/finance',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });

    if (!partner) {
      return res.status(403).json({ success: false, error: 'No partner context for this account' });
    }

    const payments = await prisma.partnerCashbackPayment.findMany({
      where: { partnerId: partner.id },
      // Explicit allowlist — marginAmount / paidBy / notes / partnerId omitted.
      select: {
        month: true,
        turnoverAmount: true,
        contractedRate: true,
        totalCashbackOwed: true,
        status: true,
        paidAt: true,
        invoiceNumber: true,
      },
      orderBy: { month: 'desc' },
    });

    // Join ReportingPeriod.status by month (global per-month period state).
    const months = payments.map((p) => p.month);
    const periods = months.length > 0
      ? await prisma.reportingPeriod.findMany({
          where: { month: { in: months } },
          select: { month: true, status: true },
        })
      : [];
    const periodStatusByMonth = new Map(periods.map((p) => [p.month, p.status]));
    const windowOpen = await isCurrencyTransitionWindowOpen();

    const data = payments.map((p) => {
      const { windowOpen: _wF1, ...turnoverAmountDisplay } = toDualCurrency(p.turnoverAmount ?? 0, windowOpen);
      const { windowOpen: _wF2, ...totalCashbackOwedDisplay } = toDualCurrency(p.totalCashbackOwed ?? 0, windowOpen);
      return {
        month: p.month,
        ...(windowOpen && { turnoverAmount: p.turnoverAmount }),
        turnoverAmountDisplay,
        contractedRate: p.contractedRate,
        ...(windowOpen && { totalCashbackOwed: p.totalCashbackOwed }),
        totalCashbackOwedDisplay,
        status: p.status,
        paidAt: p.paidAt,
        invoiceNumber: p.invoiceNumber,
        periodStatus: periodStatusByMonth.get(p.month) ?? null,
      };
    });

    res.json({ success: true, data });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/:id/stats
// Owner (PARTNER role + own record) or ADMIN — aggregate KPIs for the partner dashboard.
// ----------------------------------------------------------------
router.get(
  '/:id/stats',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, rating: true, reviewCount: true },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    const isOwner = partner.userId === req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const now = new Date();
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [venues, totalOffers, activeOffers, approvedScans, monthScans, totalVisits, expectedAgg] = await Promise.all([
      prisma.venue.findMany({ where: { partnerId: partner.id }, select: { id: true } }),
      prisma.offer.count({ where: { partnerId: partner.id } }),
      prisma.offer.count({
        where: {
          partnerId: partner.id,
          status: OfferStatus.ACTIVE,
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),
      prisma.stickerScan.findMany({
        where: {
          venue: { partnerId: partner.id },
          status: ScanStatus.APPROVED,
        },
        select: { cashbackAmount: true },
      }),
      prisma.stickerScan.count({
        where: {
          venue: { partnerId: partner.id },
          status: ScanStatus.APPROVED,
          createdAt: { gte: monthAgo },
        },
      }),
      // BC-PARTNER-PORTAL-SCOPE-B B3 — §5.3 "Брой посещения": total scans for
      // this partner across ALL statuses (every visit/scan event, not only
      // approved). This is the truest "visits" count; totalRedemptions above
      // remains the approved-only KPI used elsewhere.
      prisma.stickerScan.count({
        where: { venue: { partnerId: partner.id } },
      }),
      // BC-PARTNER-PORTAL-SCOPE-B B3 — §5.3 "Очаквани суми": sum of cashback
      // owed that is not yet paid (PENDING or OVERDUE). Uses totalCashbackOwed
      // only — marginAmount and other internal fields are never read here.
      prisma.partnerCashbackPayment.aggregate({
        where: {
          partnerId: partner.id,
          status: { in: [CashbackPaymentStatus.PENDING, CashbackPaymentStatus.OVERDUE] },
        },
        _sum: { totalCashbackOwed: true },
      }),
    ]);

    const revenue = approvedScans.reduce((sum, s) => sum + s.cashbackAmount, 0);
    const expectedAmount = expectedAgg._sum.totalCashbackOwed ?? 0;
    const windowOpen = await isCurrencyTransitionWindowOpen();
    const roundedRevenue = Math.round(revenue * 100) / 100;
    const roundedExpected = Math.round(expectedAmount * 100) / 100;
    const { windowOpen: _wR, ...revenueDisplay } = toDualCurrency(roundedRevenue, windowOpen);
    const { windowOpen: _wE, ...expectedAmountDisplay } = toDualCurrency(roundedExpected, windowOpen);

    res.json({
      success: true,
      data: {
        totalVenues: venues.length,
        totalOffers,
        activeOffers,
        totalRedemptions: approvedScans.length,
        averageRating: partner.rating,
        totalReviews: partner.reviewCount,
        monthlyRedemptions: monthScans,
        ...(windowOpen && { revenue: roundedRevenue }),
        revenueDisplay,
        // BC-PARTNER-PORTAL-SCOPE-B B3 — new §5.3 KPI fields.
        ...(windowOpen && { expectedAmount: roundedExpected }),
        expectedAmountDisplay,
        totalVisits,
      },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/:id
// Public — all partners visible to everyone
// ----------------------------------------------------------------
router.get(
  '/:id',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        businessName: true,
        businessNameBg: true,
        category: true,
        description: true,
        descriptionBg: true,
        partnerType: { select: PARTNER_TYPE_SELECT },
        status: true,
        city: true,
        region: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        logo: true,
        coverImage: true,
        rating: true,
        reviewCount: true,
        openingHours: true,
        amenities: true,
        joinedAt: true,
        verifiedAt: true,
        isVisible: true,
      },
    });

    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';

    // Spec §5.3 v1.1 — public single-partner detail respects the same matrix
    // as the list endpoint. Admins (any auth method) see hidden partners for
    // ops visibility. Non-admins (anonymous customers, signed-in users) are
    // blocked on any of: status≠ACTIVE, verifiedAt null, isVisible=false.
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (!isAdmin) {
      if (
        partner.status !== PartnerStatus.ACTIVE ||
        !partner.verifiedAt ||
        !partner.isVisible
      ) {
        return res.status(404).json({ success: false, error: 'Partner not found' });
      }
    }

    // Spec §1.1 — non-admin callers receive the canonical status enum only.
    // The gate above already restricts them to ACTIVE partners, so this is
    // defence-in-depth against an internal sub-state ever reaching the public
    // response. Admins keep the raw status for ops visibility.
    // Non-admins also must not receive the internal admin-managed flags
    // verifiedAt / isVisible (spec §1.4/§11.4 — ops/visibility controls, not
    // partner-facing detail per §5.4). They were selected only for the matrix gate
    // above; strip them from the public response. Admins keep them.
    const data = isAdmin
      ? partner
      : (() => {
          const { verifiedAt: _v, isVisible: _iv, ...publicPartner } = partner as Record<string, unknown>;
          return { ...publicPartner, status: toCanonicalPartnerStatus(partner.status) };
        })();

    res.json({ success: true, data });
  }),
);

// ----------------------------------------------------------------
// POST /api/partners
// Admin only — creates a new partner and assigns a partner type.
// ----------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      userId,
      businessName,
      businessNameBg,
      category,
      categories,
      description,
      descriptionBg,
      city,
      region,
      address,
      phone,
      email,
      website,
      partnerTypeId,
      discountRate,
      locations,
    } = req.body;

    // Validate locations if provided
    if (locations !== undefined) {
      if (!Array.isArray(locations)) {
        return res.status(400).json({ success: false, error: 'locations must be an array' });
      }
      if (locations.length > 50) {
        return res.status(400).json({ success: false, error: 'A partner may have at most 50 locations' });
      }
      for (const loc of locations) {
        if (!loc.name || !loc.address || !loc.city) {
          return res.status(400).json({ success: false, error: 'Each location must have name, address, and city' });
        }
        // Geolocation is REQUIRED — every venue must be geocoded so the
        // offer-redemption proximity gate (anti-fraud, 100m radius) can be
        // enforced. Mirror the canonical validation in POST /api/venues.
        const latNum = Number(loc.latitude);
        const lngNum = Number(loc.longitude);
        if (
          loc.latitude == null || loc.longitude == null ||
          !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
          latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180
        ) {
          return res.status(400).json({
            success: false,
            error: `Venue "${loc.name}" geolocation is required: provide a valid latitude (-90..90) and longitude (-180..180).`,
          });
        }
      }
    }

    if (!userId || !businessName || !category) {
      return res.status(400).json({
        success: false,
        error: 'userId, businessName, and category are required',
      });
    }

    // Validate partnerTypeId if provided
    let resolvedTypeId: string | undefined = partnerTypeId;
    if (partnerTypeId) {
      const ptype = await prisma.partnerType.findUnique({ where: { id: partnerTypeId } });
      if (!ptype) {
        return res.status(400).json({ success: false, error: 'Invalid partnerTypeId — partner type not found' });
      }
      if (!ptype.isActive) {
        return res.status(400).json({ success: false, error: 'Partner type is not active' });
      }
    }

    // Validate optional discountRate against allowed steps and the type's cap
    let resolvedDiscountRate: number | undefined;
    if (discountRate !== undefined) {
      const rate = Number(discountRate);
      if (!isFinite(rate) || !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(rate)) {
        return res.status(400).json({ success: false, error: `discountRate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}` });
      }
      if (resolvedTypeId) {
        const typeMax = await partnerTypeService.getMaxDiscountForType(resolvedTypeId);
        if (rate > typeMax) {
          return res.status(400).json({
            success: false,
            error: `discountRate (${rate}%) exceeds the maximum allowed for this partner type (${typeMax}%)`,
          });
        }
      }
      resolvedDiscountRate = rate;
    }

    // Ensure the target user exists and has PARTNER role
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (targetUser.role !== 'PARTNER') {
      return res.status(400).json({ success: false, error: 'Target user must have the PARTNER role' });
    }

    // Prevent duplicate partner record for the same user
    const existing = await prisma.partner.findUnique({ where: { userId } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'This user already has a partner profile' });
    }

    const normalized = normalizePartnerCategories(category, categories);
    if (normalized.error) {
      return res.status(400).json({ success: false, error: normalized.error });
    }
    const partner = await prisma.partner.create({
      data: {
        userId,
        businessName,
        businessNameBg,
        category,
        categories: normalized.value,
        description,
        descriptionBg,
        partnerTypeId: resolvedTypeId,
        discountRate: resolvedDiscountRate,
        status: PartnerStatus.ACTIVE,
        city: city ?? (locations?.[0]?.city),
        region: region ?? (locations?.[0]?.region),
        address: address ?? (locations?.[0]?.address),
        phone,
        email,
        website,
      },
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

    // Create venue records (+ sticker locations) for each location.
    // Each venue is its own $transaction so we can fan out stickers atomically
    // per venue; a single venue failure logs + surfaces but doesn't block others.
    let venuesCreated = 0;
    let stickerLocationsCreated = 0;
    const venueErrors: Array<{ name: string; error: string }> = [];
    if (locations && locations.length > 0) {
      for (const loc of locations as any[]) {
        const capacity = normalizeIntOrNull(loc.capacity);
        const tables = normalizeInt(loc.tables);
        const cashDesks = normalizeInt(loc.cashDesks);
        try {
          const txResult = await prisma.$transaction(async (tx) => {
            const venue = await tx.venue.create({
              data: {
                partnerId: partner.id,
                name: loc.name,
                address: loc.address,
                city: loc.city,
                region: loc.region ?? null,
                // Coordinates were validated above (required + in-range) before
                // the partner/venue records are created.
                latitude: Number(loc.latitude),
                longitude: Number(loc.longitude),
                phone: loc.phone ?? null,
                capacity,
              },
              select: { id: true },
            });
            const locationRows: Array<{ venueId: string; name: string; locationType: LocationType; locationNumber: string }> = [];
            for (let i = 1; i <= tables; i++) {
              locationRows.push({ venueId: venue.id, name: `Table ${i}`, locationType: LocationType.TABLE, locationNumber: String(i) });
            }
            for (let i = 1; i <= cashDesks; i++) {
              locationRows.push({ venueId: venue.id, name: `Cash Desk ${i}`, locationType: LocationType.COUNTER, locationNumber: String(i) });
            }
            let count = 0;
            if (locationRows.length > 0) {
              const r = await tx.stickerLocation.createMany({ data: locationRows });
              count = r.count;
            }
            return { count };
          });
          venuesCreated++;
          stickerLocationsCreated += txResult.count;
        } catch (venueErr: any) {
          venueErrors.push({ name: loc.name, error: venueErr.message });
          logger.error(`[POST /partners] failed to create venue "${loc.name}" for partner ${partner.id}:`, venueErr);
        }
      }
    }

    detach(fireAutomation('partner.created', {
      partnerId: partner.id,
      recipientEmail: partner.email ?? undefined,
      recipientName: partner.businessName,
    }), (err) => logger.error('[automation] partner.created fire failed:', err));

    const typeMax = partner.partnerType?.maxDiscountRate ?? null;
    const effectiveRate = partner.discountRate ?? typeMax;
    res.status(201).json({
      success: true,
      data: {
        ...partner,
        typeMaxDiscountPercent: typeMax,
        effectiveDiscountRate: effectiveRate,
        venuesCreated,
        stickerLocationsCreated,
        venueErrors,
      },
      message: partner.partnerType
        ? `Partner created with type "${partner.partnerType.name}" — up to ${typeMax}% discount for cardholders`
        : 'Partner created',
    });
  }),
);

// ----------------------------------------------------------------
// PUT /api/partners/:id
// Partner owner may update their own profile (not type/status).
// Admin may update everything including type reassignment.
// ----------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: {
        partnerType: { select: PARTNER_TYPE_SELECT },
        user: { select: { id: true, email: true, firstName: true } },
      },
    });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    if (!isAdmin && partner.userId !== req.user!.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this partner' });
    }

    const {
      businessName,
      businessNameBg,
      category,
      categories,
      description,
      descriptionBg,
      city,
      region,
      address,
      phone,
      email,
      website,
      openingHours,
      features,
      amenities,
      // Admin-only fields
      partnerTypeId,
      status,
      discountRate,
    } = req.body;

    // If category or categories changed, validate them against the registry.
    // Use the existing partner.category as the implicit main when only
    // `categories` is being updated.
    let validatedCategories: string[] | undefined;
    if (categories !== undefined || category !== undefined) {
      const mainId = (category ?? partner.category) as string;
      const normalized = normalizePartnerCategories(mainId, categories);
      if (normalized.error) {
        return res.status(400).json({ success: false, error: normalized.error });
      }
      validatedCategories = normalized.value;
    }

    const updateData: any = {
      businessName,
      businessNameBg,
      category,
      categories: validatedCategories,
      description,
      descriptionBg,
      city,
      region,
      address,
      phone,
      email,
      website,
      openingHours,
      features,
      amenities,
    };

    // PARTNER role: stage public-content display changes as pending, await
    // admin approval.
    //
    // Spec §5.1 / §5.4 / §10.7 / §12 rules 3 & 4: a partner CANNOT directly
    // edit critical fields (commission, business parameters, location details,
    // QR codes, payment information, contact information, business name,
    // categories). The Change Request via the Help system is the ONLY
    // partner-initiated modification channel for those fields. The
    // pending-changes approval flow is therefore restricted to the genuinely
    // self-service public-content DISPLAY fields only:
    //   description, descriptionBg, amenities, openingHours.
    // Any attempt to change identity / contact / location / business fields
    // (businessName, businessNameBg, category, categories, city, region,
    // address, phone, email, website) — or the admin-managed contract metadata
    // blob `features` — is rejected with 403 PARTNER_USE_CHANGE_REQUEST,
    // mirroring auth.routes PUT /profile and POST /change-email/request. We do
    // NOT silently drop disallowed fields. The admin-only contract / lifecycle
    // fields (discountRate (commission %), status, isVisible, partnerTypeId,
    // verifiedAt) are ALSO rejected here with the same 403 — a partner staging
    // them as a "pending change" was previously silently dropped while the
    // handler still claimed success; they remain admin-only and are handled in
    // the isAdmin branch below.
    if (!isAdmin) {
      // Critical fields a partner may NOT edit here — presence in the body is
      // an attempt to change, even when set to null/empty.
      const disallowedPresent =
        businessName !== undefined ||
        businessNameBg !== undefined ||
        category !== undefined ||
        categories !== undefined ||
        city !== undefined ||
        region !== undefined ||
        address !== undefined ||
        phone !== undefined ||
        email !== undefined ||
        website !== undefined ||
        features !== undefined ||
        // Admin-only contract / lifecycle fields. partnerTypeId, status and
        // discountRate are destructured above; isVisible and verifiedAt are not,
        // so read them directly off the body to detect presence.
        discountRate !== undefined ||
        status !== undefined ||
        partnerTypeId !== undefined ||
        req.body.isVisible !== undefined ||
        req.body.verifiedAt !== undefined;

      if (disallowedPresent) {
        return res.status(403).json({
          success: false,
          error:
            'Partners cannot directly edit business name, categories, location, contact, payment, commission or status details. Please submit a change request via the Help system.',
          code: 'PARTNER_USE_CHANGE_REQUEST',
        });
      }

      const partnerUpdates: Record<string, unknown> = {};
      if (description !== undefined) partnerUpdates.description = description;
      if (descriptionBg !== undefined) partnerUpdates.descriptionBg = descriptionBg;
      if (openingHours !== undefined) partnerUpdates.openingHours = openingHours;
      if (amenities !== undefined) partnerUpdates.amenities = amenities;

      // No editable self-service field supplied: do NOT write a phantom empty
      // pendingChanges record and do NOT claim "pending approval". The only
      // partner-stageable fields are description, descriptionBg, openingHours,
      // amenities — anything else must go through the Help change-request channel.
      if (Object.keys(partnerUpdates).length === 0) {
        return res.status(400).json({
          success: false,
          error:
            'No editable fields supplied. Submit a change request via the Help system for other fields.',
          code: 'NO_EDITABLE_FIELDS',
        });
      }

      await prisma.partner.update({
        where: { id: req.params.id },
        data: { pendingChanges: partnerUpdates as any, pendingChangesAt: new Date() },
      });

      return res.json({
        success: true,
        pending: true,
        message: 'Your changes have been submitted and are pending admin approval.',
      });
    }

    let typeDowngradeWarnings: { offerId: string; title: string; discountPercent: number }[] = [];

    if (isAdmin) {
      if (partnerTypeId !== undefined) {
        if (partnerTypeId !== null) {
          const ptype = await prisma.partnerType.findUnique({ where: { id: partnerTypeId } });
          if (!ptype) {
            return res.status(400).json({ success: false, error: 'Invalid partnerTypeId — partner type not found' });
          }
          // Check for active offers that would violate the new type's discount cap
          const newMax = ptype.maxDiscountRate;
          const currentMax = partner.partnerType?.maxDiscountRate ?? Infinity;
          if (newMax < currentMax) {
            // PartnerType exposes a single rate ceiling — `maxDiscountRate`. There
            // is intentionally no separate cashback cap field on PartnerType, so
            // this same ceiling bounds BOTH the customer-facing discountPercent
            // and the internal cashbackPercent: a partner type's tier caps the
            // total rate a partner may grant on either axis. We therefore flag an
            // offer as violating if EITHER its discountPercent or its
            // cashbackPercent exceeds the new (lower) type ceiling. If a distinct
            // cashback cap is ever added to PartnerType, switch the cashbackPercent
            // comparison to that field.
            const violating = await prisma.offer.findMany({
              where: {
                partnerId: partner.id,
                status: OfferStatus.ACTIVE,
                OR: [{ discountPercent: { gt: newMax } }, { cashbackPercent: { gt: newMax } }],
              },
              select: { id: true, title: true, discountPercent: true },
            });
            if (violating.length > 0) {
              await prisma.offer.updateMany({
                where: { id: { in: violating.map(o => o.id) } },
                data: { status: OfferStatus.DRAFT },
              });
              typeDowngradeWarnings = violating.map(o => ({
                offerId: o.id,
                title: o.title,
                discountPercent: o.discountPercent ?? 0,
              }));
            }
          }
        }
        updateData.partnerTypeId = partnerTypeId;
      }

      if (discountRate !== undefined) {
        const rate = Number(discountRate);
        if (!isFinite(rate) || !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(rate)) {
          return res.status(400).json({ success: false, error: `discountRate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}` });
        }
        const effectiveTypeId = updateData.partnerTypeId ?? partner.partnerTypeId;
        if (effectiveTypeId) {
          const typeMax = await partnerTypeService.getMaxDiscountForType(effectiveTypeId);
          if (rate > typeMax) {
            return res.status(400).json({
              success: false,
              error: `discountRate (${rate}%) exceeds the maximum allowed for this partner type (${typeMax}%)`,
            });
          }
        }
        updateData.discountRate = rate;
      }

      if (status !== undefined) {
        // This admin-only validator accepts the full internal PartnerStatus enum,
        // including the INACTIVE sub-states PAUSED and SUSPENDED. These are NOT
        // separate canonical states — per spec §1.1 they are operational
        // sub-states of canonical Inactive (read-only operational mode) and are
        // treated identically to INACTIVE by the write gate
        // (partnerStatus.middleware) and by partnerService.setPartnerStatus.
        // Admins may set them so ops can distinguish *why* a partner is inactive,
        // but every partner-facing response canonicalizes them back to INACTIVE
        // via toCanonicalPartnerStatus. Do not remove these enum values.
        if (!Object.values(PartnerStatus).includes(status)) {
          return res.status(400).json({
            success: false,
            error: `Invalid status. Must be one of: ${Object.values(PartnerStatus).join(', ')}`,
          });
        }
        // Spec §5.2 — ARCHIVED → ACTIVE is not a direct flip: the partner must
        // go through a new onboarding review cycle (re-application). An admin
        // cannot reactivate an archived partner by editing status directly.
        // Block ALL transitions out of ARCHIVED — prevents two-step bypass (ARCHIVED→INACTIVE→ACTIVE).
        // Spec §1.7/§4.2/Clash 2.4: reactivation from Archived requires admin action + new onboarding review.
        if (partner.status === PartnerStatus.ARCHIVED) {
          return res.status(400).json({
            success: false,
            error: 'Archived partners cannot have their status changed via this endpoint. Use the onboarding pipeline to reactivate.',
            code: 'ARCHIVED_PARTNER_REQUIRES_ONBOARDING_REVIEW',
          });
        }
        // Also block REJECTED → ACTIVE (spec §2.2: rejected applications cannot be reopened)
        if (status === PartnerStatus.ACTIVE && partner.status === PartnerStatus.REJECTED) {
          return res.status(400).json({
            success: false,
            error: 'Cannot activate a REJECTED partner application. A new application is required.',
            code: 'REJECTED_PARTNER_CANNOT_BE_ACTIVATED',
          });
        }

        // Spec §5.2 — block direct activation of a PENDING partner that has not
        // completed the onboarding pipeline. An admin using the general edit form
        // must not be able to bypass the pipeline by flipping status=ACTIVE from
        // NOVA/KOMUNIKACIYA/DOGOVARYANE. Partners already in ONBOARDING or APPROVED
        // (pipeline complete) and re-activations of post-onboarding partners (e.g.
        // PAUSED → ACTIVE) are always allowed.
        if (status === PartnerStatus.ACTIVE && partner.status === PartnerStatus.PENDING) {
          const approvedStages: PartnerRequestStatus[] = [
            PartnerRequestStatus.ONBOARDING,
            PartnerRequestStatus.APPROVED,
          ];
          const currentRequestStatus = partner.requestStatus ?? PartnerRequestStatus.NEW;
          if (!approvedStages.includes(currentRequestStatus)) {
            return res.status(400).json({
              success: false,
              error: `Cannot activate a partner that has not completed onboarding. Current pipeline stage: ${currentRequestStatus}. Advance the partner to ONBOARDING via the partner requests pipeline first.`,
              currentRequestStatus,
            });
          }
        }
        // Spec §5.3 audit fix: status is handled SEPARATELY via partnerService
        // so a PartnerStatusChange row is always created and §8.2 email is sent.
        // Do NOT put status in updateData here — it is applied below.
        // Spec §5.2 v1.1 — verifiedAt is the "activation link consumed" flag,
        // stamped ONLY by activationLinkService.consume. Auto-stamping it here
        // bypassed the activation flow entirely (admin flips PENDING→ACTIVE
        // and verifiedAt gets set without an email ever being sent or
        // password ever being chosen). Removed; the partner must click the
        // activation link.
      }

      // Spec §5.3 — Видимост (visible vs. hidden to subscribers)
      if (req.body.isVisible !== undefined) {
        updateData.isVisible = !!req.body.isVisible;
      }
    }

    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    // Ensure features/amenities are stored as JSON strings (DB column is String)
    if (updateData.features !== undefined && typeof updateData.features !== 'string') {
      updateData.features = JSON.stringify(updateData.features);
    }
    if (updateData.amenities !== undefined && typeof updateData.amenities !== 'string') {
      updateData.amenities = JSON.stringify(updateData.amenities);
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        partnerType: { select: PARTNER_TYPE_SELECT },
        user: { select: { email: true, firstName: true } },
      },
    });

    // Spec §5.3 — История на промени: record admin edits so the edit modal's
    // "История на промени" section is populated. Non-admin edits go through
    // pendingChanges flow and are audited via the approval workflow instead.
    if (isAdmin) {
      // 'status' deliberately excluded — status changes go through
      // partnerService.setPartnerStatus() which writes a PartnerStatusChange row
      // and a partner.status.update AuditLog entry separately.
      const auditableFields = ['businessName', 'businessNameBg', 'category', 'categories',
        'description', 'city', 'region', 'address', 'phone', 'email', 'website',
        'discountRate', 'partnerTypeId', 'isVisible'];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const field of auditableFields) {
        const oldVal = (partner as Record<string, unknown>)[field];
        const newVal = updateData[field];
        if (newVal === undefined) continue;
        // Arrays (e.g. categories[]) must be compared by value, not reference,
        // and order-insensitively — the DB and the client may return the same
        // items in different order, which must not produce a spurious audit entry.
        const sortedForCmp = (v: unknown) => Array.isArray(v) ? [...v].sort() : v;
        const changed = Array.isArray(oldVal) || Array.isArray(newVal)
          ? JSON.stringify(sortedForCmp(oldVal)) !== JSON.stringify(sortedForCmp(newVal))
          : oldVal !== newVal;
        if (changed) {
          before[field] = oldVal;
          after[field] = newVal;
        }
      }
      if (Object.keys(after).length > 0) {
        detach(writeAudit({
          actorUserId: req.user!.id,
          action: 'partner.update',
          objectType: 'Partner',
          objectId: req.params.id,
          before,
          after,
          ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        }), () => {});
      }

      // Spec §5.1 Part 5 / Source 6.1 — Notification of commission or terms updates.
      // When discountRate is edited by an admin and actually changes, send a
      // partner contract-change notification. No notification on no-op edits (old === new).
      if (after.discountRate !== undefined) {
        detach(notificationService.notifyPartnerContractChange({
          partnerUserId: partner.userId,
          businessName: updated.businessName,
          fieldChanged: 'commission rate',
        }), (err) => logger.error('[PUT /partners/:id] notifyPartnerContractChange failed:', err));
      }
    }

    // Spec §5.3 audit fix — status changes are routed through partnerService so:
    //   1. A PartnerStatusChange row is always created (powers status-history tab).
    //   2. The §8.2 status-change email is always sent to the partner.
    // This is separate from (and after) the main prisma.partner.update() above,
    // which handles all non-status fields. partnerService opens its own transaction
    // for the status flip + audit row, so there is no double-update conflict.
    let statusChangedTo: PartnerStatus | undefined;
    if (isAdmin && status !== undefined && status !== partner.status) {
      try {
        await partnerService.setPartnerStatus({
          partnerId: req.params.id,
          toStatus: status as PartnerStatus,
          changedById: req.user!.id,
        });
        statusChangedTo = status as PartnerStatus;
      } catch (err) {
        logger.error('[PUT /partners/:id] partnerService.setPartnerStatus failed:', err);
        // Non-fatal: the main update succeeded; surface a warning but don't 500.
      }

      if (statusChangedTo !== undefined) {
        // §8.2 — the status-change email is sent inside setPartnerStatus (via
        // notificationService). Sending it here again would produce a duplicate
        // email to the partner. Only the user-account activation path (PENDING →
        // ACTIVE) requires additional action at the route layer.

        // When transitioning TO ACTIVE from a PENDING/onboarding state (first
        // activation), also activate the user account. Re-activations from
        // INACTIVE/SUSPENDED → ACTIVE don't need this (user was already ACTIVE).
        if (statusChangedTo === PartnerStatus.ACTIVE && partner.status === PartnerStatus.PENDING) {
          const userEmail = partner.user?.email ?? '';
          const userFirstName = partner.user?.firstName ?? '';
          const partnerUser = await prisma.user.update({
            where: { id: partner.userId },
            data: { status: UserStatus.ACTIVE },
            select: { email: true, firstName: true },
          });
          detach(emailService.sendPartnerApprovalEmail(partnerUser.email || userEmail, {
            firstName: partnerUser.firstName || userFirstName || (partnerUser.email || userEmail).split('@')[0],
            businessName: partner.businessName,
          }), (err) => logger.error('Failed to send partner approval email:', err));
        }
      }
    }

    const typeMax = updated.partnerType?.maxDiscountRate ?? null;
    const response: any = {
      success: true,
      data: {
        ...updated,
        // Reflect the committed status change — updated came from prisma.partner.update()
        // which ran before setPartnerStatus, so its status field is pre-change.
        ...(statusChangedTo !== undefined ? { status: statusChangedTo } : {}),
        typeMaxDiscountPercent: typeMax,
        effectiveDiscountRate: updated.discountRate ?? typeMax,
      },
    };

    if (typeDowngradeWarnings.length > 0) {
      response.warning = `Partner type downgrade detected. ${typeDowngradeWarnings.length} active offer(s) exceeded the new type's discount cap and have been moved to DRAFT status.`;
      response.deactivatedOffers = typeDowngradeWarnings;
    }

    res.json(response);
  }),
);

// ----------------------------------------------------------------
// POST /api/partners/:id/approve
// Admin only — apply pendingChanges to the live Partner record
// ----------------------------------------------------------------
router.post(
  '/:id/approve',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, firstName: true } } },
    });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (!partner.pendingChanges) {
      return res.status(400).json({ success: false, error: 'No pending changes to approve' });
    }

    const pendingChanges = partner.pendingChanges as Record<string, unknown>;

    // Spec §5.1 / §5.4 / §10.7 / §12 rules 3 & 4: filter pendingChanges to allow
    // ONLY the self-service public-content display fields (description,
    // descriptionBg, amenities, openingHours). This mirrors the validation done
    // when the partner submits changes; it is an extra guard to prevent
    // bypassing the whitelist if pendingChanges somehow gets polluted.
    const ALLOWED_FIELDS = new Set(['description', 'descriptionBg', 'amenities', 'openingHours']);
    const applyData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(pendingChanges)) {
      if (ALLOWED_FIELDS.has(key)) {
        applyData[key] = value;
      }
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        ...(applyData as any),
        pendingChanges: null,
        pendingChangesAt: null,
      },
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

    // Spec §8.2 — "Промяна на договорни параметри": notify partner on approval.
    const recipientEmail = (partner as any).email || partner.user?.email || null;
    if (recipientEmail) {
      detach(emailService
        .sendPartnerContractChangeEmail(recipientEmail, {
          firstName: partner.user?.firstName || (partner as any).businessName || '',
          businessName: (partner as any).businessName || '',
          approved: true,
          changes: applyData,
        }), (err) => logger.error('[partners] contract-change approval email failed:', err));
    }

    res.json({ success: true, data: updated, message: 'Pending changes approved and applied.' });
  }),
);

// ----------------------------------------------------------------
// POST /api/partners/:id/reject
// Admin only — discard pendingChanges without applying them
// ----------------------------------------------------------------
router.post(
  '/:id/reject',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, firstName: true } } },
    });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (!partner.pendingChanges) {
      return res.status(400).json({ success: false, error: 'No pending changes to reject' });
    }

    const rejectedChanges = partner.pendingChanges as Record<string, unknown>;

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { pendingChanges: null, pendingChangesAt: null },
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

    // Spec §8.2 — "Промяна на договорни параметри": notify partner on rejection.
    const recipientEmail = (partner as any).email || partner.user?.email || null;
    if (recipientEmail) {
      detach(emailService
        .sendPartnerContractChangeEmail(recipientEmail, {
          firstName: partner.user?.firstName || (partner as any).businessName || '',
          businessName: (partner as any).businessName || '',
          approved: false,
          changes: rejectedChanges,
        }), (err) => logger.error('[partners] contract-change rejection email failed:', err));
    }

    res.json({ success: true, data: updated, message: 'Pending changes rejected and discarded.' });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/:id/qr-code
// Admin only — generates and returns a unique SVG QR code for the partner
// ----------------------------------------------------------------
router.get(
  '/:id/qr-code',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { id: true, businessName: true },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    const QRCode = await import('qrcode');
    const svgString = await QRCode.toString(partner.id, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 2,
    });

    const safeName = partner.businessName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${safeName}.svg"`);
    res.send(svgString);
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/:id/type-info
// Returns the partner type constraints (accessible to owner/admin)
// ----------------------------------------------------------------
router.get(
  '/:id/type-info',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        businessName: true,
        partnerTypeId: true,
        userId: true,
        partnerType: { select: PARTNER_TYPE_SELECT },
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    if (!isAdmin && partner.userId !== req.user!.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    res.json({
      success: true,
      data: {
        partnerId: partner.id,
        businessName: partner.businessName,
        partnerType: partner.partnerType,
        typeMaxDiscountPercent: partner.partnerType?.maxDiscountRate ?? null,
      },
    });
  }),
);

// ----------------------------------------------------------------
// POST /api/partners/onboard
// Admin only — creates a user (PARTNER role) + partner in one transaction.
// Used by the admin onboarding form. The partner's email is used as the
// user account; a temporary random password is set.
// ----------------------------------------------------------------
router.post(
  '/onboard',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      // User info
      email,
      // Business info
      businessName,
      businessNameBg,
      legalName,
      vatNumber,
      country,
      city,
      region,
      address,
      googleMapsLink,
      totalVenues,
      boomVenues,
      description,
      descriptionBg,
      highlights,
      additionalAddresses,
      additionalVenues,
      locations,
      // Categories
      category,
      subcategory,
      categories,
      // Contacts
      ownerName,
      primaryContact,
      phone,
      secondaryContact,
      secondaryPhone,
      website,
      instagram,
      facebook,
      tiktok,
      googleBusiness,
      menuLink,
      logoLink,
      photosLink,
      // Partnership
      discountRate,
      partnerTypeId,
      marketingVisibility,
      contractSigned,
      contractStartDate,
      contractDuration,
      onboardingDate,
      addedBy,
      internalNotes,
      status,
    } = req.body;

    if (!email || !businessName || !category) {
      return res.status(400).json({ success: false, error: 'email, businessName, and category are required' });
    }

    const normalizedCategories = normalizePartnerCategories(category, categories);
    if (normalizedCategories.error) {
      return res.status(400).json({ success: false, error: normalizedCategories.error });
    }

    // Validate partnerTypeId if provided
    if (partnerTypeId) {
      const ptype = await prisma.partnerType.findUnique({ where: { id: partnerTypeId } });
      if (!ptype || !ptype.isActive) {
        return res.status(400).json({ success: false, error: 'Invalid or inactive partnerTypeId' });
      }
      if (discountRate !== undefined) {
        const rate = Number(discountRate);
        if (!isFinite(rate) || !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(rate)) {
          return res.status(400).json({ success: false, error: `discountRate must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}` });
        }
        if (rate > ptype.maxDiscountRate) {
          return res.status(400).json({
            success: false,
            error: `discountRate (${rate}%) exceeds the maximum for this partner type (${ptype.maxDiscountRate}%)`,
          });
        }
      }
    }

    // Build the features JSON with all onboarding-specific data
    const featuresData: Record<string, any> = {};
    if (legalName) featuresData.legalName = legalName;
    if (vatNumber) featuresData.vatNumber = vatNumber;
    if (country) featuresData.country = country;
    if (googleMapsLink) featuresData.googleMapsLink = googleMapsLink;
    if (totalVenues !== undefined) featuresData.totalVenues = totalVenues;
    if (boomVenues !== undefined) featuresData.boomVenues = boomVenues;
    if (additionalAddresses) featuresData.additionalAddresses = additionalAddresses;
    if (ownerName) featuresData.ownerName = ownerName;
    if (primaryContact) featuresData.primaryContact = primaryContact;
    if (secondaryContact) featuresData.secondaryContact = secondaryContact;
    if (secondaryPhone) featuresData.secondaryPhone = secondaryPhone;
    if (instagram) featuresData.instagram = instagram;
    if (facebook) featuresData.facebook = facebook;
    if (tiktok) featuresData.tiktok = tiktok;
    if (googleBusiness) featuresData.googleBusiness = googleBusiness;
    if (menuLink) featuresData.menuLink = menuLink;
    if (logoLink) featuresData.logoLink = logoLink;
    if (photosLink) featuresData.photosLink = photosLink;
    if (marketingVisibility) featuresData.marketingVisibility = marketingVisibility;
    if (contractSigned !== undefined) featuresData.contractSigned = contractSigned;
    if (contractStartDate) featuresData.contractStartDate = contractStartDate;
    if (contractDuration) featuresData.contractDuration = contractDuration;
    if (onboardingDate) featuresData.onboardingDate = onboardingDate;
    if (addedBy) featuresData.addedBy = addedBy;
    if (internalNotes) featuresData.internalNotes = internalNotes;
    if (subcategory) featuresData.subcategory = subcategory;

    // Build amenities from highlights
    const amenitiesData = highlights && highlights.length > 0
      ? (Array.isArray(highlights) ? highlights : highlights.split(',').map((h: string) => h.trim()).filter(Boolean))
      : undefined;

    // Collect venues from onboarding data BEFORE creating the partner so geo
    // validation can reject the whole request (and return a clean 400) without
    // leaving an orphan user/partner behind. We create the rows after the
    // partner exists (we need its id), but validate up front.
    type VenueSpec = {
      name: string;
      address: string;
      city: string;
      region: string | null;
      phone: string | null;
      latitude: number | null;
      longitude: number | null;
      capacity: number | null;
      tables: number;
      cashDesks: number;
    };

    const venueSpecs: VenueSpec[] = [];

    if (Array.isArray(locations) && locations.length > 0) {
      for (const loc of locations) {
        if (loc.name && loc.address && loc.city) {
          venueSpecs.push({
            name: loc.name,
            address: loc.address,
            city: loc.city,
            region: loc.region || null,
            phone: loc.phone || null,
            latitude: typeof loc.latitude === 'number' ? loc.latitude : null,
            longitude: typeof loc.longitude === 'number' ? loc.longitude : null,
            capacity: normalizeIntOrNull(loc.capacity),
            tables: normalizeInt(loc.tables),
            cashDesks: normalizeInt(loc.cashDesks),
          });
        }
      }
    } else {
      if (address && city) {
        venueSpecs.push({
          name: businessName,
          address,
          city,
          region: region || null,
          phone: phone || null,
          latitude: typeof req.body.latitude === 'number' ? req.body.latitude : null,
          longitude: typeof req.body.longitude === 'number' ? req.body.longitude : null,
          capacity: null,
          tables: 0,
          cashDesks: 0,
        });
      }
      if (Array.isArray(additionalVenues)) {
        for (const v of additionalVenues) {
          if (v.name && v.address && v.city) {
            venueSpecs.push({
              name: v.name,
              address: v.address,
              city: v.city,
              region: v.region || null,
              phone: v.phone || null,
              latitude: typeof v.latitude === 'number' ? v.latitude : null,
              longitude: typeof v.longitude === 'number' ? v.longitude : null,
              capacity: normalizeIntOrNull(v.capacity),
              tables: normalizeInt(v.tables),
              cashDesks: normalizeInt(v.cashDesks),
            });
          }
        }
      }
    }

    // BC-PARTNER-FU1 — geolocation is REQUIRED for every venue created via
    // onboard, exactly as enforced in POST /api/partners and POST /api/venues.
    // Offer redemption fails closed without coords, so a venue with null/invalid
    // lat/lng is unusable. Reject the request (same 400 shape as elsewhere in
    // this file) BEFORE creating the partner so no Venue row — and no orphan
    // user/partner — is ever persisted with null/out-of-range coordinates.
    for (const spec of venueSpecs) {
      const latNum = Number(spec.latitude);
      const lngNum = Number(spec.longitude);
      if (
        spec.latitude == null || spec.longitude == null ||
        !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180
      ) {
        return res.status(400).json({
          success: false,
          error: `Venue "${spec.name}" geolocation is required: provide a valid latitude (-90..90) and longitude (-180..180).`,
        });
      }
      // Persist the validated numbers (never null) so the venue.create below
      // stores real coordinates.
      spec.latitude = latNum;
      spec.longitude = lngNum;
    }

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Each onboarded partner gets its own dedicated PARTNER user account,
      // even if another account (user or partner) shares the same email/phone.
      const bcrypt = await import('bcryptjs');
      const tempPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase() + '!1',
        10
      );
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: tempPassword,
          firstName: primaryContact?.split(' ')[0] || ownerName?.split(' ')[0] || businessName.split(' ')[0],
          lastName: primaryContact?.split(' ').slice(1).join(' ') || ownerName?.split(' ').slice(1).join(' ') || '',
          role: 'PARTNER' as any,
          phone: phone || null,
          // Admin-created accounts are pre-verified — no email confirmation needed.
          emailVerified: true,
          status: UserStatus.ACTIVE,
          // Spec §5.2 v1.1 — flag so the activation page knows the partner
          // never chose this (random) password and MUST set one when consuming
          // the activation link. consume() clears this flag when a password
          // is supplied.
          mustChangePassword: true,
        },
      });

      // Spec §5.2 v1.1 — admin-onboarded partners start as PENDING (canonical
      // "Inactive") because the partner has not yet consumed their activation
      // link. We issue an activation link below so the partner can set their
      // own password (admin onboarding generates a random temp password the
      // partner never sees). Once the partner follows the link,
      // activationLinkService.consume() advances the status PENDING → ACTIVE
      // and stamps verifiedAt. verifiedAt is NEVER stamped by admin onboard —
      // only by activationLinkService.consume.
      const resolvedStatus = PartnerStatus.PENDING;

      const partner = await tx.partner.create({
        data: {
          userId: user.id,
          businessName,
          businessNameBg: businessNameBg || null,
          category,
          categories: normalizedCategories.value,
          description: description || null,
          descriptionBg: descriptionBg || null,
          city: city || null,
          region: region || null,
          address: address || null,
          phone: phone || null,
          email: email.toLowerCase(),
          website: website || null,
          partnerTypeId: partnerTypeId || null,
          discountRate: discountRate !== undefined ? Number(discountRate) : null,
          status: resolvedStatus,
          features: Object.keys(featuresData).length > 0 ? JSON.stringify(featuresData) : null,
          amenities: amenitiesData ? JSON.stringify(amenitiesData) : null,
          // verifiedAt stays null — set on activation-link consume only.
        },
        include: { partnerType: { select: PARTNER_TYPE_SELECT } },
      });

      return { user, partner };
    });

    let venuesCreated = 0;
    let stickerLocationsCreated = 0;
    const venueErrors: Array<{ name: string; error: string }> = [];
    for (const spec of venueSpecs) {
      // Each venue + its sticker locations is atomic. Failure of one venue
      // doesn't roll back the partner or the other venues; the failure is
      // surfaced in the response so the wizard can warn the admin.
      try {
        const txResult = await prisma.$transaction(async (tx) => {
          const venue = await tx.venue.create({
            data: {
              partnerId: result.partner.id,
              name: spec.name,
              address: spec.address,
              city: spec.city,
              region: spec.region,
              phone: spec.phone,
              latitude: spec.latitude,
              longitude: spec.longitude,
              capacity: spec.capacity,
            },
            select: { id: true },
          });
          const locationRows: Array<{ venueId: string; name: string; locationType: LocationType; locationNumber: string }> = [];
          for (let i = 1; i <= spec.tables; i++) {
            locationRows.push({ venueId: venue.id, name: `Table ${i}`, locationType: LocationType.TABLE, locationNumber: String(i) });
          }
          for (let i = 1; i <= spec.cashDesks; i++) {
            locationRows.push({ venueId: venue.id, name: `Cash Desk ${i}`, locationType: LocationType.COUNTER, locationNumber: String(i) });
          }
          let count = 0;
          if (locationRows.length > 0) {
            const r = await tx.stickerLocation.createMany({ data: locationRows });
            count = r.count;
          }
          return { count };
        });
        venuesCreated++;
        stickerLocationsCreated += txResult.count;
      } catch (venueErr: any) {
        venueErrors.push({ name: spec.name, error: venueErr.message });
        logger.error(`[onboard] failed to create venue "${spec.name}" for partner ${result.partner.id}:`, venueErr);
      }
    }

    // Spec §5.2 v1.1 — admin-onboarded partners get an activation link too.
    // The wizard creates a random temp password that the partner never sees;
    // without the activation link they would have no way to log in. They
    // can't log in until verifiedAt is stamped anyway (login gate), so this
    // is also the only path that brings them online.
    if (result.partner.status !== PartnerStatus.ACTIVE && !result.partner.verifiedAt) {
      try {
        const issued = await issueActivationLink({
          partnerId: result.partner.id,
          adminId: req.user!.id,
          reason: 'initial',
        });
        const recipient = result.partner.email ?? result.user.email;
        if (recipient) {
          const linkId = issued.linkId;
          detach(sendActivationEmail({
            email: recipient,
            firstName: result.user.firstName || result.partner.businessName,
            businessName: result.partner.businessName,
            activationUrl: issued.url,
            expiresAt: issued.expiresAt,
          })
            .then(() => stampEmailOutcome(linkId, { sent: true })), (err) => {
              logger.error('[partner-activation] onboard email failed:', err);
              // Register the failure-stamp write so it cannot settle during a
              // later, unrelated test and consume that suite's prisma mock queue.
              detach(stampEmailOutcome(linkId, { sent: false, error: String((err as Error)?.message ?? err) }),
                (e) => logger.error('[partner-activation] stampEmailOutcome (onboard-fail) failed:', e));
            });
        } else {
          logger.warn(`[onboard] partner ${result.partner.id} has no email — activation link issued but not sent`);
        }
      } catch (err) {
        logger.error('[onboard] issueActivationLink failed:', err);
      }
    }

    // Fire partner.created for wizard-created partners.
    // partner.approved is NOT fired here — wizard partners receive an activation
    // link (issued above) and partner.approved fires at auth.routes.ts when they
    // click it, identical to the standard onboarding path. Firing it here would
    // send the "approved" notification twice: once before the partner can even
    // log in, and once on link-click.
    detach(fireAutomation('partner.created', {
      partnerId: result.partner.id,
      recipientEmail: result.partner.email ?? undefined,
      recipientName: result.partner.businessName,
    }), (err) => logger.error('[automation] partner.created fire failed (onboard):', err));

    const typeMax = result.partner.partnerType?.maxDiscountRate ?? null;
    res.status(201).json({
      success: true,
      data: {
        ...result.partner,
        typeMaxDiscountPercent: typeMax,
        effectiveDiscountRate: result.partner.discountRate ?? typeMax,
        userCreated: true,
        userId: result.user.id,
        venuesCreated,
        stickerLocationsCreated,
        venueErrors,
      },
      message: `Partner "${businessName}" created successfully`,
    });
  }),
);

// ----------------------------------------------------------------
// Spec §5.2, §9.5 v1.1 — public partner activation preview endpoint.
// The CONSUME endpoint lives at POST /api/auth/partner/activate (auth.routes)
// — a previous parallel-work split left two competing consume endpoints with
// different password/verifiedAt contracts; consolidated to a single one.
// ----------------------------------------------------------------
router.get(
  '/activation/:token/verify',
  asyncHandler(async (req, res: Response) => {
    const token = req.params.token;
    const link = await prisma.activationLink.findUnique({
      where: { token },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            email: true,
            user: { select: { mustChangePassword: true } },
          },
        },
      },
    });

    if (!link || link.invalidatedAt || link.consumedAt || link.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ success: false, valid: false, error: 'Invalid or expired activation link' });
    }

    res.json({
      success: true,
      valid: true,
      expiresAt: link.expiresAt,
      // mustSetPassword drives the activation page: admin-onboarded partners
      // (mustChangePassword=true) must set a password; self-registered partners
      // (already have one) skip that step. The user relation is selected above.
      mustSetPassword: link.partner.user?.mustChangePassword ?? false,
      partner: {
        id: link.partner.id,
        businessName: link.partner.businessName,
        // email intentionally omitted — the FE activation page doesn't use it and
        // there's no need to disclose the partner's contact email to an
        // unauthenticated caller who merely holds the activation token.
      },
    });
  }),
);

export default router;
