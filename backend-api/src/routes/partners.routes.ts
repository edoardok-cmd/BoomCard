/**
 * Partners Routes
 *
 * Security model:
 * - Public GET endpoints are tier-filtered by the caller's subscription plan.
 * - Partner profile edits require ownership (PARTNER role + own record) or ADMIN.
 * - Partner creation (POST) is ADMIN-only.
 * - Tier assignment is ADMIN-only and determines the maximum discount % partners may offer.
 *
 * Partner Tier → Max Offer Discount mapping (matches offers.service.ts):
 *   BASIC     → up to 10%
 *   STANDARD  → up to 15%
 *   PREMIUM   → up to 20%
 *   VIP       → up to 30%
 *   EXCLUSIVE → up to 100%
 *
 * User Subscription Plan → Visible Partner Tiers:
 *   (no sub / LIGHT) → BASIC
 *   BASIC             → BASIC, STANDARD, PREMIUM
 *   PREMIUM           → all tiers
 */

import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, optionalAuthenticate, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { OfferStatus, PartnerStatus, PartnerTier, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PARTNER_TIER_MAX_DISCOUNT, PLAN_ACCESSIBLE_TIERS } from '../services/offers.service';

const router = Router();

// ----------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------

const PUBLIC_ACCESSIBLE_TIERS: PartnerTier[] = [PartnerTier.BASIC];

async function getUserActivePlan(userId: string): Promise<SubscriptionPlan | null> {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    orderBy: { currentPeriodEnd: 'desc' },
  });
  return sub?.plan ?? null;
}

function getAccessibleTiers(userPlan: SubscriptionPlan | null, isAdmin: boolean): PartnerTier[] | undefined {
  if (isAdmin) return undefined;
  if (!userPlan) return PUBLIC_ACCESSIBLE_TIERS;
  return PLAN_ACCESSIBLE_TIERS[userPlan];
}

// ----------------------------------------------------------------
// GET /api/partners
// Public — tier-filtered by caller's subscription plan
// ----------------------------------------------------------------
router.get(
  '/',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = req.user && !isAdmin ? await getUserActivePlan(req.user.id) : null;
    const accessibleTiers = getAccessibleTiers(userPlan, isAdmin);

    const { category, city, status, search, page = '1', limit = '20' } = req.query as Record<string, string>;

    const where: any = {
      status: status ?? PartnerStatus.ACTIVE,
    };
    if (category) where.category = category;
    if (city) where.city = city;
    if (accessibleTiers) where.tier = { in: accessibleTiers };
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { businessNameBg: { contains: search, mode: 'insensitive' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        select: {
          id: true,
          businessName: true,
          businessNameBg: true,
          category: true,
          tier: true,
          status: true,
          city: true,
          region: true,
          logo: true,
          coverImage: true,
          rating: true,
          reviewCount: true,
          website: true,
          joinedAt: true,
          verifiedAt: true,
        },
        orderBy: [{ tier: 'desc' }, { rating: 'desc' }],
        skip,
        take: limitNum,
      }),
      prisma.partner.count({ where }),
    ]);

    res.json({
      success: true,
      data: partners,
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
      include: {
        offers: { where: { status: 'ACTIVE' }, select: { id: true, title: true, discountPercent: true, status: true } },
        venues: { select: { id: true, name: true, city: true } },
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner profile not found' });
    }

    const tierMaxDiscount = PARTNER_TIER_MAX_DISCOUNT[partner.tier];

    res.json({
      success: true,
      data: {
        ...partner,
        tierMaxDiscountPercent: tierMaxDiscount,
      },
    });
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/:id
// Public — returns 404 if caller cannot access the partner's tier
// ----------------------------------------------------------------
router.get(
  '/:id',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const userPlan = req.user && !isAdmin ? await getUserActivePlan(req.user.id) : null;
    const accessibleTiers = getAccessibleTiers(userPlan, isAdmin);

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        businessName: true,
        businessNameBg: true,
        category: true,
        description: true,
        descriptionBg: true,
        tier: true,
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
        features: true,
        amenities: true,
        joinedAt: true,
        verifiedAt: true,
      },
    });

    if (!partner || partner.status !== PartnerStatus.ACTIVE) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    // Enforce tier access — treat inaccessible partners as not found
    if (accessibleTiers && !accessibleTiers.includes(partner.tier)) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    res.json({ success: true, data: partner });
  }),
);

