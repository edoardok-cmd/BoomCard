import { apiService } from './api.service';
import { Offer } from '../components/common/OfferCard/OfferCard';
import { PaginatedResponse } from './venues.service';

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
  partner?: {
    id: string;
    businessName?: string;
    businessNameBg?: string;
    category?: string;
    city?: string;
    logo?: string;
    rating?: number;
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
}

export interface CreateOfferData {
  title: string;
  titleBg: string;
  description: string;
  descriptionBg: string;
  category: string;
  categoryBg: string;
  discount: number;
  originalPrice: number;
  discountedPrice: number;
  imageUrl?: string;
  validFrom?: string;
  validUntil?: string;
  termsConditions?: string;
  termsConditionsBg?: string;
  maxRedemptions?: number;
  venueId?: string;
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
      // Add location and partnerName from partner data if available
      location: offer.location || offer.partner?.city || 'Bulgaria',
      partnerName: offer.partnerName || offer.partner?.businessName || offer.partner?.businessNameBg || '',
      // Add path if not provided
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
    const offer = await apiService.get<any>(`${this.baseUrl}/${id}`);
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
    console.log('[offersService] Calling API: /offers/top with limit:', limit);
    const response = await apiService.get<{ success: boolean; data: any[] }>(`${this.baseUrl}/top`, { limit });
    console.log('[offersService] Raw response:', response);
    console.log('[offersService] response.data:', response.data);
    return this.mapOffers(response.data);
  }

  /**
   * Get featured offers
   */
  async getFeaturedOffers(limit: number = 10): Promise<OfferDetails[]> {
    const offers = await apiService.get<any[]>(`${this.baseUrl}/featured`, { limit });
    return this.mapOffers(offers);
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
    return apiService.post<OfferDetails>(this.baseUrl, offer);
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
   * Activate/deactivate offer
   */
  async toggleOfferStatus(id: string, isActive: boolean): Promise<OfferDetails> {
    return apiService.put<OfferDetails>(`${this.baseUrl}/${id}/status`, { isActive });
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
}

export const offersService = new OffersService();
