/**
 * Venue Service
 * Handles venue operations including search, filtering, and nearby venues
 */

import { PrismaClient, Venue } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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
}

export interface VenueWithDistance extends Venue {
  distance?: number; // in km
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
        .map((venue) => ({
          ...venue,
          distance: calculateDistance(latitude, longitude, venue.latitude, venue.longitude),
        }))
        .filter((venue) => !radius || venue.distance! <= radius)
        .sort((a, b) => a.distance! - b.distance!);
    }

    logger.info(`Found ${venuesWithDistance.length} venues`, { filters });

    return {
      venues: venuesWithDistance,
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
    limit: number = 20
  ): Promise<VenueWithDistance[]> {
    logger.info(`Searching for venues near (${latitude}, ${longitude}) within ${radius}km`);

    // Get all venues (we'll filter by distance)
    // In production, you might want to use PostGIS for efficient geo queries
    const venues = await prisma.venue.findMany({
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

    // Calculate distances and filter
    const venuesWithDistance = venues
      .map((venue) => ({
        ...venue,
        distance: calculateDistance(latitude, longitude, venue.latitude, venue.longitude),
      }))
      .filter((venue) => venue.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    logger.info(`Found ${venuesWithDistance.length} nearby venues`);

    return venuesWithDistance;
  },

  /**
   * Get single venue by ID
   */
  async getVenueById(id: string): Promise<Venue | null> {
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
          },
        },
        stickerConfig: true,
      },
    });

    if (!venue) {
      logger.warn(`Venue not found: ${id}`);
      return null;
    }

    logger.info(`Retrieved venue: ${venue.name}`, { venueId: id });
    return venue;
  },

  /**
   * Get venues by city
   */
  async getVenuesByCity(city: string): Promise<Venue[]> {
    const venues = await prisma.venue.findMany({
      where: {
        city: { contains: city, mode: 'insensitive' },
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
    return venues;
  },

  /**
   * Get all cities with venues
   */
  async getCities(): Promise<{ city: string; count: number }[]> {
    const venues = await prisma.venue.groupBy({
      by: ['city'],
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
    latitude: number;
    longitude: number;
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
        ...data,
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
    return venue;
  },

  /**
   * Delete venue
   */
  async deleteVenue(id: string): Promise<void> {
    await prisma.venue.delete({
      where: { id },
    });

    logger.info(`Deleted venue`, { venueId: id });
  },

  /**
   * Search venues with full-text search
   */
  async searchVenues(query: string, limit: number = 20): Promise<Venue[]> {
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
    return venues;
  },
};
