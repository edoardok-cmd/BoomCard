/**
 * Offers API
 *
 * Handles offers, promotions, and deals browsing
 */

import apiClient from './client';
import { API_CONFIG } from '../constants/config';
import type { Offer, ApiResponse, PaginatedResponse } from '../types';

export class OffersApi {
  /**
   * Get all offers with filters
   */
  static async getOffers(params?: {
    category?: string;
    city?: string;
    minDiscount?: number;
    search?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PaginatedResponse<Offer>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const url = `${API_CONFIG.ENDPOINTS.OFFERS.BASE}?${queryParams.toString()}`;
    return await apiClient.get<PaginatedResponse<Offer>>(url);
  }

  /**
   * Get single offer by ID
   */
  static async getOfferById(id: string): Promise<ApiResponse<Offer>> {
    return await apiClient.get<Offer>(
      `${API_CONFIG.ENDPOINTS.OFFERS.BASE}/${id}`
    );
  }

  /**
   * Get top offers
   */
  static async getTopOffers(limit: number = 10): Promise<ApiResponse<Offer[]>> {
    const url = `${API_CONFIG.ENDPOINTS.OFFERS.TOP}?limit=${limit}`;
    return await apiClient.get<Offer[]>(url);
  }

  /**
   * Get featured offers
   */
  static async getFeaturedOffers(): Promise<ApiResponse<Offer[]>> {
    return await apiClient.get<Offer[]>(API_CONFIG.ENDPOINTS.OFFERS.FEATURED);
  }

  /**
   * Get offers by partner
   */
  static async getPartnerOffers(
    partnerId: string
  ): Promise<ApiResponse<PaginatedResponse<Offer>>> {
    const url = `${API_CONFIG.ENDPOINTS.OFFERS.BASE}/partner/${partnerId}`;
    return await apiClient.get<PaginatedResponse<Offer>>(url);
  }

  /**
   * Get offers by city
   */
  static async getOffersByCity(
    city: string
  ): Promise<ApiResponse<PaginatedResponse<Offer>>> {
    const url = `${API_CONFIG.ENDPOINTS.OFFERS.BASE}/city/${city}`;
    return await apiClient.get<PaginatedResponse<Offer>>(url);
  }

  /**
   * Get offers by category
   */
  static async getOffersByCategory(
    category: string
  ): Promise<ApiResponse<PaginatedResponse<Offer>>> {
    const url = `${API_CONFIG.ENDPOINTS.OFFERS.BASE}/category/${category}`;
    return await apiClient.get<PaginatedResponse<Offer>>(url);
  }

  /**
   * Search offers
   */
  static async searchOffers(
    query: string
  ): Promise<ApiResponse<PaginatedResponse<Offer>>> {
    const url = `${API_CONFIG.ENDPOINTS.OFFERS.BASE}?search=${encodeURIComponent(query)}`;
    return await apiClient.get<PaginatedResponse<Offer>>(url);
  }

  /**
   * Activate/redeem offer
   */
  static async activateOffer(
    offerId: string
  ): Promise<ApiResponse<{ code: string; expiresAt: string }>> {
    return await apiClient.post(`${API_CONFIG.ENDPOINTS.OFFERS.BASE}/${offerId}/activate`);
  }
}

export default OffersApi;
