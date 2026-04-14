/**
 * Venues Routes
 * Public and authenticated endpoints for venue operations
 */

import { Router, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { venueService } from '../services/venue.service';
import { imageUploadService } from '../services/imageUpload.service';
import { logger } from '../utils/logger';

const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/octet-stream'];
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
      limit,
      offset,
    } = req.query;

    const filters = {
      city: city as string,
      region: region as string,
      search: search as string,
      partnerId: partnerId as string,
      latitude: latitude ? parseFloat(latitude as string) : undefined,
      longitude: longitude ? parseFloat(longitude as string) : undefined,
      radius: radius ? parseFloat(radius as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
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
 * Get nearby venues based on GPS coordinates
 */
router.get(
  '/nearby',
  asyncHandler(async (req, res) => {
    const { latitude, longitude, radius, limit } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const rad = radius ? parseFloat(radius as string) : 5;
    const lim = limit ? parseInt(limit as string) : 20;

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
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required',
      });
    }

    const lim = limit ? parseInt(limit as string) : 20;
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
 * Create new venue (Admin/Partner only)
 */
router.post(
  '/',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
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

    // PARTNER role: verify they own the specified partner record
    if (req.user!.role === 'PARTNER') {
      const partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { userId: true },
      });
      if (!partner || partner.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to create a venue for this partner',
        });
      }
    }

    const venue = await venueService.createVenue({
      partnerId,
      name,
      nameBg,
      address,
      city,
      region,
      latitude: latitude ?? 0,
      longitude: longitude ?? 0,
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
 * Update venue (Admin/Partner only)
 */
router.put(
  '/:id',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // PARTNER role: verify they own this venue
    if (req.user!.role === 'PARTNER') {
      const venue = await prisma.venue.findUnique({
        where: { id },
        include: { partner: { select: { userId: true } } },
      });
      if (!venue || venue.partner?.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this venue',
        });
      }
    }

    const venue = await venueService.updateVenue(id, req.body);

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
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    await venueService.deleteVenue(id);

    res.json({
      success: true,
      message: 'Venue deleted successfully',
    });
  })
);

/**
 * POST /api/venues/:id/menu
 * Upload menu images for a venue (Admin or owning Partner)
 * multipart/form-data field: images (up to 20 files)
 */
router.post(
  '/:id/menu',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  menuUpload.array('images', 20),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one image file is required (field: images)' });
    }

    const venue = await venueService.getVenueById(id);
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    // PARTNER role: verify they own this venue
    if (req.user!.role === 'PARTNER') {
      const venueRecord = await prisma.venue.findUnique({
        where: { id },
        include: { partner: { select: { userId: true } } },
      });
      if (!venueRecord || venueRecord.partner?.userId !== req.user!.id) {
        return res.status(403).json({ success: false, error: 'You do not have permission to upload menu images for this venue' });
      }
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

    // Append to existing menuImages
    const existing: string[] = venue.menuImages ? JSON.parse(venue.menuImages as string) : [];
    const merged = [...existing, ...uploadedUrls];

    const updated = await venueService.updateVenue(id, { menuImages: JSON.stringify(merged) });

    res.json({
      success: true,
      data: { menuImages: merged, uploaded: uploadedUrls.length },
      message: `${uploadedUrls.length} menu image(s) uploaded`,
    });
  })
);

/**
 * DELETE /api/venues/:id/menu
 * Clear all menu images for a venue (Admin or owning Partner)
 */
router.delete(
  '/:id/menu',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const venue = await venueService.getVenueById(id);
    if (!venue) {
      return res.status(404).json({ success: false, error: 'Venue not found' });
    }

    // PARTNER role: verify they own this venue
    if (req.user!.role === 'PARTNER') {
      const venueRecord = await prisma.venue.findUnique({
        where: { id },
        include: { partner: { select: { userId: true } } },
      });
      if (!venueRecord || venueRecord.partner?.userId !== req.user!.id) {
        return res.status(403).json({ success: false, error: 'You do not have permission to delete menu images for this venue' });
      }
    }

    await venueService.updateVenue(id, { menuImages: null });

    res.json({ success: true, message: 'Menu images cleared' });
  })
);

export default router;
