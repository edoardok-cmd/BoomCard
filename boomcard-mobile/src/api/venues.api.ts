/**
 * Venues API
 *
 * Handles venue discovery, search, and GPS-based nearby venues
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type { Venue, ApiResponse, PaginatedResponse } from '../types';

export class VenuesApi {
  /**
   * Get all venues with filters
   */
  static async getVenues(params?: {
    city?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<Venue>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const url = `${API_CONFIG.ENDPOINTS.VENUES.BASE}?${queryParams.toString()}`;
    return await apiClient.get<PaginatedResponse<Venue>>(url);
  }

  /**
   * Get single venue by ID
   */
  static async getVenueById(id: string): Promise<ApiResponse<Venue>> {
    return await apiClient.get<Venue>(
      `${API_CONFIG.ENDPOINTS.VENUES.BASE}/${id}`
    );
  }

  /**
   * Get nearby venues based on GPS coordinates
   */
  static async getNearbyVenues(
    latitude: number,
    longitude: number,
    radiusKm: number = 5
  ): Promise<ApiResponse<Array<Venue & { distance: number }>>> {
    const url = `${API_CONFIG.ENDPOINTS.VENUES.NEARBY}?lat=${latitude}&lon=${longitude}&radius=${radiusKm}`;
    return await apiClient.get(url);
  }

  /**
   * Search venues by name or location
   */
  static async searchVenues(
    query: string
  ): Promise<ApiResponse<PaginatedResponse<Venue>>> {
    const url = `${API_CONFIG.ENDPOINTS.VENUES.BASE}?search=${encodeURIComponent(query)}`;
    return await apiClient.get<PaginatedResponse<Venue>>(url);
  }

  /**
   * Get venues by city
   */
  static async getVenuesByCity(
    city: string
  ): Promise<ApiResponse<PaginatedResponse<Venue>>> {
    const url = `${API_CONFIG.ENDPOINTS.VENUES.BASE}?city=${encodeURIComponent(city)}`;
    return await apiClient.get<PaginatedResponse<Venue>>(url);
  }

  /**
   * Get venues by category
   */
  static async getVenuesByCategory(
    category: string
  ): Promise<ApiResponse<PaginatedResponse<Venue>>> {
    const url = `${API_CONFIG.ENDPOINTS.VENUES.BASE}?category=${encodeURIComponent(category)}`;
    return await apiClient.get<PaginatedResponse<Venue>>(url);
  }
}

export default VenuesApi;
