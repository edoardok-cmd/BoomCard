import { apiService } from './api.service';
import type { Offer } from '../types/entity.types';
import { PaginatedResponse } from './venues.service';
import { Entity, offerToEntity } from '../types/entity.types';
import { getCategoryName } from '../types/categories.types';

// Enhanced Offer type with backend fields
export interface OfferDetails extends Offer {
  venueId?: string;
  partnerId?: string;
  validFrom?: string;
  validUntil?: string;
  termsConditions?: string;
  termsConditionsBg?: string;
  maxRedemptions?: number;
  currentRedemptions?: number;
  redemptionCount?: number;
  views?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  featuredOrder?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  image?: string;
  discountPercent?: number;
  /** Raw canonical category ID from partner (e.g. 'restaurants'), used for filtering */
  partnerCategoryId?: string;
  partner?: {
    id: string;
    businessName?: string;
    businessNameBg?: string;
    category?: string;
    city?: string;
    logo?: string;
    rating?: number;
    partnerTypeId?: string;
    partnerType?: {
      id: string;
      name: string;
      nameBg?: string;
      color: string;
      maxDiscountRate: number;
    };
  };
}

export interface OfferFilters {
  category?: string;
  city?: string;
  minDiscount?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'discount' | 'price' | 'rating' | 'newest' | 'redemptions' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  featured?: boolean;
  active?: boolean;
  partnerId?: string;
  tags?: string[];
  status?: string;
}

export interface CreateOfferData {
  partnerId: string;
  title: string;
  titleBg?: string;
  description: string;
  descriptionBg?: string;
  type: 'DISCOUNT' | 'CASHBACK' | 'POINTS' | 'BUNDLE' | 'SEASONAL';
  discountPercent?: number;
  discountAmount?: number;
  cashbackPercent?: number;
  pointsMultiplier?: number;
  minPurchase?: number;
  maxDiscount?: number;
  termsConditions?: string;
  termsConditionsBg?: string;
  image?: string;
  tags?: string[];
  startDate: string;
  endDate: string;
  usageLimit?: number;
  isFeatured?: boolean;
  featuredOrder?: number;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';
}

class OffersService {
  private readonly baseUrl = '/offers';

  /**
   * Map backend offer to frontend format
   * Maps 'image' field to 'imageUrl' for consistency
   * Calculates missing price fields from discountPercent and minPurchase
   */
  private mapOffer(offer: any): OfferDetails {
    // Calculate prices if they don't exist
    // Use minPurchase as the base price, or default to 200 BGN
    const basePrice = offer.minPurchase || offer.originalPrice || 200;
    const discount = offer.discount || offer.discountPercent || 0;
    const originalPrice = offer.originalPrice || basePrice;
    const discountedPrice = offer.discountedPrice || Math.round(originalPrice * (1 - discount / 100) * 100) / 100;

    return {
      ...offer,
      imageUrl: offer.image || offer.imageUrl,
      originalPrice,
      discountedPrice,
      discount,
      // Map partner fields to top-level for offerToEntity compatibility
      // Resolve canonical category IDs to human-readable names for display
      partnerCategoryId: offer.partner?.category || '',
      category: offer.category || getCategoryName(offer.partner?.category || '', 'en'),
      categoryBg: offer.categoryBg || getCategoryName(offer.partner?.category || '', 'bg'),
      location: offer.location || offer.partner?.city || 'Bulgaria',
      partnerName: offer.partnerName || offer.partner?.businessName || offer.partner?.businessNameBg || '',
      path: offer.path || `/offers/${offer.id}`,
    };
  }

  /**
   * Map array of offers
   */
  private mapOffers(offers: any[]): OfferDetails[] {
    return offers.map(offer => this.mapOffer(offer));
  }

  /**
   * Get all distinct tags used across active offers (for filter UI).
   */
  async getOfferTags(): Promise<string[]> {
    const res = await apiService.get<{ success: boolean; data: string[] }>(`${this.baseUrl}/tags`);
    return res.data;
  }

