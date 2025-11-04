import { Offer, OfferStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

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
  /**
   * Get all offers with filters and pagination
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
    } = filters;

    const where: Prisma.OfferWhereInput = {
      status,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
    };

    if (partnerId) {
      where.partnerId = partnerId;
    }

    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }

    if (minDiscount) {
      where.discountPercent = { gte: minDiscount };
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { titleBg: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (category || city) {
      where.partner = {};
      if (category) {
        where.partner.category = category;
      }
      if (city) {
        where.partner.city = city;
      }
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
   * Get top offers (highest discounts or featured)
   */
  async getTopOffers(limit: number = 10): Promise<Offer[]> {
    return prisma.offer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        OR: [
          { isFeatured: true },
          { discountPercent: { gte: 30 } }, // At least 30% discount
        ],
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
   * Get featured offers only
   */
  async getFeaturedOffers(limit: number = 10): Promise<Offer[]> {
    return prisma.offer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
        isFeatured: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
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
   * Get single offer by ID
   */
  async getOfferById(id: string): Promise<Offer | null> {
    return prisma.offer.findUnique({
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
          },
        },
      },
    });
  }

  /**
   * Create new offer (for partners)
   */
  async createOffer(data: CreateOfferData): Promise<Offer> {
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
   * Update offer
   */
  async updateOffer(id: string, data: Partial<CreateOfferData>): Promise<Offer> {
    return prisma.offer.update({
      where: { id },
      data,
      include: {
        partner: true,
      },
    });
  }

  /**
   * Toggle featured status (Admin only)
   */
  async toggleFeaturedStatus(id: string, isFeatured: boolean, featuredOrder?: number): Promise<Offer> {
    return prisma.offer.update({
      where: { id },
      data: {
        isFeatured,
        featuredOrder,
      },
    });
  }

  /**
   * Delete offer
   */
  async deleteOffer(id: string): Promise<void> {
    await prisma.offer.delete({
      where: { id },
    });
  }

  /**
   * Get offers by partner
   */
  async getOffersByPartner(partnerId: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, partnerId });
  }

  /**
   * Get offers by city
   */
  async getOffersByCity(city: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, city });
  }

  /**
   * Get offers by category
   */
  async getOffersByCategory(category: string, filters: OfferFilters = {}) {
    return this.getOffers({ ...filters, category });
  }
}

export const offersService = new OffersService();
