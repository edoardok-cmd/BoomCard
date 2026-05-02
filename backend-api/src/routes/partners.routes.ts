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
import { prisma } from '../lib/prisma';
import { OfferStatus, PartnerStatus, ScanStatus, UserStatus } from '@prisma/client';
import { partnerTypeService } from '../services/partnerType.service';
import { CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { fireAutomation } from '../lib/automationDispatcher';

const PARTNER_TYPE_SELECT = {
  id: true,
  name: true,
  nameBg: true,
  color: true,
  maxDiscountRate: true,
} as const;

const router = Router();

// ----------------------------------------------------------------
// GET /api/partners
// Public — all partners visible to everyone
// ----------------------------------------------------------------
router.get(
  '/',
  optionalAuthenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { category, city, status, search, partnerTypeId, page = '1', limit = '20',
            verifiedAfter, onboardingCompletedAfter } = req.query as Record<string, string>;

    const where: any = {
      status: status ?? PartnerStatus.ACTIVE,
    };
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
      if (!isNaN(from.getTime())) where.verifiedAt = { gte: from };
    }
    if (onboardingCompletedAfter) {
      const from = new Date(onboardingCompletedAfter);
      if (!isNaN(from.getTime())) where.onboardingCompletedAt = { gte: from };
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
          verifiedAt: true,
          onboardingCompletedAt: true,
          pendingChanges: true,
          pendingChangesAt: true,
        },
        orderBy: [{ rating: 'desc' }],
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

    const typeMaxDiscount = partner.partnerType?.maxDiscountRate ?? null;

    res.json({
      success: true,
      data: {
        ...partner,
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
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);

    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, venues: { select: { id: true, name: true } } },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner profile not found' });
    }

    const venueIds = partner.venues.map(v => v.id);

    if (venueIds.length === 0) {
      return res.json({
        success: true,
        data: {
          period: { days, startDate: new Date(), endDate: new Date() },
          stats: { totalSavings: 0, activeCards: 0, totalUses: 0, avgDiscount: 0 },
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

    const [currentScans, previousScans] = await Promise.all([
      prisma.stickerScan.findMany({
        where: { venueId: { in: venueIds }, createdAt: { gte: currentStart } },
        select: {
          id: true,
          venueId: true,
          cardId: true,
          cashbackAmount: true,
          cashbackPercent: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.stickerScan.findMany({
        where: { venueId: { in: venueIds }, createdAt: { gte: previousStart, lt: currentStart } },
        select: { cardId: true, cashbackAmount: true, cashbackPercent: true, status: true },
      }),
    ]);

    const approved = currentScans.filter(s => s.status === ScanStatus.APPROVED);
    const prevApproved = previousScans.filter(s => s.status === ScanStatus.APPROVED);

    const totalSavings = approved.reduce((sum, s) => sum + s.cashbackAmount, 0);
    const activeCards = new Set(approved.map(s => s.cardId).filter(Boolean)).size;
    const totalUses = approved.length;
    const avgDiscount = approved.length > 0
      ? approved.reduce((sum, s) => sum + s.cashbackPercent, 0) / approved.length
      : 0;

    const prevSavings = prevApproved.reduce((sum, s) => sum + s.cashbackAmount, 0);
    const prevCards = new Set(prevApproved.map(s => s.cardId).filter(Boolean)).size;
    const prevUses = prevApproved.length;
    const prevAvgDiscount = prevApproved.length > 0
      ? prevApproved.reduce((sum, s) => sum + s.cashbackPercent, 0) / prevApproved.length
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

    res.json({
      success: true,
      data: {
        period: { days, startDate: currentStart, endDate: now },
        stats: {
          totalSavings: Math.round(totalSavings * 100) / 100,
          activeCards,
          totalUses,
          avgDiscount: Math.round(avgDiscount * 10) / 10,
        },
        changes: {
          totalSavings: pctChange(totalSavings, prevSavings),
          activeCards: pctChange(activeCards, prevCards),
          totalUses: pctChange(totalUses, prevUses),
          avgDiscount: pctChange(avgDiscount, prevAvgDiscount),
        },
        timeSeries,
        byVenue,
      },
    });
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

    const [venues, totalOffers, activeOffers, approvedScans, monthScans] = await Promise.all([
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
    ]);

    const revenue = approvedScans.reduce((sum, s) => sum + s.cashbackAmount, 0);

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
        revenue: Math.round(revenue * 100) / 100,
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
        features: true,
        amenities: true,
        joinedAt: true,
        verifiedAt: true,
      },
    });

    if (!partner || partner.status !== PartnerStatus.ACTIVE) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    res.json({ success: true, data: partner });
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

    const partner = await prisma.partner.create({
      data: {
        userId,
        businessName,
        businessNameBg,
        category,
        categories: categories && Array.isArray(categories) && categories.length > 0
          ? categories
          : [category],
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

    // Create venue records for each location
    if (locations && locations.length > 0) {
      await prisma.venue.createMany({
        data: locations.map((loc: any) => ({
          partnerId: partner.id,
          name: loc.name,
          address: loc.address,
          city: loc.city,
          region: loc.region ?? null,
          latitude: typeof loc.latitude === 'number' ? loc.latitude : null,
          longitude: typeof loc.longitude === 'number' ? loc.longitude : null,
          phone: loc.phone ?? null,
        })),
      });
    }

    fireAutomation('partner.created', {
      partnerId: partner.id,
      recipientEmail: partner.email ?? undefined,
      recipientName: partner.businessName,
    }).catch((err) => logger.error('[automation] partner.created fire failed:', err));

    const typeMax = partner.partnerType?.maxDiscountRate ?? null;
    const effectiveRate = partner.discountRate ?? typeMax;
    res.status(201).json({
      success: true,
      data: {
        ...partner,
        typeMaxDiscountPercent: typeMax,
        effectiveDiscountRate: effectiveRate,
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
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
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

    const updateData: any = {
      businessName,
      businessNameBg,
      category,
      categories: categories && Array.isArray(categories) ? categories : undefined,
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

    // PARTNER role: save changes as pending, await admin approval
    if (!isAdmin) {
      const partnerUpdates: Record<string, unknown> = {};
      if (businessName !== undefined) partnerUpdates.businessName = businessName;
      if (businessNameBg !== undefined) partnerUpdates.businessNameBg = businessNameBg;
      if (category !== undefined) partnerUpdates.category = category;
      if (categories !== undefined && Array.isArray(categories)) partnerUpdates.categories = categories;
      if (description !== undefined) partnerUpdates.description = description;
      if (descriptionBg !== undefined) partnerUpdates.descriptionBg = descriptionBg;
      if (city !== undefined) partnerUpdates.city = city;
      if (region !== undefined) partnerUpdates.region = region;
      if (address !== undefined) partnerUpdates.address = address;
      if (phone !== undefined) partnerUpdates.phone = phone;
      if (email !== undefined) partnerUpdates.email = email;
      if (website !== undefined) partnerUpdates.website = website;
      if (openingHours !== undefined) partnerUpdates.openingHours = openingHours;
      if (features !== undefined) partnerUpdates.features = features;
      if (amenities !== undefined) partnerUpdates.amenities = amenities;

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
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

    // When a partner transitions TO ACTIVE, activate the owning user account and
    // send the approval email. Guard against re-firing on already-active partners.
    if (updateData.status === PartnerStatus.ACTIVE && partner.status !== PartnerStatus.ACTIVE) {
      const partnerUser = await prisma.user.update({
        where: { id: updated.userId },
        data: { status: UserStatus.ACTIVE },
        select: { email: true, firstName: true, status: true },
      });

      emailService.sendPartnerApprovalEmail(partnerUser.email, {
        firstName: partnerUser.firstName || partnerUser.email.split('@')[0],
        businessName: updated.businessName,
      }).catch((err) => logger.error('Failed to send partner approval email:', err));
    }

    const typeMax = updated.partnerType?.maxDiscountRate ?? null;
    const response: any = {
      success: true,
      data: {
        ...updated,
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
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (!partner.pendingChanges) {
      return res.status(400).json({ success: false, error: 'No pending changes to approve' });
    }

    const applyData = partner.pendingChanges as Record<string, unknown>;

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        ...(applyData as any),
        pendingChanges: null,
        pendingChangesAt: null,
      },
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

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
    const partner = await prisma.partner.findUnique({ where: { id: req.params.id } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    if (!partner.pendingChanges) {
      return res.status(400).json({ success: false, error: 'No pending changes to reject' });
    }

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: { pendingChanges: null, pendingChangesAt: null },
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

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
        partnerType: true,
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
        },
      });

      // Admin onboarding always creates an active partner; a status override in
      // the request body is still honoured (e.g. bulk-import with explicit status).
      const resolvedStatus = status && Object.values(PartnerStatus).includes(status)
        ? (status as PartnerStatus)
        : PartnerStatus.ACTIVE;

      const partner = await tx.partner.create({
        data: {
          userId: user.id,
          businessName,
          businessNameBg: businessNameBg || null,
          category,
          categories: categories && Array.isArray(categories) && categories.length > 0
            ? categories
            : [category],
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
          verifiedAt: resolvedStatus === PartnerStatus.ACTIVE ? new Date() : null,
        },
        include: { partnerType: { select: PARTNER_TYPE_SELECT } },
      });

      return { user, partner };
    });

    // Auto-create venues from onboarding data
    const venuesToCreate = [];

    if (Array.isArray(locations) && locations.length > 0) {
      // Prefer structured locations array (from admin create form with geocoded coords)
      for (const loc of locations) {
        if (loc.name && loc.address && loc.city) {
          venuesToCreate.push({
            partnerId: result.partner.id,
            name: loc.name,
            address: loc.address,
            city: loc.city,
            region: loc.region || null,
            phone: loc.phone || null,
            latitude: typeof loc.latitude === 'number' ? loc.latitude : null,
            longitude: typeof loc.longitude === 'number' ? loc.longitude : null,
          });
        }
      }
    } else {
      // Fallback: create primary venue from top-level address fields
      if (address && city) {
        venuesToCreate.push({
          partnerId: result.partner.id,
          name: businessName,
          address,
          city,
          region: region || null,
          phone: phone || null,
          latitude: null,
          longitude: null,
        });
      }

      // Additional venues from legacy additionalVenues array
      if (Array.isArray(additionalVenues)) {
        for (const v of additionalVenues) {
          if (v.name && v.address && v.city) {
            venuesToCreate.push({
              partnerId: result.partner.id,
              name: v.name,
              address: v.address,
              city: v.city,
              region: v.region || null,
              phone: v.phone || null,
              latitude: typeof v.latitude === 'number' ? v.latitude : null,
              longitude: typeof v.longitude === 'number' ? v.longitude : null,
            });
          }
        }
      }
    }

    if (venuesToCreate.length > 0) {
      await prisma.venue.createMany({ data: venuesToCreate });
    }

    // Fire partner.created for all wizard-created partners.
    // Wizard partners are born ACTIVE (no separate approval step), so also fire
    // partner.approved immediately so both welcome and approval automations run.
    fireAutomation('partner.created', {
      partnerId: result.partner.id,
      recipientEmail: result.partner.email ?? undefined,
      recipientName: result.partner.businessName,
    }).catch((err) => logger.error('[automation] partner.created fire failed (onboard):', err));

    fireAutomation('partner.approved', {
      partnerId: result.partner.id,
      recipientEmail: result.partner.email ?? undefined,
      recipientName: result.partner.businessName,
    }).catch((err) => logger.error('[automation] partner.approved fire failed (onboard):', err));

    const typeMax = result.partner.partnerType?.maxDiscountRate ?? null;
    res.status(201).json({
      success: true,
      data: {
        ...result.partner,
        typeMaxDiscountPercent: typeMax,
        effectiveDiscountRate: result.partner.discountRate ?? typeMax,
        userCreated: true,
        userId: result.user.id,
      },
      message: `Partner "${businessName}" created successfully`,
    });
  }),
);

export default router;
