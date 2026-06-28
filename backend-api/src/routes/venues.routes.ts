/**
 * Venues Routes
 * Public and authenticated endpoints for venue operations
 */

import { Router, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, requireActiveAdmin, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { venueService } from '../services/venue.service';
import { imageUploadService } from '../services/imageUpload.service';
import { logger } from '../utils/logger';
import { parsePagination } from '../utils/pagination';

// S1: image/jpeg|jpg|png|webp only — application/octet-stream removed because
// it allows any binary to pass the MIME type filter. The offers image endpoint
// already uses validateMagicBytes for defence-in-depth; the same protection
// applies here via the restricted allowed list.
const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

/**
 * GET /api/venues
 * Get all venues with optional filters
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      city,
      region,
      search,
      partnerId,
      latitude,
      longitude,
      radius,
    } = req.query;

    // Clamp untrusted limit/offset before they reach the service → Prisma.
    // Default page size 20, hard cap 100; take == limit, skip == offset.
    const { take, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const filters = {
      city: city as string,
      region: region as string,
      search: search as string,
      partnerId: partnerId as string,
      latitude: latitude ? parseFloat(latitude as string) : undefined,
      longitude: longitude ? parseFloat(longitude as string) : undefined,
      radius: radius ? parseFloat(radius as string) : undefined,
      limit: take,
      offset: skip,
    };

    const result = await venueService.getVenues(filters);

    res.json({
      success: true,
      data: result.venues,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  })
);

/**
 * GET /api/venues/nearby
 * Get nearby venues based on GPS coordinates.
 *
 * F-020: Spec §16 marks this feature as deferred. Gated behind the
 * ENABLE_NEARBY_VENUES env var (default: false). Returns 501 when disabled.
 * Set ENABLE_NEARBY_VENUES=true to enable when product confirms the feature.
 */
router.get(
  '/nearby',
  asyncHandler(async (req, res) => {
    // F-020: Feature flag gate — spec §16 marks nearby-venues as deferred.
    // Default is false (disabled) so production stays spec-compliant.
    // Set env var ENABLE_NEARBY_VENUES=true when the feature is confirmed.
    const isNearbyVenuesEnabled = (process.env.ENABLE_NEARBY_VENUES ?? 'false').toLowerCase() === 'true';
    if (!isNearbyVenuesEnabled) {
      return res.status(501).json({
        success: false,
        error: 'Feature not yet available.',
      });
    }

    const { latitude, longitude, radius } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const rad = radius ? parseFloat(radius as string) : 5;
    // Clamp untrusted limit before it reaches the service → Prisma. Default 20, cap 100.
    const { take: lim } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const venues = await venueService.getNearbyVenues(lat, lon, rad, lim);

    res.json({
      success: true,
      data: venues,
      meta: {
        count: venues.length,
        coordinates: { latitude: lat, longitude: lon },
        radius: rad,
      },
    });
  })
);

/**
 * GET /api/venues/search
 * Full-text search across venues
 */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required',
      });
    }

    const { take: lim } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const venues = await venueService.searchVenues(q as string, lim);

    res.json({
      success: true,
      data: venues,
      meta: {
        query: q,
        count: venues.length,
      },
    });
  })
);

/**
 * GET /api/venues/cities
 * Get all cities with venue counts
 */
router.get(
  '/cities',
  asyncHandler(async (req, res) => {
    const cities = await venueService.getCities();

    res.json({
      success: true,
      data: cities,
      meta: {
        count: cities.length,
      },
    });
  })
);

