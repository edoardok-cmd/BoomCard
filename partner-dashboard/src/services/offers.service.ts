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
  isActive?: boolean;
  isFeatured?: boolean;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface OfferFilters {
  category?: string;
  city?: string;
  minDiscount?: number;
  maxPrice?: number;
  minRating?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'discount' | 'price' | 'rating' | 'newest';
  sortOrder?: 'asc' | 'desc';
  featured?: boolean;
  active?: boolean;
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
   * Get all offers with optional filters
   */
  async getOffers(filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    return apiService.get<PaginatedResponse<OfferDetails>>(this.baseUrl, filters);
  }

  /**
   * Get a single offer by ID
   */
  async getOfferById(id: string): Promise<OfferDetails> {
    return apiService.get<OfferDetails>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get offers by category
   */
  async getOffersByCategory(category: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    return apiService.get<PaginatedResponse<OfferDetails>>(`${this.baseUrl}/category/${category}`, filters);
  }

  /**
   * Get offers by venue
   */
  async getOffersByVenue(venueId: string): Promise<OfferDetails[]> {
    return apiService.get<OfferDetails[]>(`${this.baseUrl}/venue/${venueId}`);
  }

  /**
   * Get offers by partner
   */
  async getOffersByPartner(partnerId: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    return apiService.get<PaginatedResponse<OfferDetails>>(`${this.baseUrl}/partner/${partnerId}`, filters);
  }

  /**
   * Get top offers (highest discounts)
   */
  async getTopOffers(limit: number = 10): Promise<OfferDetails[]> {
    return apiService.get<OfferDetails[]>(`${this.baseUrl}/top`, { limit });
  }

  /**
   * Get featured offers
   */
  async getFeaturedOffers(limit: number = 10): Promise<OfferDetails[]> {
    return apiService.get<OfferDetails[]>(`${this.baseUrl}/featured`, { limit });
  }

  /**
   * Get offers by city
   */
  async getOffersByCity(city: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    return apiService.get<PaginatedResponse<OfferDetails>>(`${this.baseUrl}/city/${city}`, filters);
  }

  /**
   * Get nearby offers
   */
  async getNearbyOffers(lat: number, lng: number, radius: number = 5000): Promise<OfferDetails[]> {
    return apiService.get<OfferDetails[]>(`${this.baseUrl}/nearby`, { lat, lng, radius });
  }

  /**
   * Search offers
   */
  async searchOffers(query: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    return apiService.get<PaginatedResponse<OfferDetails>>(`${this.baseUrl}/search`, { q: query, ...filters });
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
}

export const offersService = new OffersService();
