/**
 * Venues Routes
 * Public and authenticated endpoints for venue operations
 */

import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { venueService } from '../services/venue.service';
import { logger } from '../utils/logger';

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
    if (!partnerId || !name || !address || !city || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: partnerId, name, address, city, latitude, longitude',
      });
    }

    const venue = await venueService.createVenue({
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
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

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
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    await venueService.deleteVenue(id);

    res.json({
      success: true,
      message: 'Venue deleted successfully',
    });
  })
);

export default router;