/**
 * GET /api/venues/:id
 * Get venue by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const venue = await venueService.getVenueById(id);

    if (!venue) {
      return res.status(404).json({
        success: false,
        error: 'Venue not found',
      });
    }

    res.json({
      success: true,
      data: venue,
    });
  })
);

/**
 * POST /api/venues
 * Create new venue (Admin only).
 *
 * B3 / §11.4 / §4.1: Partners must NOT directly create venue records.
 * All partner-initiated location additions must flow through the Change Request
 * (Help system) workflow so an admin reviews and applies the change.
 * PARTNER has been removed from authorize() to enforce this.
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      partnerId,
      name,
      nameBg,
      address,
      city,
      region,
      latitude,
      longitude,
      phone,
      email,
      description,
      descriptionBg,
      images,
      openingHours,
      capacity,
      features,
    } = req.body;

    // Validate required fields
    if (!partnerId || !name || !address || !city) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: partnerId, name, address, city',
      });
    }

    // Geolocation is a REQUIRED field — every venue must be geocoded so the
    // offer-redemption proximity gate (anti-fraud, 100m radius) can be enforced.
    // A venue cannot be created without valid coordinates.
    const latNum = Number(latitude);
    const lngNum = Number(longitude);
    if (
      latitude == null || longitude == null ||
      Number.isNaN(latNum) || Number.isNaN(lngNum) ||
      latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180
    ) {
      return res.status(400).json({
        success: false,
        error: 'Venue geolocation is required: provide a valid latitude (-90..90) and longitude (-180..180).',
      });
    }

    const venue = await venueService.createVenue({
      partnerId,
      name,
      nameBg,
      address,
      city,
      region,
      latitude: latNum,
      longitude: lngNum,
      phone,
      email,
      description,
      descriptionBg,
      images,
      openingHours,
      capacity,
      features,
    });

    res.status(201).json({
      success: true,
      data: venue,
      message: 'Venue created successfully',
    });
  })
);

/**
 * PUT /api/venues/:id
 * Update venue (Admin only).
 *
 * B2 / B3 / §11.4 / §4.1: Partners must NOT directly modify venue records.
 * All partner-initiated location changes must flow through the Change Request
 * (Help system) workflow so an admin reviews and applies the change. PARTNER
 * has been removed from authorize() to enforce this requirement and to prevent
 * the field-allowlist bypass (writing menuStatus, menuUrl, venueStatus, etc.
 * directly into the venue row via req.body passthrough).
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // HIGH-2 (r2k): extract only the allowed fields from req.body before passing
    // to the service. Express types req.body as `any` and updateVenue's parameter
    // is `Partial<...>` with `any` spread inside, so TypeScript does NOT prevent
    // unintended fields (menuStatus, venueStatus, partnerId, pendingMenuUrl, etc.)
    // from reaching the Prisma update — they would be silently written to the DB,
    // bypassing the menu lifecycle audit trail and venue lifecycle controls.
    const {
      name, nameBg, address, city, region,
      latitude, longitude,
      phone, email, description, descriptionBg,
      images, openingHours, capacity, features,
    } = req.body;

    const venue = await venueService.updateVenue(id, {
      name, nameBg, address, city, region,
      latitude, longitude,
      phone, email, description, descriptionBg,
      images, openingHours, capacity, features,
    });

    res.json({
      success: true,
      data: venue,
      message: 'Venue updated successfully',
    });
  })
);

/**
 * DELETE /api/venues/:id
 * Delete venue (Admin only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      await venueService.deleteVenue(id);
    } catch (err: any) {
      if (err?.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'Venue not found' });
      }
      throw err;
    }

    res.json({
      success: true,
      message: 'Venue deleted successfully',
    });
  })
);

/**
 * POST /api/venues/:id/menu
 * Upload menu images for a venue (Admin only).
 * multipart/form-data field: images (up to 20 files)
 *
 * §8a / MED-1: Offer & menu management is not a partner-owned self-service
 * workflow. PARTNER removed here to align with the sibling /menu/submit and
 * /menu/withdraw routes (which already removed PARTNER per §8a). Previously a
 * partner got 403 on /menu/submit but 200 on this image-upload path — an
 * inconsistency. Only admins may write venue menu content until a product spec
 * authorizes partner self-service.
 */
router.post(
  '/:id/menu',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  menuUpload.array('images', 20),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one image file is required (field: images)' });
    }

    const venue = await venueService.getVenueById(id, { includeHidden: true });
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    // Upload each image to S3
    const uploadedUrls: string[] = [];
    for (const file of files) {
      try {
        const result = await imageUploadService.uploadImage({
          file: file.buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
          folder: 'venue-menus',
          userId: req.user!.id,
        });
        uploadedUrls.push(result.url);
      } catch (err: any) {
        logger.warn(`Failed to upload menu image "${file.originalname}": ${err.message}`);
      }
    }

    if (uploadedUrls.length === 0) {
      return res.status(500).json({ success: false, error: 'All image uploads failed' });
    }

    // Append to existing menuImages (INFO-1: guard against malformed stored JSON)
    let existing: string[] = [];
    if (venue.menuImages) {
      try {
        existing = JSON.parse(venue.menuImages as string);
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }

    // LOW-2 (r2k): cap total accumulated menu images per venue. Without this a
    // partner (or admin) could call the endpoint repeatedly to grow the array
    // indefinitely. 100 total URLs is a generous ceiling for any real menu.
    const MAX_MENU_IMAGES = 100;
    if (existing.length + uploadedUrls.length > MAX_MENU_IMAGES) {
      return res.status(400).json({
        success: false,
        error: `Venue already has ${existing.length} menu image(s). Cannot exceed ${MAX_MENU_IMAGES} total images per venue.`,
      });
    }

    const merged = [...existing, ...uploadedUrls];

    await venueService.updateVenue(id, { menuImages: JSON.stringify(merged) });

    res.json({
      success: true,
      data: { menuImages: merged, uploaded: uploadedUrls.length },
      message: `${uploadedUrls.length} menu image(s) uploaded`,
    });
  })
);

