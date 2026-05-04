import { Offer, OfferStatus, Prisma, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { partnerTypeService } from './partnerType.service';
import { imageUploadService } from './imageUpload.service';
import { notificationService } from './notification.service';
import { logger } from '../utils/logger';
import { CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';
import { getSystemSettingInt } from '../utils/systemSettings';

const DEFAULT_OFFER_VALIDITY_DAYS = 90;

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OFFER_REDEMPTION_RADIUS_METERS = 100;

export interface OfferFilters {
  category?: string;
  city?: string;
  minDiscount?: number;
  partnerId?: string;
  search?: string;
  status?: OfferStatus;
  isFeatured?: boolean;
  tags?: string[];
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
  tags?: string[];
  startDate: Date;
  endDate?: Date;
  usageLimit?: number;
  isFeatured?: boolean;
  featuredOrder?: number;
  status?: OfferStatus;
}

// Partner select shape used across all offer queries
const PARTNER_SELECT = {
  id: true,
  businessName: true,
  businessNameBg: true,
  category: true,
  city: true,
  logo: true,
  rating: true,
  partnerTypeId: true,
  partnerType: {
    select: {
      id: true,
      name: true,
      nameBg: true,
      color: true,
      maxDiscountRate: true,
    },
  },
  venues: {
    where: { menuStatus: 'APPROVED' as const, menuUrl: { not: null } },
    select: {
      id: true,
      name: true,
      city: true,
      menuUrl: true,
    },
  },
} as const;

class OffersService {
  // ----------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------

  /**
   * Fetch the user's currently active subscription plan from the DB.
   */
  async getUserActivePlan(userId: string): Promise<SubscriptionPlan | null> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return subscription?.plan ?? null;
  }

  /**
   * Verify that the authenticated user owns the partner, or is an admin.
   * Returns the partner's partnerTypeId for discount validation.
   */
  private async assertPartnerOwnership(
    partnerId: string,
    userId: string,
    userRole: string,
  ): Promise<{ partnerTypeId: string | null }> {
    if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { partnerTypeId: true },
      });
      if (!partner) throw new Error('Partner not found');
      return partner;
    }

    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, userId },
      select: { partnerTypeId: true },
    });
    if (!partner) {
      throw new Error('Partner not found or you are not authorized to manage this partner');
    }
    return partner;
  }

  /**
   * Validate discount/cashback against the partner type's max rate.
   */
  private async validateDiscountBounds(
    discountPercent: number | null | undefined,
    cashbackPercent: number | null | undefined,
    partnerTypeId: string | null,
    isAdmin: boolean,
  ) {
    const maxDiscount = partnerTypeId
      ? await partnerTypeService.getMaxDiscountForType(partnerTypeId)
      : 100; // no type = no cap (shouldn't happen after migration)

    const steps = CASHBACK_MATRIX_STEPS as readonly number[];

    if (discountPercent !== undefined && discountPercent !== null) {
      if (!steps.includes(discountPercent)) {
        throw new Error(`Discount percent must be one of: ${steps.join(', ')}`);
      }
      if (!isAdmin && discountPercent > maxDiscount) {
        throw new Error(
          `Discount percent cannot exceed ${maxDiscount}% for this partner type. ` +
            `Upgrade the partner type to offer higher discounts.`,
        );
      }
    }

    if (cashbackPercent !== undefined && cashbackPercent !== null) {
      if (!steps.includes(cashbackPercent)) {
        throw new Error(`Cashback percent must be one of: ${steps.join(', ')}`);
      }
      if (!isAdmin && cashbackPercent > maxDiscount) {
        throw new Error(
          `Cashback percent cannot exceed ${maxDiscount}% for this partner type. ` +
            `Upgrade the partner type to offer higher cashback.`,
        );
      }
    }
  }

  /**
   * Serialize tags array to JSON string for storage.
   */
  private serializeTags(tags?: string[]): string | undefined {
    if (!tags || tags.length === 0) return undefined;
    return JSON.stringify(tags.map(t => t.trim().toLowerCase()).filter(Boolean));
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Get all offers with filters and pagination.
   * Visibility is now controlled by PlanTypeAccess.canView (via partnerType).
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
      tags,
      page = 1,
      limit = 10,
      userPlan,
      isAdmin = false,
    } = filters;

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
        { title: { contains: search, mode: 'insensitive' } },
        { titleBg: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Tag filter: check if tags JSON string contains each requested tag
    if (tags && tags.length > 0) {
      const tagFilters = tags.map(tag => ({
        tags: { contains: tag.toLowerCase() },
      }));
      if (where.AND) {
        (where.AND as any[]).push(...tagFilters);
      } else {
        where.AND = tagFilters as any;
      }
    }

    // Partner sub-filter: category, city, and optional visibility gating.
    // `category` accepts either a main-category id (e.g. "restaurants") or a
    // slash-format subcategory id (e.g. "restaurants/curated"). Subcategory ids
    // are matched against the Partner.categories array; main ids stay on the
    // singular Partner.category column for backward compatibility.
    const partnerFilter: Prisma.PartnerWhereInput = {};
    if (category) {
      if (category.includes('/')) {
        partnerFilter.categories = { has: category };
      } else {
        partnerFilter.category = category;
      }
    }
    if (city) partnerFilter.city = city;

    // Apply canView filter unless admin or no plan constraint
    if (!isAdmin) {
      const visibleTypeIds = await partnerTypeService.getVisibleTypeIdsForPlan(userPlan ?? null);
      if (visibleTypeIds !== null) {
        partnerFilter.partnerTypeId = { in: visibleTypeIds };
      }
    }

    if (Object.keys(partnerFilter).length > 0) {
      where.partner = partnerFilter;
    }

    const skip = (page - 1) * limit;

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: { partner: { select: PARTNER_SELECT } },
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
      data: offers.map(o => ({ ...o, tags: o.tags ? JSON.parse(o.tags) : [] })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all distinct tags used across active offers (for filter UI).
   */
  async getAllTags(): Promise<string[]> {
    const offers = await prisma.offer.findMany({
      where: { status: OfferStatus.ACTIVE, tags: { not: null } },
      select: { tags: true },
    });
    const tagSet = new Set<string>();
    for (const o of offers) {
      if (o.tags) {
        try {
          const parsed: string[] = JSON.parse(o.tags);
          parsed.forEach(t => tagSet.add(t));
        } catch {
          // ignore malformed
        }
      }
    }
    return Array.from(tagSet).sort();
  }

  /**
   * Get top offers (highest discounts or featured). Visible to all users.
   */
  async getTopOffers(limit: number = 10, userPlan?: SubscriptionPlan | null, isAdmin = false): Promise<any[]> {
    const where: Prisma.OfferWhereInput = {
      status: OfferStatus.ACTIVE,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
      OR: [{ isFeatured: true }, { discountPercent: { gte: 10 } }],
    };

    if (!isAdmin) {
      const visibleTypeIds = await partnerTypeService.getVisibleTypeIdsForPlan(userPlan ?? null);
      if (visibleTypeIds !== null) {
        where.partner = { partnerTypeId: { in: visibleTypeIds } };
      }
    }

    const offers = await prisma.offer.findMany({
      where,
      include: { partner: { select: PARTNER_SELECT } },
      orderBy: [{ isFeatured: 'desc' }, { featuredOrder: 'asc' }, { discountPercent: 'desc' }],
      take: limit,
    });
    return offers.map(o => ({ ...o, tags: o.tags ? JSON.parse(o.tags) : [] }));
  }

  /**
   * Get featured offers only.
   */
  async getFeaturedOffers(limit: number = 10, userPlan?: SubscriptionPlan | null, isAdmin = false): Promise<any[]> {
    const where: Prisma.OfferWhereInput = {
      status: OfferStatus.ACTIVE,
      isFeatured: true,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    };

    if (!isAdmin) {
      const visibleTypeIds = await partnerTypeService.getVisibleTypeIdsForPlan(userPlan ?? null);
      if (visibleTypeIds !== null) {
        where.partner = { partnerTypeId: { in: visibleTypeIds } };
      }
    }

    const offers = await prisma.offer.findMany({
      where,
      include: { partner: { select: PARTNER_SELECT } },
      orderBy: [{ featuredOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return offers.map(o => ({ ...o, tags: o.tags ? JSON.parse(o.tags) : [] }));
  }

  /**
   * Get single offer by ID.
   */
  async getOfferById(id: string, userPlan?: SubscriptionPlan | null, isAdmin = false): Promise<any | null> {
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            ...PARTNER_SELECT,
            address: true,
            phone: true,
            email: true,
            website: true,
          },
        },
      },
    });
    if (!offer) return null;
    return { ...offer, tags: offer.tags ? JSON.parse(offer.tags) : [] };
  }

  /**
   * Create a new offer.
   */
  async createOffer(data: CreateOfferData, userId: string, userRole: string): Promise<any> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const partner = await this.assertPartnerOwnership(data.partnerId, userId, userRole);

    await this.validateDiscountBounds(data.discountPercent, data.cashbackPercent, partner.partnerTypeId, isAdmin);

    let endDate = data.endDate;
    if (!endDate) {
      const validityDays = await getSystemSettingInt('offer_validity_days', DEFAULT_OFFER_VALIDITY_DAYS);
      // data.startDate arrives from req.body as a JSON string at runtime — coerce explicitly
      const start = data.startDate ? new Date(data.startDate as unknown as string) : new Date();
      endDate = new Date(start.getTime() + validityDays * 24 * 60 * 60 * 1000);
    }

    const { tags, status, endDate: _ignored, ...rest } = data as any;
    const offer = await prisma.offer.create({
      data: {
        ...rest,
        endDate,
        tags: this.serializeTags(tags),
        status: status ?? OfferStatus.DRAFT,
      },
      include: { partner: { select: PARTNER_SELECT } },
    });
    return { ...offer, tags: offer.tags ? JSON.parse(offer.tags) : [] };
  }

  /**
   * Update an offer.
   */
  async updateOffer(id: string, data: Partial<CreateOfferData>, userId: string, userRole: string): Promise<any> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const existingOffer = await prisma.offer.findUnique({
      where: { id },
      include: { partner: { select: { userId: true, partnerTypeId: true } } },
    });
    if (!existingOffer) throw new Error('Offer not found');

    if (!isAdmin && existingOffer.partner.userId !== userId) {
      throw new Error('Not authorized to update this offer');
    }

    if (data.partnerId && data.partnerId !== existingOffer.partnerId) {
      throw new Error('Cannot change the partner of an existing offer');
    }

    const effectiveDiscount = data.discountPercent !== undefined ? data.discountPercent : existingOffer.discountPercent;
    const effectiveCashback = data.cashbackPercent !== undefined ? data.cashbackPercent : existingOffer.cashbackPercent;
    await this.validateDiscountBounds(
      effectiveDiscount,
      effectiveCashback,
      existingOffer.partner.partnerTypeId,
      isAdmin,
    );

    const { partnerId: _ignored, tags, ...updateData } = data as any;
    const finalData: any = { ...updateData };
    if (tags !== undefined) finalData.tags = this.serializeTags(tags);

    const offer = await prisma.offer.update({
      where: { id },
      data: finalData,
      include: { partner: { select: PARTNER_SELECT } },
    });
    return { ...offer, tags: offer.tags ? JSON.parse(offer.tags) : [] };
  }

  /**
   * Upload an image for an offer and persist the URL.
   * Validates ownership, processes via imageUploadService, updates DB.
   */
  async uploadOfferImage(
    offerId: string,
    file: Express.Multer.File,
    userId: string,
    userRole: string,
  ): Promise<string> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { partner: { select: { userId: true } } },
    });
    if (!offer) throw new Error('Offer not found');
    if (!isAdmin && offer.partner.userId !== userId) {
      throw new Error('Not authorized to upload images for this offer');
    }

    const result = await imageUploadService.uploadImage({
      file: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: 'offers',
      userId,
    });

    await prisma.offer.update({
      where: { id: offerId },
      data: { image: result.url },
    });

    return result.url;
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
   * Checks that the user's plan grants canRedeem access to this partner's type.
   */
  async redeemOffer(
    offerId: string,
    userId: string,
    userRole: string,
    latitude?: number,
    longitude?: number,
  ): Promise<{ code: string; expiresAt: string }> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        partner: {
          select: {
            partnerTypeId: true,
            latitude: true,
            longitude: true,
            venues: { select: { latitude: true, longitude: true } },
          },
        },
      },
    });

    if (!offer) throw new Error('Offer not found');

    if (offer.status !== 'ACTIVE') throw new Error('This offer is no longer active');

    const now = new Date();
    if (offer.startDate > now) throw new Error('This offer has not started yet');
    if (offer.endDate < now) throw new Error('This offer has expired');

    // Type-based redemption check (skip for admins)
    if (!isAdmin) {
      const userPlan = await this.getUserActivePlan(userId);
      const redeemableTypeIds = await partnerTypeService.getRedeemableTypeIdsForPlan(userPlan);
      const partnerTypeId = (offer.partner as any).partnerTypeId;
      if (partnerTypeId && !redeemableTypeIds.includes(partnerTypeId)) {
        throw new Error(
          'Your subscription plan does not allow redeeming offers from this partner. Upgrade to redeem this offer.',
        );
      }
    }

    // Proximity check — user must be within 100m of at least one of the partner's venues (skip for admins)
    if (!isAdmin) {
      if (latitude === undefined || longitude === undefined) {
        throw new Error(
          'Location access is required to redeem this offer. Please enable GPS and try again.'
        );
      }

      const partner = offer.partner as any;
      const venues: Array<{ latitude: number | null; longitude: number | null }> = partner.venues ?? [];
      const geocodedVenues = venues.filter(v => v.latitude != null && v.longitude != null);
      let minDistance = Infinity;

      if (geocodedVenues.length > 0) {
        for (const venue of geocodedVenues) {
          const d = calculateDistance(latitude, longitude, venue.latitude!, venue.longitude!);
          if (d < minDistance) minDistance = d;
        }
      } else if (partner.latitude != null && partner.longitude != null) {
        minDistance = calculateDistance(latitude, longitude, partner.latitude, partner.longitude);
      } else {
        // Partner has no location data — skip proximity check
        minDistance = 0;
      }

      if (minDistance > OFFER_REDEMPTION_RADIUS_METERS) {
        throw new Error(
          `You must be within ${OFFER_REDEMPTION_RADIUS_METERS}m of the venue to redeem this offer. You are currently ${Math.round(minDistance)}m away.`
        );
      }
    }

    const existingRedemption = await prisma.offerRedemption.findUnique({
      where: { userId_offerId: { userId, offerId } },
    });
    if (existingRedemption) {
      if (existingRedemption.expiresAt > now) {
        return { code: existingRedemption.code, expiresAt: existingRedemption.expiresAt.toISOString() };
      }
      throw new Error('You have already redeemed this offer and the code has expired.');
    }

    if (offer.usageLimit !== null && offer.usageCount >= offer.usageLimit) {
      throw new Error('This offer has reached its redemption limit');
    }

    const code = `BOOM-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [updatedOffer] = await prisma.$transaction([
      prisma.offer.update({
        where: { id: offerId },
        data: { usageCount: { increment: 1 } },
        select: { usageCount: true, usageLimit: true },
      }),
      prisma.offerRedemption.create({ data: { offerId, userId, code, expiresAt } }),
    ]);

    // Notify the partner that owns this offer (non-fatal). Fire-and-forget so
    // a notification hiccup can never mask a successful redemption.
    (async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });
        const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || undefined;
        await notificationService.notifyPartnerOfferRedeemed({ offerId, userName, code });

        // Low-capacity alert: notify the partner when the offer crosses the
        // 90% usage mark. Only fires once per offer — the next tick's count
        // will be above the threshold so this branch won't re-enter.
        if (updatedOffer.usageLimit && updatedOffer.usageLimit > 0) {
          const remaining = updatedOffer.usageLimit - updatedOffer.usageCount;
          const prevRemaining = remaining + 1;
          const tenPercent = Math.max(1, Math.ceil(updatedOffer.usageLimit * 0.1));
          // Edge crossing: previous tick was above threshold, current tick is at/below.
          if (remaining <= tenPercent && prevRemaining > tenPercent) {
            const partner = await prisma.offer.findUnique({
              where: { id: offerId },
              select: { title: true, partner: { select: { user: { select: { id: true } } } } },
            });
            const partnerUserId = partner?.partner?.user?.id;
            if (partnerUserId) {
              await notificationService.notifyPartnerOfferLowCapacity({
                partnerUserId,
                offerId,
                offerTitle: partner!.title,
                remaining,
                usageLimit: updatedOffer.usageLimit,
              });
            }
          }
        }
      } catch (err) {
        logger.error('[offers] notifyPartnerOfferRedeemed failed:', err);
      }
    })();

    return { code, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Bulk-delete offers by IDs — admin only, no ownership check.
   */
  async bulkDeleteOffers(ids: string[]): Promise<number> {
    const result = await prisma.offer.deleteMany({ where: { id: { in: ids } } });
    return result.count;
  }

  /**
   * Delete an offer.
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

  async getOffersByPartner(partnerId: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, partnerId });
  }

  async getOffersByCity(city: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, city });
  }

  async getOffersByCategory(category: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, category });
  }
}

export const offersService = new OffersService();
