/**
 * Promo Codes Service
 *
 * Complete promo code management system for:
 * - Creating and managing discount codes
 * - Validating promo codes
 * - Tracking usage statistics
 * - Setting expiration dates and limits
 * - Supporting various discount types
 */

import { apiService } from './api.service';

export type DiscountType = 'percentage' | 'fixed' | 'free_shipping' | 'bogo';

export type PromoCodeStatus = 'active' | 'inactive' | 'expired' | 'exhausted';

export interface PromoCode {
  id: string;
  code: string;
  status: PromoCodeStatus;

  // Description
  name: string;
  nameBg: string;
  description?: string;
  descriptionBg?: string;

  // Discount details
  discountType: DiscountType;
  discountValue: number; // Percentage (1-100) or fixed amount
  maxDiscountAmount?: number; // Max discount for percentage types
  minPurchaseAmount?: number; // Minimum purchase required

  // Usage limits
  usageLimit?: number; // Total usage limit
  usageLimitPerUser?: number; // Per-user usage limit
  currentUsage: number;

  // Validity
  startDate: string;
  endDate?: string;
  expiresAt?: string;

  // Applicability
  applicableToPartners?: string[]; // Partner IDs
  applicableToVenues?: string[]; // Venue IDs
  applicableToOffers?: string[]; // Offer IDs
  applicableToCategories?: string[]; // Category names
  firstTimeUsersOnly?: boolean;

  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface CreatePromoCodeData {
  code: string;
  name: string;
  nameBg: string;
  description?: string;
  descriptionBg?: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
  minPurchaseAmount?: number;
  usageLimit?: number;
  usageLimitPerUser?: number;
  startDate: string;
  endDate?: string;
  applicableToPartners?: string[];
  applicableToVenues?: string[];
  applicableToOffers?: string[];
  applicableToCategories?: string[];
  firstTimeUsersOnly?: boolean;
}

export interface PromoCodeValidation {
  valid: boolean;
  promoCode?: PromoCode;
  discount?: {
    type: DiscountType;
    value: number;
    finalAmount: number;
  };
  error?: string;
  errorBg?: string;
}

export interface PromoCodeUsage {
  id: string;
  promoCodeId: string;
  code: string;
  userId: string;
  userName: string;
  orderId?: string;
  bookingId?: string;
  discountAmount: number;
  originalAmount: number;
  finalAmount: number;
  usedAt: string;
}

export interface PromoCodeFilters {
  status?: PromoCodeStatus;
  discountType?: DiscountType;
  search?: string;
  startDate?: string;
  endDate?: string;
  createdBy?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'usageCount' | 'discountValue' | 'code';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedPromoCodes {
  data: PromoCode[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PromoCodeStatistics {
  totalCodes: number;
  activeCodes: number;
  expiredCodes: number;
  totalUsage: number;
  totalDiscountGiven: number;
  averageDiscountPerUse: number;
  topCodes: Array<{
    code: string;
    name: string;
    usageCount: number;
    totalDiscount: number;
  }>;
  usageByDate: Array<{ date: string; count: number; discount: number }>;
  usageByType: Record<DiscountType, { count: number; discount: number }>;
}

class PromoCodesService {
  private readonly baseUrl = '/promo-codes';

  /**
   * Get all promo codes
   */
  async getPromoCodes(filters?: PromoCodeFilters): Promise<PaginatedPromoCodes> {
    return apiService.get<PaginatedPromoCodes>(this.baseUrl, filters);
  }

  /**
   * Get promo code by ID
   */
  async getPromoCodeById(id: string): Promise<PromoCode> {
    return apiService.get<PromoCode>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get promo code by code string
   */
  async getPromoCodeByCode(code: string): Promise<PromoCode> {
    return apiService.get<PromoCode>(`${this.baseUrl}/code/${code}`);
  }

  /**
   * Create new promo code
   */
  async createPromoCode(data: CreatePromoCodeData): Promise<PromoCode> {
    return apiService.post<PromoCode>(this.baseUrl, data);
  }

  /**
   * Update promo code
   */
  async updatePromoCode(id: string, updates: Partial<CreatePromoCodeData>): Promise<PromoCode> {
    return apiService.put<PromoCode>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Delete promo code
   */
  async deletePromoCode(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Activate promo code
   */
  async activatePromoCode(id: string): Promise<PromoCode> {
    return apiService.post<PromoCode>(`${this.baseUrl}/${id}/activate`);
  }

  /**
   * Deactivate promo code
   */
  async deactivatePromoCode(id: string): Promise<PromoCode> {
    return apiService.post<PromoCode>(`${this.baseUrl}/${id}/deactivate`);
  }

  /**
   * Validate promo code
   */
  async validatePromoCode(
    code: string,
    userId: string,
    amount: number,
    venueId?: string,
    offerId?: string
  ): Promise<PromoCodeValidation> {
    return apiService.post<PromoCodeValidation>(`${this.baseUrl}/validate`, {
      code,
      userId,
      amount,
      venueId,
      offerId,
    });
  }

  /**
   * Apply promo code to booking
   */
  async applyPromoCode(
    code: string,
    bookingId: string
  ): Promise<{ booking: any; discount: number }> {
    return apiService.post(`${this.baseUrl}/apply`, {
      code,
      bookingId,
    });
  }

  /**
   * Get promo code usage history
   */
  async getUsageHistory(promoCodeId: string, page: number = 1, limit: number = 20): Promise<{
    data: PromoCodeUsage[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return apiService.get(`${this.baseUrl}/${promoCodeId}/usage`, {
      page,
      limit,
    });
  }

  /**
   * Get user's promo code usage
   */
  async getUserUsage(userId: string): Promise<PromoCodeUsage[]> {
    return apiService.get<PromoCodeUsage[]>(`${this.baseUrl}/user/${userId}/usage`);
  }

  /**
   * Get promo code statistics
   */
  async getStatistics(startDate?: string, endDate?: string): Promise<PromoCodeStatistics> {
    return apiService.get<PromoCodeStatistics>(`${this.baseUrl}/statistics`, {
      startDate,
      endDate,
    });
  }

  /**
   * Get single promo code statistics
   */
  async getPromoCodeStatistics(id: string, startDate?: string, endDate?: string): Promise<{
    totalUsage: number;
    totalDiscount: number;
    averageDiscount: number;
    uniqueUsers: number;
    usageByDate: Array<{ date: string; count: number; discount: number }>;
  }> {
    return apiService.get(`${this.baseUrl}/${id}/statistics`, {
      startDate,
      endDate,
    });
  }

  /**
   * Generate random promo code
   */
  async generateCode(length: number = 8, prefix?: string): Promise<{ code: string }> {
    return apiService.post<{ code: string }>(`${this.baseUrl}/generate-code`, {
      length,
      prefix,
    });
  }

  /**
   * Bulk create promo codes
   */
  async bulkCreatePromoCodes(
    template: CreatePromoCodeData,
    count: number,
    codePrefix?: string
  ): Promise<PromoCode[]> {
    return apiService.post<PromoCode[]>(`${this.baseUrl}/bulk-create`, {
      template,
      count,
      codePrefix,
    });
  }

  /**
   * Export promo codes
   */
  async exportPromoCodes(
    filters?: PromoCodeFilters,
    format: 'csv' | 'xlsx' | 'pdf' = 'csv'
  ): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/export`, {
      ...filters,
      format,
    }, {
      responseType: 'blob',
    });
  }

  /**
   * Check if code is available
   */
  async checkCodeAvailability(code: string): Promise<{ available: boolean }> {
    return apiService.get<{ available: boolean }>(`${this.baseUrl}/check-availability`, {
      code,
    });
  }

  /**
   * Clone promo code
   */
  async clonePromoCode(id: string, newCode: string): Promise<PromoCode> {
    return apiService.post<PromoCode>(`${this.baseUrl}/${id}/clone`, {
      newCode,
    });
  }

  /**
   * Send promo code to users
   */
  async sendPromoCode(
    id: string,
    userIds: string[],
    message?: string
  ): Promise<{ sent: number; failed: number }> {
    return apiService.post(`${this.baseUrl}/${id}/send`, {
      userIds,
      message,
    });
  }

  /**
   * Get active promo codes for user
   */
  async getActiveCodesForUser(userId: string): Promise<PromoCode[]> {
    return apiService.get<PromoCode[]>(`${this.baseUrl}/active/user/${userId}`);
  }

  /**
   * Get recommended promo codes
   * Based on user history and current cart
   */
  async getRecommendedCodes(
    userId: string,
    amount: number,
    venueId?: string,
    offerId?: string
  ): Promise<PromoCode[]> {
    return apiService.get<PromoCode[]>(`${this.baseUrl}/recommended`, {
      userId,
      amount,
      venueId,
      offerId,
    });
  }
}

// Export singleton instance
export const promoCodesService = new PromoCodesService();
export default promoCodesService;