/**
 * DELETE /api/venues/:id/menu
 * Clear all menu images for a venue (Admin only).
 *
 * §8a / MED-1: aligned with /menu/submit and /menu/withdraw — menu management
 * is not a partner self-service workflow. PARTNER removed; admin-only.
 */
router.delete(
  '/:id/menu',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const venue = await venueService.getVenueById(id, { includeHidden: true });
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    await venueService.updateVenue(id, { menuImages: null });

    res.json({ success: true, message: 'Menu images cleared' });
  })
);

/**
 * POST /api/venues/:id/menu/submit
 * Submit a menu URL for admin review.
 * Sets pendingMenuUrl + status=PENDING. Existing menuUrl (if approved) remains visible to users.
 *
 * MEDIUM-3 / §8a: Partner self-service menu submission is scope-creep per §8a
 * ("Not defined in source specs"). Removed PARTNER from authorize() until a
 * product specification explicitly authorizes this workflow. Only admins can
 * use this endpoint for now.
 */
router.post(
  '/:id/menu/submit',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { url } = req.body as { url?: string };

    const trimmed = (url ?? '').trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, error: 'Menu URL is required' });
    }
    if (trimmed.length > 2048) {
      return res.status(400).json({ success: false, error: 'Menu URL is too long (max 2048 characters)' });
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ success: false, error: 'Menu URL must use http or https' });
      }
    } catch {
      return res.status(400).json({ success: false, error: 'Menu URL is not a valid URL' });
    }

    const venueRecord = await prisma.venue.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!venueRecord) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    const updated = await prisma.venue.update({
      where: { id },
      data: {
        pendingMenuUrl: trimmed,
        menuStatus: 'PENDING',
        menuSubmittedAt: new Date(),
        menuRejectionReason: null,
      },
    });

    logger.info('[menu-audit] SUBMITTED', {
      venueId: id,
      userId: req.user!.id,
      pendingMenuUrl: trimmed,
      at: new Date().toISOString(),
    });

    // MEDIUM-4: return only non-internal fields. pendingMenuUrl and
    // menuRejectionReason are ADMIN_ONLY_VENUE_FIELDS per venue.service.ts
    // and must not be returned to any non-admin caller.
    res.json({
      success: true,
      data: {
        menuUrl: updated.menuUrl,
        menuStatus: updated.menuStatus,
        menuSubmittedAt: updated.menuSubmittedAt,
      },
      message: 'Menu URL submitted for review',
    });
  })
);

/**
 * POST /api/venues/:id/menu/withdraw
 * Withdraw a PENDING menu submission.
 * - If a previously approved menuUrl exists, keeps it and reverts status to APPROVED.
 * - Otherwise clears menu state back to NONE.
 *
 * MEDIUM-3 / §8a: Same reasoning as /menu/submit — PARTNER removed until a
 * product spec authorizes partner self-service menu management.
 */
router.post(
  '/:id/menu/withdraw',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  requireActiveAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const venueRecord = await prisma.venue.findUnique({
      where: { id },
      select: { id: true, menuStatus: true, menuUrl: true, menuSubmittedAt: true },
    });
    if (!venueRecord) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }
    if (venueRecord.menuStatus !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'No pending submission to withdraw' });
    }

    const nextStatus = venueRecord.menuUrl ? 'APPROVED' : 'NONE';
    const updated = await prisma.venue.update({
      where: { id },
      data: {
        pendingMenuUrl: null,
        menuStatus: nextStatus,
        menuRejectionReason: null,
        menuSubmittedAt: venueRecord.menuUrl ? venueRecord.menuSubmittedAt : null,
      },
    });

    logger.info('[menu-audit] WITHDRAWN', {
      venueId: id,
      userId: req.user!.id,
      revertedTo: nextStatus,
      at: new Date().toISOString(),
    });

    // MEDIUM-4: return only non-internal fields (same as /menu/submit response).
    res.json({
      success: true,
      data: {
        menuUrl: updated.menuUrl,
        menuStatus: updated.menuStatus,
        menuSubmittedAt: updated.menuSubmittedAt,
      },
      message: 'Submission withdrawn',
    });
  })
);

export default router;