// ----------------------------------------------------------------
// POST /api/partners
// Admin only — creates a new partner and assigns a tier.
// The tier determines the maximum discount % their offers may carry.
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
      description,
      descriptionBg,
      city,
      region,
      address,
      phone,
      email,
      website,
      intendedMaxDiscount,
    } = req.body;

    if (!userId || !businessName || !category) {
      return res.status(400).json({
        success: false,
        error: 'userId, businessName, and category are required',
      });
    }

    // Derive tier from intendedMaxDiscount if provided, otherwise use explicit tier or BASIC.
    // Assigns the minimum tier whose max discount covers the intended percentage.
    let tier: PartnerTier = req.body.tier ?? PartnerTier.BASIC;
    if (intendedMaxDiscount !== undefined) {
      const pct = Number(intendedMaxDiscount);
      if (!isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ success: false, error: 'intendedMaxDiscount must be a number between 0 and 100' });
      }
      const orderedTiers: PartnerTier[] = [PartnerTier.BASIC, PartnerTier.STANDARD, PartnerTier.PREMIUM, PartnerTier.VIP, PartnerTier.EXCLUSIVE];
      const derived = orderedTiers.find(t => PARTNER_TIER_MAX_DISCOUNT[t] >= pct);
      if (!derived) {
        return res.status(400).json({ success: false, error: 'intendedMaxDiscount exceeds the maximum allowed (100%)' });
      }
      tier = derived;
    }

    // Validate tier value
    if (!Object.values(PartnerTier).includes(tier)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier. Must be one of: ${Object.values(PartnerTier).join(', ')}`,
      });
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

    const partner = await prisma.partner.create({
      data: {
        userId,
        businessName,
        businessNameBg,
        category,
        description,
        descriptionBg,
        tier,
        status: PartnerStatus.ACTIVE,
        city,
        region,
        address,
        phone,
        email,
        website,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...partner,
        tierMaxDiscountPercent: PARTNER_TIER_MAX_DISCOUNT[partner.tier],
      },
      message: `Partner created with tier ${tier} (max offer discount: ${PARTNER_TIER_MAX_DISCOUNT[tier]}%)`,
    });
  }),
);

// ----------------------------------------------------------------
// PUT /api/partners/:id
// Partner owner may update their own profile (not tier/status).
// Admin may update everything including tier reassignment.
// ----------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';

    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    // Ownership check for non-admins
    if (!isAdmin && partner.userId !== req.user!.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this partner' });
    }

    const {
      businessName,
      businessNameBg,
      category,
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
      tier,
      status,
    } = req.body;

    // Non-admins cannot set tier or status
    const updateData: any = {
      businessName,
      businessNameBg,
      category,
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

    let tierDowngradeWarnings: { offerId: string; title: string; discountPercent: number }[] = [];

    if (isAdmin) {
      if (tier !== undefined) {
        if (!Object.values(PartnerTier).includes(tier)) {
          return res.status(400).json({
            success: false,
            error: `Invalid tier. Must be one of: ${Object.values(PartnerTier).join(', ')}`,
          });
        }

        // Check for active offers that would violate the new tier's discount cap
        const tierOrder: PartnerTier[] = [PartnerTier.BASIC, PartnerTier.STANDARD, PartnerTier.PREMIUM, PartnerTier.VIP, PartnerTier.EXCLUSIVE];
        const isDowngrade = tierOrder.indexOf(tier) < tierOrder.indexOf(partner.tier);
        if (isDowngrade) {
          const newMax = PARTNER_TIER_MAX_DISCOUNT[tier as PartnerTier];
          const violating = await prisma.offer.findMany({
            where: {
              partnerId: partner.id,
              status: OfferStatus.ACTIVE,
              OR: [
                { discountPercent: { gt: newMax } },
                { cashbackPercent: { gt: newMax } },
              ],
            },
            select: { id: true, title: true, discountPercent: true },
          });
          if (violating.length > 0) {
            // Deactivate violating offers to prevent discount leakage
            await prisma.offer.updateMany({
              where: { id: { in: violating.map(o => o.id) } },
              data: { status: OfferStatus.DRAFT },
            });
            tierDowngradeWarnings = violating.map(o => ({
              offerId: o.id,
              title: o.title,
              discountPercent: o.discountPercent ?? 0,
            }));
          }
        }

        updateData.tier = tier;
      }
      if (status !== undefined) {
        if (!Object.values(PartnerStatus).includes(status)) {
          return res.status(400).json({
            success: false,
            error: `Invalid status. Must be one of: ${Object.values(PartnerStatus).join(', ')}`,
          });
        }
        updateData.status = status;
        if (status === PartnerStatus.ACTIVE && !partner.verifiedAt) {
          updateData.verifiedAt = new Date();
        }
      }
    }

    // Remove undefined fields so Prisma ignores them
    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: updateData,
    });

    const response: any = {
      success: true,
      data: {
        ...updated,
        tierMaxDiscountPercent: PARTNER_TIER_MAX_DISCOUNT[updated.tier],
      },
    };

    if (tierDowngradeWarnings.length > 0) {
      response.warning = `Tier downgrade detected. ${tierDowngradeWarnings.length} active offer(s) exceeded the new tier's discount cap and have been moved to DRAFT status.`;
      response.deactivatedOffers = tierDowngradeWarnings;
    }

    res.json(response);
  }),
);

// ----------------------------------------------------------------
// GET /api/partners/:id/tier-info
// Returns the tier constraints for a partner (accessible to owner/admin)
// ----------------------------------------------------------------
router.get(
  '/:id/tier-info',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id },
      select: { id: true, businessName: true, tier: true, userId: true },
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
        tier: partner.tier,
        tierMaxDiscountPercent: PARTNER_TIER_MAX_DISCOUNT[partner.tier],
        tierDescription: {
          BASIC:     'Up to 10% discount — visible to all users (including LIGHT plan)',
          STANDARD:  'Up to 15% discount — visible to BASIC plan and above',
          PREMIUM:   'Up to 20% discount — visible to BASIC plan and above',
          VIP:       'Up to 30% discount — visible to PREMIUM plan only',
          EXCLUSIVE: 'Up to 100% discount — visible to PREMIUM plan only',
        }[partner.tier],
      },
    });
  }),
);

export default router;
