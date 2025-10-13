import { apiService } from './api.service';
import { PaginatedResponse } from './venues.service';

export interface Partner {
  id: string;
  name: string;
  nameEn?: string;
  nameBg?: string;
  description?: string;
  descriptionEn?: string;
  descriptionBg?: string;
  category: string;
  status: 'new' | 'vip' | 'exclusive' | 'regular';
  city: string;
  region?: string;
  logo?: string;
  coverImage?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  venueCount?: number;
  offerCount?: number;
  totalRedemptions?: number;
  rating?: number;
  reviewCount?: number;
  joinedDate?: string;
  isVerified?: boolean;
  features?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PartnerFilters {
  category?: string;
  city?: string;
  region?: string;
  status?: 'new' | 'vip' | 'exclusive' | 'regular';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'rating' | 'joinedDate' | 'offerCount';
  sortOrder?: 'asc' | 'desc';
}

export interface PartnerStats {
  totalVenues: number;
  totalOffers: number;
  activeOffers: number;
  totalRedemptions: number;
  averageRating: number;
  totalReviews: number;
  monthlyRedemptions: number;
  revenue: number;
}

class PartnersService {
  private readonly baseUrl = '/partners';

  /**
   * Get all partners with optional filters
   */
  async getPartners(filters?: PartnerFilters): Promise<PaginatedResponse<Partner>> {
    return apiService.get<PaginatedResponse<Partner>>(this.baseUrl, filters);
  }

  /**
   * Get a single partner by ID
   */
  async getPartnerById(id: string): Promise<Partner> {
    return apiService.get<Partner>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get partners by category
   */
  async getPartnersByCategory(category: string, filters?: PartnerFilters): Promise<PaginatedResponse<Partner>> {
    return apiService.get<PaginatedResponse<Partner>>(`${this.baseUrl}/category/${category}`, filters);
  }

  /**
   * Get partners by city/region
   */
  async getPartnersByCity(city: string, filters?: PartnerFilters): Promise<PaginatedResponse<Partner>> {
    return apiService.get<PaginatedResponse<Partner>>(`${this.baseUrl}/city/${city}`, filters);
  }

  /**
   * Get partners by status (new, vip, exclusive)
   */
  async getPartnersByStatus(status: string, filters?: PartnerFilters): Promise<PaginatedResponse<Partner>> {
    return apiService.get<PaginatedResponse<Partner>>(`${this.baseUrl}/status/${status}`, filters);
  }

  /**
   * Get new partners
   */
  async getNewPartners(limit: number = 10): Promise<Partner[]> {
    return apiService.get<Partner[]>(`${this.baseUrl}/new`, { limit });
  }

  /**
   * Get VIP partners
   */
  async getVIPPartners(limit: number = 10): Promise<Partner[]> {
    return apiService.get<Partner[]>(`${this.baseUrl}/vip`, { limit });
  }

  /**
   * Get exclusive partners
   */
  async getExclusivePartners(limit: number = 10): Promise<Partner[]> {
    return apiService.get<Partner[]>(`${this.baseUrl}/exclusive`, { limit });
  }

  /**
   * Search partners
   */
  async searchPartners(query: string, filters?: PartnerFilters): Promise<PaginatedResponse<Partner>> {
    return apiService.get<PaginatedResponse<Partner>>(`${this.baseUrl}/search`, { q: query, ...filters });
  }

  /**
   * Get partner statistics
   */
  async getPartnerStats(partnerId: string): Promise<PartnerStats> {
    return apiService.get<PartnerStats>(`${this.baseUrl}/${partnerId}/stats`);
  }

  /**
   * Get current partner profile (authenticated)
   */
  async getCurrentPartner(): Promise<Partner> {
    return apiService.get<Partner>(`${this.baseUrl}/me`);
  }

  /**
   * Update partner profile
   */
  async updatePartner(id: string, updates: Partial<Partner>): Promise<Partner> {
    return apiService.put<Partner>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Upload partner logo
   */
  async uploadLogo(partnerId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await fetch(`${apiService['api'].defaults.baseURL}${this.baseUrl}/${partnerId}/logo`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) throw new Error('Failed to upload logo');
    const data = await response.json();
    return data.logoUrl;
  }

  /**
   * Upload partner cover image
   */
  async uploadCoverImage(partnerId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('cover', file);

    const response = await fetch(`${apiService['api'].defaults.baseURL}${this.baseUrl}/${partnerId}/cover`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) throw new Error('Failed to upload cover image');
    const data = await response.json();
    return data.coverImageUrl;
  }

  /**
   * Request partner status upgrade (to VIP or Exclusive)
   */
  async requestStatusUpgrade(partnerId: string, targetStatus: 'vip' | 'exclusive', message?: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/${partnerId}/upgrade-request`, {
      targetStatus,
      message,
    });
  }
}

export const partnersService = new PartnersService();
