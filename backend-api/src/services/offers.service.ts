import { Offer, OfferStatus, PartnerTier, Prisma, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

// ============================================================
// Partner tier → max allowed discount % on offers
// A partner's tier determines what discounts they are permitted to publish.
// ============================================================
export const PARTNER_TIER_MAX_DISCOUNT: Record<PartnerTier, number> = {
  BASIC:     10,
  STANDARD:  15,
  PREMIUM:   20,
  VIP:       30,
  EXCLUSIVE: 100,
};

// ============================================================
// User subscription plan → accessible partner tiers
// Higher-tier partners (VIP, EXCLUSIVE) require a PREMIUM subscription.
// Unauthenticated / free users see BASIC partners only.
// ============================================================
export const PLAN_ACCESSIBLE_TIERS: Record<SubscriptionPlan, PartnerTier[]> = {
  LIGHT:   [PartnerTier.BASIC],
  BASIC:   [PartnerTier.BASIC, PartnerTier.STANDARD, PartnerTier.PREMIUM],
  PREMIUM: [PartnerTier.BASIC, PartnerTier.STANDARD, PartnerTier.PREMIUM, PartnerTier.VIP, PartnerTier.EXCLUSIVE],
};

// Tiers visible to unauthenticated (public) requests
const PUBLIC_ACCESSIBLE_TIERS: PartnerTier[] = [PartnerTier.BASIC];

export interface OfferFilters {
  category?: string;
  city?: string;
  minDiscount?: number;
  partnerId?: string;
  search?: string;
  status?: OfferStatus;
  isFeatured?: boolean;
  page?: number;
  limit?: number;
  // Access control: pass the user's active plan (null = unauthenticated)
  userPlan?: SubscriptionPlan | null;
  isAdmin?: boolean;
}

export interface CreateOfferData {
  partnerId: string;
  title: string;
  titleBg?: string;
  description: string;
  descriptionBg?: string;
  type: 'DISCOUNT' | 'CASHBACK' | 'POINTS' | 'BUNDLE' | 'SEASONAL';
  discountPercent?: number;
  discountAmount?: number;
  cashbackPercent?: number;
  pointsMultiplier?: number;
  minPurchase?: number;
  maxDiscount?: number;
  termsConditions?: string;
  termsConditionsBg?: string;
  image?: string;
  startDate: Date;
  endDate: Date;
  usageLimit?: number;
  isFeatured?: boolean;
  featuredOrder?: number;
}

class OffersService {
  // ----------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------

  /**
   * Resolve which partner tiers the caller is allowed to see.
   * Admins bypass all restrictions.
   */
  private getAccessibleTiers(userPlan: SubscriptionPlan | null | undefined, isAdmin: boolean): PartnerTier[] | undefined {
    if (isAdmin) return undefined; // undefined = no tier filter → see all
    if (!userPlan) return PUBLIC_ACCESSIBLE_TIERS;
    return PLAN_ACCESSIBLE_TIERS[userPlan];
  }

  /**
   * Fetch the user's currently active subscription plan from the DB.
   * Returns null if the user has no active subscription.
   */
  async getUserActivePlan(userId: string): Promise<SubscriptionPlan | null> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return subscription?.plan ?? null;
  }

  /**
   * Verify that the authenticated user owns the partner, or is an admin.
   * Throws if the check fails.
   */
  private async assertPartnerOwnership(partnerId: string, userId: string, userRole: string): Promise<{ tier: PartnerTier }> {
    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { tier: true } });
      if (!partner) throw new Error('Partner not found');
      return partner;
    }

    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, userId },
      select: { tier: true },
    });
    if (!partner) {
      throw new Error('Partner not found or you are not authorized to manage this partner');
    }
    return partner;
  }

  /**
   * Validate discount / cashback percentages against the partner's tier limits.
   */
  private validateDiscountBounds(
    discountPercent: number | null | undefined,
    cashbackPercent: number | null | undefined,
    partnerTier: PartnerTier,
    isAdmin: boolean,
  ) {
    const maxDiscount = PARTNER_TIER_MAX_DISCOUNT[partnerTier];

    if (discountPercent !== undefined && discountPercent !== null) {
      if (discountPercent < 0 || discountPercent > 100) {
        throw new Error('Discount percent must be between 0 and 100');
      }
      if (!isAdmin && discountPercent > maxDiscount) {
        throw new Error(
          `Discount percent cannot exceed ${maxDiscount}% for ${partnerTier} tier partners. ` +
          `Upgrade the partner tier to offer higher discounts.`,
        );
      }
    }

    if (cashbackPercent !== undefined && cashbackPercent !== null) {
      if (cashbackPercent < 0 || cashbackPercent > 100) {
        throw new Error('Cashback percent must be between 0 and 100');
      }
      if (!isAdmin && cashbackPercent > maxDiscount) {
        throw new Error(
          `Cashback percent cannot exceed ${maxDiscount}% for ${partnerTier} tier partners. ` +
          `Upgrade the partner tier to offer higher cashback.`,
        );
      }
    }
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Get all offers with filters and pagination.
   * When userPlan is provided (including null for unauthenticated),
   * results are restricted to partner tiers the caller can access.
   */
  async getOffers(filters: OfferFilters = {}) {
    const {
      category,
      city,
      minDiscount,
      partnerId,
      search,
      status = OfferStatus.ACTIVE,
      isFeatured,
      page = 1,
      limit = 10,
      userPlan,
      isAdmin = false,
    } = filters;

    const accessibleTiers = this.getAccessibleTiers(userPlan, isAdmin);

    const where: Prisma.OfferWhereInput = {
      status,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    };

    if (partnerId) where.partnerId = partnerId;
    if (isFeatured !== undefined) where.isFeatured = isFeatured;
    if (minDiscount) where.discountPercent = { gte: minDiscount };

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { titleBg: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Build partner sub-filter (category, city, tier access control)
    const partnerFilter: Prisma.PartnerWhereInput = {};
    if (category) partnerFilter.category = category;
    if (city) partnerFilter.city = city;
    if (accessibleTiers) partnerFilter.tier = { in: accessibleTiers };

    if (Object.keys(partnerFilter).length > 0) {
      where.partner = partnerFilter;
    }

    const skip = (page - 1) * limit;

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              businessNameBg: true,
              category: true,
              city: true,
              logo: true,
              rating: true,
              tier: true,
            },
          },
        },
        orderBy: [
          { isFeatured: 'desc' },
          { featuredOrder: 'asc' },
          { discountPercent: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.offer.count({ where }),
    ]);

    return {
      data: offers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get top offers (highest discounts or featured), respecting tier access.
   */
  async getTopOffers(limit: number = 10, userPlan?: SubscriptionPlan | null, isAdmin = false): Promise<Offer[]> {
    const accessibleTiers = this.getAccessibleTiers(userPlan, isAdmin);
    const partnerFilter: Prisma.PartnerWhereInput = {};
    if (accessibleTiers) partnerFilter.tier = { in: accessibleTiers };

    return prisma.offer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        OR: [
          { isFeatured: true },
          { discountPercent: { gte: 10 } },
        ],
        ...(Object.keys(partnerFilter).length > 0 ? { partner: partnerFilter } : {}),
      },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            businessNameBg: true,
            category: true,
            city: true,
            logo: true,
            rating: true,
            tier: true,
          },
        },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { featuredOrder: 'asc' },
        { discountPercent: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Get featured offers only, respecting tier access.
   */
  async getFeaturedOffers(limit: number = 10, userPlan?: SubscriptionPlan | null, isAdmin = false): Promise<Offer[]> {
    const accessibleTiers = this.getAccessibleTiers(userPlan, isAdmin);
    const partnerFilter: Prisma.PartnerWhereInput = {};
    if (accessibleTiers) partnerFilter.tier = { in: accessibleTiers };

    return prisma.offer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
        isFeatured: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        ...(Object.keys(partnerFilter).length > 0 ? { partner: partnerFilter } : {}),
      },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            businessNameBg: true,
            category: true,
            city: true,
            logo: true,
            rating: true,
            tier: true,
          },
        },
      },
      orderBy: [
        { featuredOrder: 'asc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  }

  /**
   * Get single offer by ID.
   * Returns null if the offer belongs to a partner tier the caller cannot access.
   */
  async getOfferById(id: string, userPlan?: SubscriptionPlan | null, isAdmin = false): Promise<Offer | null> {
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            businessNameBg: true,
            category: true,
            city: true,
            logo: true,
            rating: true,
            address: true,
            phone: true,
            website: true,
            tier: true,
          },
        },
      },
    });

    if (!offer) return null;

    // Enforce tier access even on single-offer lookups
    const accessibleTiers = this.getAccessibleTiers(userPlan, isAdmin);
    if (accessibleTiers && !(accessibleTiers as string[]).includes((offer.partner as any).tier)) {
      return null; // treat as not found — do not expose 403 which leaks existence
    }

    return offer;
  }

  /**
   * Create a new offer.
   * - Validates that the authenticated user owns the partner (unless admin).
   * - Validates that the discount does not exceed the partner tier's limit.
   */
  async createOffer(data: CreateOfferData, userId: string, userRole: string): Promise<Offer> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    // Ownership check: also fetches the partner tier for discount validation
    const partner = await this.assertPartnerOwnership(data.partnerId, userId, userRole);

    // Discount bounds validation
    this.validateDiscountBounds(data.discountPercent, data.cashbackPercent, partner.tier, isAdmin);

    return prisma.offer.create({
      data: {
        ...data,
        status: OfferStatus.DRAFT,
      },
      include: {
        partner: true,
      },
    });
  }

  /**
   * Update an offer.
   * - Validates that the authenticated user owns the partner (unless admin).
   * - Prevents changing the partnerId of an existing offer.
   * - Re-validates discount bounds after update.
   */
  async updateOffer(id: string, data: Partial<CreateOfferData>, userId: string, userRole: string): Promise<Offer> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const existingOffer = await prisma.offer.findUnique({
      where: { id },
      include: { partner: { select: { userId: true, tier: true } } },
    });
    if (!existingOffer) throw new Error('Offer not found');

    // Ownership check
    if (!isAdmin && existingOffer.partner.userId !== userId) {
      throw new Error('Not authorized to update this offer');
    }

    // Block partnerId reassignment — offers are immutably tied to their partner
    if (data.partnerId && data.partnerId !== existingOffer.partnerId) {
      throw new Error('Cannot change the partner of an existing offer');
    }

    // Resolve the effective discount values after the update
    const effectiveDiscount = data.discountPercent !== undefined ? data.discountPercent : existingOffer.discountPercent;
    const effectiveCashback = data.cashbackPercent !== undefined ? data.cashbackPercent : existingOffer.cashbackPercent;
    this.validateDiscountBounds(effectiveDiscount, effectiveCashback, existingOffer.partner.tier, isAdmin);

    // Strip partnerId from the update payload (immutable field)
    const { partnerId: _ignored, ...updateData } = data as any;

    return prisma.offer.update({
      where: { id },
      data: updateData,
      include: { partner: true },
    });
  }

  /**
   * Toggle featured status — admin only (enforced at route level).
   */
  async toggleFeaturedStatus(id: string, isFeatured: boolean, featuredOrder?: number): Promise<Offer> {
    return prisma.offer.update({
      where: { id },
      data: { isFeatured, featuredOrder },
    });
  }

  /**
   * Redeem an offer for a user.
   * Validates:
   *  - Offer exists and is currently active (dates, status).
   *  - User's subscription tier grants access to the offer's partner.
   *  - usageLimit hasn't been reached.
   *  - User hasn't already redeemed this offer (one-per-user enforcement).
   * On success, atomically increments usageCount, persists the redemption
   * record, and returns the one-time code.
   */
  async redeemOffer(
    offerId: string,
    userId: string,
    userRole: string,
  ): Promise<{ code: string; expiresAt: string }> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { partner: { select: { tier: true } } },
    });

    if (!offer) throw new Error('Offer not found');

    // Status check
    if (offer.status !== 'ACTIVE') {
      throw new Error('This offer is no longer active');
    }

    // Date range check
    const now = new Date();
    if (offer.startDate > now) throw new Error('This offer has not started yet');
    if (offer.endDate < now) throw new Error('This offer has expired');

    // Tier access check (skip for admins)
    if (!isAdmin) {
      const userPlan = await this.getUserActivePlan(userId);
      const accessibleTiers = this.getAccessibleTiers(userPlan, false)!;
      if (!(accessibleTiers as string[]).includes((offer.partner as any).tier)) {
        throw new Error('Your subscription plan does not include access to this partner. Upgrade to redeem this offer.');
      }
    }

    // Per-user double-redemption check
    const existingRedemption = await prisma.offerRedemption.findUnique({
      where: { userId_offerId: { userId, offerId } },
    });
    if (existingRedemption) {
      // Return the existing code if still valid, otherwise reject
      if (existingRedemption.expiresAt > now) {
        return { code: existingRedemption.code, expiresAt: existingRedemption.expiresAt.toISOString() };
      }
      throw new Error('You have already redeemed this offer and the code has expired.');
    }

    // Global usage limit check
    if (offer.usageLimit !== null && offer.usageCount >= offer.usageLimit) {
      throw new Error('This offer has reached its redemption limit');
    }

    // Generate a cryptographically random one-time code
    const code = `BOOM-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Atomically increment usageCount and persist the redemption record
    await prisma.$transaction([
      prisma.offer.update({
        where: { id: offerId },
        data: { usageCount: { increment: 1 } },
      }),
      prisma.offerRedemption.create({
        data: { offerId, userId, code, expiresAt },
      }),
    ]);

    return { code, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Delete an offer.
   * - Validates that the authenticated user owns the partner (unless admin).
   */
  async deleteOffer(id: string, userId: string, userRole: string): Promise<void> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const existingOffer = await prisma.offer.findUnique({
      where: { id },
      include: { partner: { select: { userId: true } } },
    });
    if (!existingOffer) throw new Error('Offer not found');

    if (!isAdmin && existingOffer.partner.userId !== userId) {
      throw new Error('Not authorized to delete this offer');
    }

    await prisma.offer.delete({ where: { id } });
  }

  /**
   * Get offers by partner (respects tier access).
   */
  async getOffersByPartner(partnerId: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, partnerId });
  }

  /**
   * Get offers by city (respects tier access).
   */
  async getOffersByCity(city: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, city });
  }

  /**
   * Get offers by category (respects tier access).
   */
  async getOffersByCategory(category: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, category });
  }
}

export const offersService = new OffersService();
