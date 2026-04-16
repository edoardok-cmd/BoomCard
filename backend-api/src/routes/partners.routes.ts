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
import { OfferStatus, PartnerStatus } from '@prisma/client';
import { partnerTypeService } from '../services/partnerType.service';

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
    const { category, city, status, search, partnerTypeId, page = '1', limit = '20' } = req.query as Record<string, string>;

    const where: any = {
      status: status ?? PartnerStatus.ACTIVE,
    };
    if (category) where.category = category;
    if (city) where.city = city;
    if (partnerTypeId) where.partnerTypeId = partnerTypeId;
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
        venues: { select: { id: true, name: true, city: true } },
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

    // Validate optional discountRate against the type's cap
    let resolvedDiscountRate: number | undefined;
    if (discountRate !== undefined) {
      const rate = Number(discountRate);
      if (!isFinite(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ success: false, error: 'discountRate must be a number between 0 and 100' });
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
          latitude: typeof loc.latitude === 'number' ? loc.latitude : 0,
          longitude: typeof loc.longitude === 'number' ? loc.longitude : 0,
          phone: loc.phone ?? null,
        })),
      });
    }

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
        if (!isFinite(rate) || rate < 0 || rate > 100) {
          return res.status(400).json({ success: false, error: 'discountRate must be a number between 0 and 100' });
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
    }

    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    const updated = await prisma.partner.update({
      where: { id: req.params.id },
      data: updateData,
      include: { partnerType: { select: PARTNER_TYPE_SELECT } },
    });

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
      highlights,
      additionalAddresses,
      additionalVenues,
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

    // Check if a user with this email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      // Check if they already have a partner record
      const existingPartner = await prisma.partner.findUnique({ where: { userId: existingUser.id } });
      if (existingPartner) {
        return res.status(409).json({ success: false, error: 'A partner with this email already exists' });
      }
    }

    // Validate partnerTypeId if provided
    if (partnerTypeId) {
      const ptype = await prisma.partnerType.findUnique({ where: { id: partnerTypeId } });
      if (!ptype || !ptype.isActive) {
        return res.status(400).json({ success: false, error: 'Invalid or inactive partnerTypeId' });
      }
      if (discountRate !== undefined) {
        const rate = Number(discountRate);
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
    if (categories && Array.isArray(categories)) featuresData.categories = categories;

    // Build amenities from highlights
    const amenitiesData = highlights && highlights.length > 0
      ? (Array.isArray(highlights) ? highlights : highlights.split(',').map((h: string) => h.trim()).filter(Boolean))
      : undefined;

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get or create the user with PARTNER role
      let user = existingUser;
      if (!user) {
        const bcrypt = await import('bcryptjs');
        const tempPassword = await bcrypt.hash(
          Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase() + '!1',
          10
        );
        user = await tx.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash: tempPassword,
            firstName: primaryContact?.split(' ')[0] || ownerName?.split(' ')[0] || businessName.split(' ')[0],
            lastName: primaryContact?.split(' ').slice(1).join(' ') || ownerName?.split(' ').slice(1).join(' ') || '',
            role: 'PARTNER' as any,
            phone: phone || null,
            emailVerified: false,
          },
        });
      } else if (existingUser!.role !== 'PARTNER') {
        user = await tx.user.update({
          where: { id: existingUser!.id },
          data: { role: 'PARTNER' as any },
        });
      }

      const resolvedStatus = status && Object.values(PartnerStatus).includes(status)
        ? (status as PartnerStatus)
        : PartnerStatus.PENDING;

      const partner = await tx.partner.create({
        data: {
          userId: user.id,
          businessName,
          businessNameBg: businessNameBg || null,
          category,
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

    // Always create primary venue from main address
    if (address && city) {
      venuesToCreate.push({
        partnerId: result.partner.id,
        name: businessName,
        address,
        city,
        region: region || null,
        phone: phone || null,
        latitude: 0,
        longitude: 0,
      });
    }

    // Create additional venues
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
            latitude: 0,
            longitude: 0,
          });
        }
      }
    }

    if (venuesToCreate.length > 0) {
      await prisma.venue.createMany({ data: venuesToCreate });
    }

    const typeMax = result.partner.partnerType?.maxDiscountRate ?? null;
    res.status(201).json({
      success: true,
      data: {
        ...result.partner,
        typeMaxDiscountPercent: typeMax,
        effectiveDiscountRate: result.partner.discountRate ?? typeMax,
        userCreated: !existingUser,
        userId: result.user.id,
      },
      message: `Partner "${businessName}" created successfully`,
    });
  }),
);

export default router;
