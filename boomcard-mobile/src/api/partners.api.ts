/**
 * Partners API
 *
 * Fetches partner data from the backend. All list endpoints are tier-gated:
 * the backend automatically filters results based on the caller's active
 * subscription plan (sent automatically via the Bearer token).
 *
 * Plan → visible partner tiers:
 *   LIGHT   → BASIC tier partners only
 *   BASIC   → BASIC + STANDARD + PREMIUM tier partners
 *   PREMIUM → all tiers (including VIP + EXCLUSIVE)
 *   (no auth / no plan) → BASIC tier only
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type { Partner, ApiResponse, PaginatedResponse } from '../types';

export class PartnersApi {
  /**
   * List partners visible to the current user's subscription plan.
   * Unauthenticated callers see BASIC-tier partners only.
   */
  static async getPartners(params?: {
    category?: string;
    city?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<Partner>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) queryParams.append(key, String(value));
      });
    }
    const qs = queryParams.toString();
    const url = `${API_CONFIG.ENDPOINTS.PARTNERS.BASE}${qs ? `?${qs}` : ''}`;
    return apiClient.get<PaginatedResponse<Partner>>(url);
  }

  /**
   * Get a single partner by ID.
   * Returns an error with code TIER_ACCESS_DENIED if the user's plan
   * doesn't include this partner's tier.
   */
  static async getPartnerById(id: string): Promise<ApiResponse<ApiResponse<Partner>>> {
    // The backend wraps the partner in its own { success, data } envelope, and
    // apiClient.get re-wraps that, so the actual partner lives at res.data.data
    // (mirror getOfferById — task 021).
    return apiClient.get<ApiResponse<Partner>>(`${API_CONFIG.ENDPOINTS.PARTNERS.BASE}/${id}`);
  }

  /**
   * Get the current partner user's own profile (authenticated PARTNER role only).
   * Includes tierMaxDiscountPercent — the max offer discount allowed by their tier.
   */
  static async getMyPartnerProfile(): Promise<ApiResponse<Partner & { tierMaxDiscountPercent: number }>> {
    return apiClient.get<Partner & { tierMaxDiscountPercent: number }>(
      API_CONFIG.ENDPOINTS.PARTNERS.ME,
    );
  }

  /**
   * Get tier constraints for a specific partner (owner or admin only).
   */
  static async getPartnerTierInfo(partnerId: string): Promise<ApiResponse<{
    partnerId: string;
    businessName: string;
    tier: string;
    tierMaxDiscountPercent: number;
    tierDescription: string;
  }>> {
    return apiClient.get(`${API_CONFIG.ENDPOINTS.PARTNERS.BASE}/${partnerId}/tier-info`);
  }

  /**
   * Search partners by name (filtered by current user's plan).
   */
  static async searchPartners(
    query: string,
    params?: { page?: number; limit?: number },
  ): Promise<ApiResponse<PaginatedResponse<Partner>>> {
    return PartnersApi.getPartners({ search: query, ...params });
  }

  /**
   * Get partners by category (filtered by current user's plan).
   */
  static async getPartnersByCategory(
    category: string,
    params?: { page?: number; limit?: number },
  ): Promise<ApiResponse<PaginatedResponse<Partner>>> {
    return PartnersApi.getPartners({ category, ...params });
  }

  /**
   * Get partners by city (filtered by current user's plan).
   */
  static async getPartnersByCity(
    city: string,
    params?: { page?: number; limit?: number },
  ): Promise<ApiResponse<PaginatedResponse<Partner>>> {
    return PartnersApi.getPartners({ city, ...params });
  }
}

export default PartnersApi;
