/**
 * Venue Service
 * Handles venue operations including search, filtering, and nearby venues
 */

import { Venue } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { publicPartnerJoinFilter } from './publicPartnerFilter';

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export interface VenueFilters {
  city?: string;
  region?: string;
  search?: string;
  partnerId?: string;
  latitude?: number;
  longitude?: number;
  radius?: number; // in km
  limit?: number;
  offset?: number;
  // Spec §5.3 v1.1 — when omitted/false, only venues owned by a publicly-visible
  // partner (status=ACTIVE + verifiedAt + isVisible) are returned. Admin/ops
  // callers that legitimately need to see all venues (e.g., menu review) opt in
  // by passing `includeHidden: true`.
  includeHidden?: boolean;
}

export interface VenueWithDistance extends Venue {
  distance?: number; // in km
}

// Fields that are admin-only and must not leak via public venue endpoints.
const ADMIN_ONLY_VENUE_FIELDS = [
  'pendingMenuUrl',
  'menuRejectionReason',
  'menuReviewedBy',
  // Menu-review timestamp pairs with the otherwise admin-only review workflow.
  'menuReviewedAt',
  // Admin-authored operational commentary (e.g. suspension reason) — internal only.
  'venueStatusNote',
  'venueStatusAt',
] as const;

function stripAdminVenueFields<T extends Record<string, any>>(venue: T): T {
  const out: any = { ...venue };
  for (const f of ADMIN_ONLY_VENUE_FIELDS) delete out[f];
  return out;
}

