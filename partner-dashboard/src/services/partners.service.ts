import { apiService } from './api.service';
import { PaginatedResponse } from './venues.service';
import { PartnerType } from './partnerTypes.service';
import * as authStorage from '../lib/auth/authStorage';

// Spec §5.3 statuses: ACTIVE / PAUSED / SUSPENDED / ARCHIVED. INACTIVE kept for legacy rows.
export type PartnerStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED' | 'INACTIVE' | 'REJECTED';

export interface Partner {
  id: string;
  userId?: string;
  businessName: string;
  businessNameBg?: string;
  name: string;
  nameEn?: string;
  nameBg?: string;
  description?: string;
  descriptionEn?: string;
  descriptionBg?: string;
  category: string;
  categories?: string[];
  partnerTypeId?: string;
  partnerType?: PartnerType;
  status: PartnerStatus | 'new' | 'vip' | 'exclusive' | 'regular';
  city?: string;
  region?: string;
  address?: string;
  phone?: string;
  email?: string;
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
  venues?: Array<{ id: string; name: string; city?: string }>;
  venueCount?: number;
  offerCount?: number;
  totalRedemptions?: number;
  rating?: number;
  reviewCount?: number;
  discountRate?: number | null;
  effectiveDiscountRate?: number;
  typeMaxDiscountPercent?: number;
  joinedAt?: string;
  joinedDate?: string;
  verifiedAt?: string;
  onboardingCompletedAt?: string;
  isVerified?: boolean;
  features?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  pendingChanges?: Record<string, unknown> | null;
  pendingChangesAt?: string | null;
  // Spec §5.3 — Видимост: visible vs. hidden to subscribers
  isVisible?: boolean;
}

export interface PartnerLocationInput {
  name: string;
  address: string;
  city: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
}

export interface CreatePartnerPayload {
  userId: string;
  businessName: string;
  businessNameBg?: string;
  category: string;
  categories?: string[];
  description?: string;
  descriptionBg?: string;
  partnerTypeId?: string;
  discountRate?: number;
  city?: string;
  region?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  locations?: PartnerLocationInput[];
}

export interface OnboardPartnerPayload {
  email: string;
  businessName: string;
  businessNameBg?: string;
  legalName?: string;
  vatNumber?: string;
  country?: string;
  category: string;
  categories?: string[];
  subcategory?: string;
  description?: string;
  descriptionBg?: string;
  highlights?: string | string[];
  partnerTypeId?: string;
  discountRate?: number;
  status?: string;
  city?: string;
  region?: string;
  address?: string;
  googleMapsLink?: string;
  totalVenues?: number;
  boomVenues?: number;
  additionalAddresses?: string;
  phone?: string;
  website?: string;
  ownerName?: string;
  primaryContact?: string;
  secondaryContact?: string;
  secondaryPhone?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  googleBusiness?: string;
  menuLink?: string;
  logoLink?: string;
  photosLink?: string;
  marketingVisibility?: string;
  contractSigned?: boolean;
  contractStartDate?: string;
  contractDuration?: string;
  onboardingDate?: string;
  addedBy?: string;
  internalNotes?: string;
  locations?: PartnerLocationInput[];
  additionalVenues?: PartnerLocationInput[];
}

export interface PartnerUserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface PartnerFilters {
  category?: string;
  city?: string;
  region?: string;
  status?: PartnerStatus | 'new' | 'vip' | 'exclusive' | 'regular';
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'rating' | 'joinedDate' | 'offerCount';
  sortOrder?: 'asc' | 'desc';
  verifiedAfter?: string;
  onboardingCompletedAfter?: string;
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
  // BC-PARTNER-PORTAL-SCOPE-B (§5.3) — extended KPI fields.
  // expectedAmount = sum of totalCashbackOwed for PENDING|OVERDUE periods.
  // totalVisits = count of this partner's StickerScan rows (all statuses).
  expectedAmount?: number;
  totalVisits?: number;
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
    const res = await apiService.get<{ success: boolean; data: PartnerStats } | PartnerStats>(
      `${this.baseUrl}/${partnerId}/stats`,
    );
    return (res as { data?: PartnerStats })?.data ?? (res as PartnerStats);
  }

  /**
   * Get current partner profile (authenticated)
   */
  async getCurrentPartner(): Promise<Partner> {
    const res = await apiService.get<{ success: boolean; data: Partner } | Partner>(`${this.baseUrl}/me`);
    // Backend wraps the record in `{ success, data }`; older deployments may return it raw.
    return (res as { data?: Partner })?.data ?? (res as Partner);
  }

  /**
   * Search users with PARTNER role who don't yet have a partner record (admin only)
   */
  async searchPartnerUsers(search: string): Promise<PartnerUserOption[]> {
    const response = await apiService.get<{ data: PartnerUserOption[] }>(
      '/auth/users/partners',
      search ? { search } : undefined,
    );
    return response.data;
  }

  /**
   * Create a new partner (admin only)
   */
  async createPartner(data: CreatePartnerPayload): Promise<Partner> {
    return apiService.post<Partner>(this.baseUrl, data);
  }

  async onboardPartner(data: OnboardPartnerPayload): Promise<Partner> {
    return apiService.post<Partner>(`${this.baseUrl}/onboard`, data);
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
        Authorization: `Bearer ${authStorage.getItem('token')}`,
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
        Authorization: `Bearer ${authStorage.getItem('token')}`,
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