  /**
   * Get all offers with optional filters
   */
  async getOffers(filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    const response = await apiService.get<PaginatedResponse<any>>(this.baseUrl, filters);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get a single offer by ID
   */
  async getOfferById(id: string): Promise<OfferDetails> {
    const response = await apiService.get<any>(`${this.baseUrl}/${id}`);
    const offer = response?.data || response;
    return this.mapOffer(offer);
  }

  /**
   * Get offers by category
   */
  async getOffersByCategory(category: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    const response = await apiService.get<PaginatedResponse<any>>(`${this.baseUrl}/category/${category}`, filters);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get offers by venue
   */
  async getOffersByVenue(venueId: string): Promise<OfferDetails[]> {
    const offers = await apiService.get<any[]>(`${this.baseUrl}/venue/${venueId}`);
    return this.mapOffers(offers);
  }

  /**
   * Get offers by partner
   */
  async getOffersByPartner(partnerId: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    const response = await apiService.get<PaginatedResponse<any>>(`${this.baseUrl}/partner/${partnerId}`, filters);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get top offers (highest discounts)
   */
  async getTopOffers(limit: number = 10): Promise<OfferDetails[]> {
    const response = await apiService.get<{ success: boolean; data: any[] }>(`${this.baseUrl}/top`, { limit });
    return this.mapOffers(response.data);
  }

  /**
   * Get featured offers
   */
  async getFeaturedOffers(limit: number = 10): Promise<OfferDetails[]> {
    const response = await apiService.get<{ success: boolean; data: any[] }>(`${this.baseUrl}/featured`, { limit });
    return this.mapOffers(response.data);
  }

  /**
   * Get offers by city
   */
  async getOffersByCity(city: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    const response = await apiService.get<PaginatedResponse<any>>(`${this.baseUrl}/city/${city}`, filters);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get nearby offers
   */
  async getNearbyOffers(lat: number, lng: number, radius: number = 5000): Promise<OfferDetails[]> {
    const offers = await apiService.get<any[]>(`${this.baseUrl}/nearby`, { lat, lng, radius });
    return this.mapOffers(offers);
  }

  /**
   * Search offers
   */
  async searchOffers(query: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    const response = await apiService.get<PaginatedResponse<any>>(`${this.baseUrl}/search`, { q: query, ...filters });
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Create a new offer (for partners)
   */
  async createOffer(offer: CreateOfferData): Promise<OfferDetails> {
    const res = await apiService.post<{ success: boolean; data: OfferDetails }>(this.baseUrl, offer);
    return res.data ?? (res as any);
  }

  /**
   * Update offer
   */
  async updateOffer(id: string, updates: Partial<CreateOfferData>): Promise<OfferDetails> {
    return apiService.put<OfferDetails>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Delete offer
   */
  async deleteOffer(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Bulk delete offers (admin only)
   */
  async bulkDeleteOffers(ids: string[]): Promise<{ deleted: number }> {
    return apiService.delete<{ deleted: number }>(this.baseUrl, { data: { ids } });
  }

  /**
   * Activate/deactivate offer
   */
  async toggleOfferStatus(id: string, isActive: boolean): Promise<OfferDetails> {
    return apiService.put<OfferDetails>(`${this.baseUrl}/${id}/status`, { isActive });
  }

  /**
   * Upload an image for an offer.
   * Sends as multipart/form-data; Axios auto-sets Content-Type boundary.
   */
  async uploadOfferImage(offerId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);
    const response = await apiService.post<{ success: boolean; data: { imageUrl: string } }>(
      `${this.baseUrl}/${offerId}/image`,
      formData,
      { headers: { 'Content-Type': undefined } },
    );
    return response.data.imageUrl;
  }

  /**
   * Activate offer (redeem and get code)
   */
  async activateOffer(
    id: string,
    location?: { latitude: number; longitude: number },
  ): Promise<{ success: boolean; code?: string; expiresAt?: string; message?: string }> {
    return apiService.post<{ success: boolean; code?: string; expiresAt?: string; message?: string }>(
      `${this.baseUrl}/${id}/activate`,
      location ? { latitude: location.latitude, longitude: location.longitude } : {}
    );
  }

  /**
   * Redeem offer
   */
  async redeemOffer(id: string, code?: string): Promise<{ success: boolean; message: string; redemptionId?: string }> {
    return apiService.post<{ success: boolean; message: string; redemptionId?: string }>(
      `${this.baseUrl}/${id}/redeem`,
      { code }
    );
  }

  /**
   * Get redemption history
   */
  async getRedemptionHistory(offerId: string): Promise<any[]> {
    return apiService.get<any[]>(`${this.baseUrl}/${offerId}/redemptions`);
  }

  /**
   * Get user's redeemed offers
   */
  async getUserRedemptions(): Promise<OfferDetails[]> {
    return apiService.get<OfferDetails[]>(`${this.baseUrl}/user/redemptions`);
  }

  /**
   * Toggle featured status (Admin only)
   */
  async toggleFeaturedStatus(id: string, isFeatured: boolean, featuredOrder?: number): Promise<OfferDetails> {
    return apiService.patch<OfferDetails>(`${this.baseUrl}/${id}/featured`, {
      isFeatured,
      featuredOrder,
    });
  }

  /**
   * Update featured order (Admin only)
   */
  async updateFeaturedOrder(id: string, featuredOrder: number): Promise<OfferDetails> {
    return apiService.patch<OfferDetails>(`${this.baseUrl}/${id}/featured`, {
      isFeatured: true,
      featuredOrder,
    });
  }

  // ============================================================
  // Entity-based methods (unified model)
  // ============================================================

  /** Convert an OfferDetails to Entity, using the raw partner category ID for filtering */
  private toEntity(offer: OfferDetails): Entity {
    const entity = offerToEntity(offer);
    if (offer.partnerCategoryId) {
      entity.categoryId = offer.partnerCategoryId;
    }
    return entity;
  }

  /**
   * Get offers as Entity[] (unified format)
   */
  async getEntities(filters?: OfferFilters): Promise<PaginatedResponse<Entity>> {
    const response = await this.getOffers(filters);
    return {
      ...response,
      data: response.data.map(offer => this.toEntity(offer)),
    };
  }

  /**
   * Get offers by category as Entity[]
   */
  async getEntitiesByCategory(category: string, filters?: OfferFilters): Promise<PaginatedResponse<Entity>> {
    const response = await this.getOffersByCategory(category, filters);
    return {
      ...response,
      data: response.data.map(offer => this.toEntity(offer)),
    };
  }

  /**
   * Get top offers as Entity[]
   */
  async getTopEntities(limit: number = 10): Promise<Entity[]> {
    const offers = await this.getTopOffers(limit);
    return offers.map(offer => this.toEntity(offer));
  }

  /**
   * Get featured offers as Entity[]
   */
  async getFeaturedEntities(limit: number = 10): Promise<Entity[]> {
    const offers = await this.getFeaturedOffers(limit);
    return offers.map(offer => this.toEntity(offer));
  }

  /**
   * Get offers by city as Entity[]
   */
  async getEntitiesByCity(city: string, filters?: OfferFilters): Promise<PaginatedResponse<Entity>> {
    const response = await this.getOffersByCity(city, filters);
    return {
      ...response,
      data: response.data.map(offer => this.toEntity(offer)),
    };
  }

  /**
   * Search offers and return Entity[]
   */
  async searchEntities(query: string, filters?: OfferFilters): Promise<PaginatedResponse<Entity>> {
    const response = await this.searchOffers(query, filters);
    return {
      ...response,
      data: response.data.map(offer => this.toEntity(offer)),
    };
  }
}

export const offersService = new OffersService();