export const venueService = {
  /**
   * Get all venues with optional filters
   */
  async getVenues(filters: VenueFilters = {}): Promise<{
    venues: VenueWithDistance[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      city,
      region,
      search,
      partnerId,
      latitude,
      longitude,
      radius = 10,
      limit = 20,
      offset = 0,
      includeHidden = false,
    } = filters;

    // Build where clause
    const where: any = {};

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (region) {
      where.region = { contains: region, mode: 'insensitive' };
    }

    if (partnerId) {
      where.partnerId = partnerId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameBg: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Spec §5.3 — public listings gate on partner visibility matrix.
    if (!includeHidden) {
      where.partner = { ...publicPartnerJoinFilter };
      where.venueStatus = 'ACTIVE';
    }

    // Get venues
    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              logo: true,
            },
          },
        },
      }),
      prisma.venue.count({ where }),
    ]);

    // Calculate distances if coordinates provided
    let venuesWithDistance: VenueWithDistance[] = venues;

    if (latitude !== undefined && longitude !== undefined) {
      venuesWithDistance = venues
        .filter((venue) => venue.latitude != null && venue.longitude != null)
        .map((venue) => ({
          ...venue,
          distance: calculateDistance(latitude, longitude, venue.latitude!, venue.longitude!),
        }))
        .filter((venue) => !radius || venue.distance! <= radius)
        .sort((a, b) => a.distance! - b.distance!);
    }

    logger.info(`Found ${venuesWithDistance.length} venues`, { filters });

    return {
      venues: venuesWithDistance.map(stripAdminVenueFields),
      total: latitude !== undefined ? venuesWithDistance.length : total,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  },

  /**
   * Get nearby venues based on GPS coordinates
   */
  async getNearbyVenues(
    latitude: number,
    longitude: number,
    radius: number = 5,
    limit: number = 20,
    options: { includeHidden?: boolean } = {},
  ): Promise<VenueWithDistance[]> {
    logger.info(`Searching for venues near (${latitude}, ${longitude}) within ${radius}km`);

    // Get all venues (we'll filter by distance)
    // In production, you might want to use PostGIS for efficient geo queries
    // Spec §5.3 — public callers (default) only see venues owned by a
    // publicly-visible partner.
    const venues = await prisma.venue.findMany({
      where: options.includeHidden ? undefined : { partner: { ...publicPartnerJoinFilter }, venueStatus: 'ACTIVE' as any },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            logo: true,
          },
        },
      },
    });

    // Calculate distances and filter (skip venues with no coordinates)
    const venuesWithDistance = venues
      .filter((venue) => venue.latitude != null && venue.longitude != null)
      .map((venue) => ({
        ...venue,
        distance: calculateDistance(latitude, longitude, venue.latitude!, venue.longitude!),
      }))
      .filter((venue) => venue.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    logger.info(`Found ${venuesWithDistance.length} nearby venues`);

    return venuesWithDistance.map(stripAdminVenueFields);
  },

  /**
   * Get single venue by ID
   */
  async getVenueById(id: string, options: { includeHidden?: boolean } = {}): Promise<Venue | null> {
    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            logo: true,
            email: true,
            phone: true,
            // Needed for the §5.3 public matrix check below.
            status: true,
            verifiedAt: true,
            isVisible: true,
          },
        },
        // stickerConfig intentionally excluded: contains cashbackPercent,
        // autoApproveThreshold, premiumBonus, platinumBonus — internal Business
        // Formula fields that must never be surfaced via a public endpoint
        // (spec §11.3, Clash 10.6). Admin callers that need stickerConfig should
        // query the sticker config endpoint directly.
      },
    });

    if (!venue) {
      logger.warn(`Venue not found: ${id}`);
      return null;
    }

    // Spec §5.3 — public callers (default) get 404 if the owning partner is
    // suspended / not-yet-activated / hidden. Internal callers that need to
    // operate on the venue regardless (admin ops, partner self-service menu
    // upload) opt in via `includeHidden: true`.
    if (!options.includeHidden) {
      // Venue-level status gate (spec §5.3) — venue must be ACTIVE, not INACTIVE/SUSPENDED.
      if ((venue as any).venueStatus !== 'ACTIVE') return null;
      const p = venue.partner as { status: string; verifiedAt: Date | null; isVisible: boolean } | null;
      if (!p || p.status !== 'ACTIVE' || !p.verifiedAt || !p.isVisible) {
        return null;
      }
    }

    logger.info(`Retrieved venue: ${venue.name}`, { venueId: id });

    // §5.3 leak fix: partner.status / verifiedAt / isVisible are selected only
    // to evaluate the public visibility-matrix gate above. They are internal
    // partner control fields and must NOT reach a public (non-admin) caller —
    // stripAdminVenueFields only handles top-level venue columns, not nested
    // partner fields. Mirrors offers.service.getOfferById. Admins (includeHidden)
    // legitimately keep them.
    const stripped: any = stripAdminVenueFields(venue);
    if (!options.includeHidden && stripped.partner) {
      const { status: _s, verifiedAt: _v, isVisible: _iv, ...publicPartner } = stripped.partner;
      stripped.partner = publicPartner;
    }
    return stripped;
  },

  /**
   * Get venues by city
   */
  async getVenuesByCity(city: string, options: { includeHidden?: boolean } = {}): Promise<Venue[]> {
    const venues = await prisma.venue.findMany({
      where: {
        city: { contains: city, mode: 'insensitive' },
        // Spec §5.3 — public default gates on partner visibility matrix.
        ...(options.includeHidden ? {} : { partner: { ...publicPartnerJoinFilter }, venueStatus: 'ACTIVE' as any }),
      },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            logo: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    logger.info(`Found ${venues.length} venues in ${city}`);
    return venues.map(stripAdminVenueFields);
  },

  /**
   * Get all cities with venues
   */
  async getCities(options: { includeHidden?: boolean } = {}): Promise<{ city: string; count: number }[]> {
    // Spec §5.3 — only count cities that have at least one publicly-visible
    // venue when the caller doesn't opt in. Otherwise the cities dropdown
    // shows entries for suspended/hidden partners.
    const venues = await prisma.venue.groupBy({
      by: ['city'],
      where: options.includeHidden ? undefined : { partner: { ...publicPartnerJoinFilter }, venueStatus: 'ACTIVE' as any },
      _count: {
        id: true,
      },
      orderBy: {
        city: 'asc',
      },
    });

    return venues.map((v) => ({
      city: v.city,
      count: v._count.id,
    }));
  },

  /**
   * Create new venue (admin/partner only)
   */
  async createVenue(data: {
    partnerId: string;
    name: string;
    nameBg?: string;
    address: string;
    city: string;
    region?: string;
    latitude?: number | null;
    longitude?: number | null;
    phone?: string;
    email?: string;
    description?: string;
    descriptionBg?: string;
    images?: string[];
    openingHours?: any;
    capacity?: number;
    features?: string[];
  }): Promise<Venue> {
    const venue = await prisma.venue.create({
      data: {
        partnerId: data.partnerId,
        name: data.name,
        nameBg: data.nameBg,
        address: data.address,
        city: data.city,
        region: data.region,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        phone: data.phone,
        email: data.email,
        description: data.description,
        descriptionBg: data.descriptionBg,
        capacity: data.capacity,
        images: data.images ? JSON.stringify(data.images) : null,
        openingHours: data.openingHours ? JSON.stringify(data.openingHours) : null,
        features: data.features ? JSON.stringify(data.features) : null,
      },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            logo: true,
          },
        },
      },
    });

    logger.info(`Created venue: ${venue.name}`, { venueId: venue.id });
    return venue;
  },

  /**
   * Update venue
   */
  async updateVenue(
    id: string,
    data: Partial<{
      name: string;
      nameBg: string;
      address: string;
      city: string;
      region: string;
      latitude: number;
      longitude: number;
      phone: string;
      email: string;
      description: string;
      descriptionBg: string;
      images: string[];
      openingHours: any;
      capacity: number;
      features: string[];
      menuImages: string | null;
    }>
  ): Promise<Venue> {
    const updateData: any = { ...data };

    if (data.images) {
      updateData.images = JSON.stringify(data.images);
    }
    if (data.openingHours) {
      updateData.openingHours = JSON.stringify(data.openingHours);
    }
    if (data.features) {
      updateData.features = JSON.stringify(data.features);
    }

    const venue = await prisma.venue.update({
      where: { id },
      data: updateData,
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            logo: true,
          },
        },
      },
    });

    logger.info(`Updated venue: ${venue.name}`, { venueId: id });
    // LOW-1: strip admin-only fields on every update return so callers cannot
    // observe pendingMenuUrl / menuRejectionReason / menuReviewedBy from the
    // update response (mirrors the read-path contract).
    return stripAdminVenueFields(venue);
  },

  /**
   * Delete venue
   */
  async deleteVenue(id: string): Promise<void> {
    // Guard: if the venue doesn't exist Prisma throws P2025 which surfaces as
    // a 500. Return a sentinel so the route can issue a proper 404 instead.
    const existing = await prisma.venue.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      const err: any = new Error('Venue not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    await prisma.venue.delete({
      where: { id },
    });

    logger.info(`Deleted venue`, { venueId: id });
  },

  /**
   * Search venues with full-text search
   */
  async searchVenues(query: string, limit: number = 20, options: { includeHidden?: boolean } = {}): Promise<Venue[]> {
    const venues = await prisma.venue.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { nameBg: { contains: query, mode: 'insensitive' } },
          { address: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { descriptionBg: { contains: query, mode: 'insensitive' } },
        ],
        // Spec §5.3 — public default gates on partner visibility matrix.
        ...(options.includeHidden ? {} : { partner: { ...publicPartnerJoinFilter }, venueStatus: 'ACTIVE' as any }),
      },
      take: limit,
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            logo: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    logger.info(`Search for "${query}" returned ${venues.length} venues`);
    return venues.map(stripAdminVenueFields);
  },
};
