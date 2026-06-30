import { apiService } from './api.service';
import type { Offer } from '../types/entity.types';
import { PaginatedResponse } from './venues.service';
import { Entity, offerToEntity } from '../types/entity.types';
import { getCategoryName } from '../types/categories.types';

// Enhanced Offer type with backend fields
export interface OfferDetails extends Offer {
  venueId?: string;
  partnerId?: string;
  /** Real backend offer window (Prisma Offer.startDate / endDate). */
  startDate?: string;
  endDate?: string;
  validFrom?: string;
  validUntil?: string;
  termsConditions?: string;
  termsConditionsBg?: string;
  maxRedemptions?: number;
  currentRedemptions?: number;
  redemptionCount?: number;
  /** Real backend redemption counter (Prisma Offer.usageCount). */
  usageCount?: number;
  /** Real backend redemption cap (Prisma Offer.usageLimit); null = unlimited. */
  usageLimit?: number | null;
  views?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  featuredOrder?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  // LOW fix: align with the Prisma OfferStatus enum (DRAFT | ACTIVE | PAUSED |
  // EXPIRED | CANCELLED). The previous union used a non-existent INACTIVE member
  // and omitted PAUSED / CANCELLED, so genuinely paused/cancelled offers fell
  // through type narrowing and toggleOfferStatus() (which writes PAUSED) produced
  // a value the type claimed was impossible.
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';
  image?: string;
  discountPercent?: number;
  /**
   * Tier-gating flag: when true, the offer is locked behind a higher
   * subscription tier and the activation CTA is replaced with an upgrade
   * prompt. Optional because not all backend responses include it.
   */
  isLocked?: boolean;
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
    /**
     * LOW-1 fix (r2ad): maxDiscountRate is a contractually sensitive business
     * parameter set by admin (spec §11.3, §12 Rule 6). It must not appear in
     * partner-facing responses.  Only display-safe fields are declared here.
     */
    partnerType?: {
      id: string;
      name: string;
      nameBg?: string;
      color: string;
      // maxDiscountRate intentionally omitted — internal contract parameter
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
  /** Hook-level gate — pass `false` to prevent the useOffers query from firing (e.g. for non-partner users). */
  enabled?: boolean;
}

export interface CreateOfferData {
  partnerId: string;
  title: string;
  titleBg?: string;
  description: string;
  descriptionBg?: string;
  // MEDIUM-2 fix (review r2u): category was validated and previewed in CreateOfferPage
  // but silently dropped from the payload.  Adding it here ensures it reaches the backend.
  category?: string;
  type: 'DISCOUNT' | 'CASHBACK' | 'POINTS' | 'BUNDLE' | 'SEASONAL';
  discountPercent?: number;
  discountAmount?: number;
  // cashbackPercent intentionally omitted — internal business formula component.
  // Must never be set by partner-facing code (spec §11.3, Clash 10.6). MEDIUM-1 fix.
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

// Raw offer payload shape from backend (pre-normalization)
type RawOffer = OfferDetails & {
  image?: string;
  imageUrl?: string;
  minPurchase?: number;
  originalPrice?: number;
  discountedPrice?: number;
  discount?: number;
  discountPercent?: number;
  category?: string;
  categoryBg?: string;
  location?: string;
  partnerName?: string;
  path?: string;
};

class OffersService {
  private readonly baseUrl = '/offers';

  /**
   * Map backend offer to frontend format
   * Maps 'image' field to 'imageUrl' for consistency
   * Calculates missing price fields from discountPercent and minPurchase
   */
  private mapOffer(offer: RawOffer): OfferDetails {
    // MEDIUM fix (re-audit): the backend has no price model, so absolute BGN prices
    // were previously fabricated here — falling back to a hardcoded 200 BGN base and
    // deriving a "discounted" price from it. That invented money the consumer view
    // rendered as real. Only the discount PERCENTAGE is genuine. We now pass through
    // originalPrice / discountedPrice ONLY when the backend actually provides them
    // (leaving them undefined otherwise) and never synthesize a base price.
    const discount = offer.discount || offer.discountPercent || 0;
    const originalPrice = offer.originalPrice;
    const discountedPrice = offer.discountedPrice;

    // Strip internal business fields that must never appear in partner-facing
    // responses. Using destructuring ensures they are excluded from the spread
    // even if the backend starts returning them (spec §11.3, Clash 10.6).
    // MEDIUM fix (reviews r2ad MEDIUM-1 / r2u MEDIUM-2): cashbackPercent added
    // to the strip list — it is an internal business formula component and must
    // never be surfaced in the partner portal under any circumstances.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { marginPercent: _marginPercent, riskLevel: _riskLevel, cashbackPercent: _cashbackPercent, ...safeOffer } = offer as RawOffer & {
      marginPercent?: unknown;
      riskLevel?: unknown;
      cashbackPercent?: unknown;
    };

    // LOW-1 fix (r2ad): strip maxDiscountRate from nested partner.partnerType.
    // It is a contractually sensitive parameter set by admin and must not appear
    // in partner-facing responses (spec §11.3, §12 Rule 6).
    let safePartner = safeOffer.partner;
    if (safePartner?.partnerType) {
      const { maxDiscountRate: _maxDiscountRate, ...safePartnerType } = safePartner.partnerType as typeof safePartner.partnerType & { maxDiscountRate?: unknown };
      safePartner = { ...safePartner, partnerType: safePartnerType };
    }

    return {
      ...safeOffer,
      partner: safePartner,
      imageUrl: offer.image || offer.imageUrl,
      originalPrice,
      discountedPrice,
      discount,
      // Map partner fields to top-level for offerToEntity compatibility
      // Resolve canonical category IDs to human-readable names for display
      partnerCategoryId: offer.partner?.category || '',
      category: offer.category || getCategoryName(offer.partner?.category || '', 'en'),
      categoryBg: (() => {
        if (offer.categoryBg) return offer.categoryBg;
        const rawId = offer.partner?.category || '';
        if (!rawId) return '';
        const bg = getCategoryName(rawId, 'bg');
        return bg !== rawId ? bg : '';
      })(),
      location: offer.location || offer.partner?.city || 'Bulgaria',
      partnerName: offer.partnerName || offer.partner?.businessName || offer.partner?.businessNameBg || '',
      path: offer.path || `/offers/${offer.id}`,
    };
  }

  /**
   * Map array of offers
   */
  private mapOffers(offers: RawOffer[]): OfferDetails[] {
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
    // Strip the hook-only `enabled` flag — it must not be forwarded as a query param.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enabled: _enabled, ...apiFilters } = filters ?? {};
    const response = await apiService.get<PaginatedResponse<RawOffer>>(this.baseUrl, Object.keys(apiFilters).length ? apiFilters : undefined);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get a single offer by ID
   */
  async getOfferById(id: string): Promise<OfferDetails> {
    const response = await apiService.get<RawOffer | { data: RawOffer }>(`${this.baseUrl}/${id}`);
    const offer = (response as { data?: RawOffer })?.data || (response as RawOffer);
    return this.mapOffer(offer);
  }

  /**
   * Get offers by category
   */
  async getOffersByCategory(category: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    // MEDIUM fix (review r2ad MEDIUM-2): strip hook-only `enabled` flag before
    // forwarding to the API, consistent with getOffers().
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enabled: _enabled, ...apiFilters } = filters ?? {};
    const response = await apiService.get<PaginatedResponse<RawOffer>>(`${this.baseUrl}/category/${category}`, Object.keys(apiFilters).length ? apiFilters : undefined);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get offers by partner
   */
  async getOffersByPartner(partnerId: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    // MEDIUM fix (review r2ad MEDIUM-2): strip hook-only `enabled` flag.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enabled: _enabled, ...apiFilters } = filters ?? {};
    const response = await apiService.get<PaginatedResponse<RawOffer>>(`${this.baseUrl}/partner/${partnerId}`, Object.keys(apiFilters).length ? apiFilters : undefined);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get top offers (highest discounts)
   */
  async getTopOffers(limit: number = 10): Promise<OfferDetails[]> {
    const response = await apiService.get<{ success: boolean; data: RawOffer[] }>(`${this.baseUrl}/top`, { limit });
    return this.mapOffers(response.data);
  }

  /**
   * Get featured offers
   */
  async getFeaturedOffers(limit: number = 10): Promise<OfferDetails[]> {
    const response = await apiService.get<{ success: boolean; data: RawOffer[] }>(`${this.baseUrl}/featured`, { limit });
    return this.mapOffers(response.data);
  }

  /**
   * Get offers by city
   */
  async getOffersByCity(city: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    // MEDIUM fix (review r2ad MEDIUM-2): strip hook-only `enabled` flag.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enabled: _enabled, ...apiFilters } = filters ?? {};
    const response = await apiService.get<PaginatedResponse<RawOffer>>(`${this.baseUrl}/city/${city}`, Object.keys(apiFilters).length ? apiFilters : undefined);
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Get nearby offers
   */
  async getNearbyOffers(lat: number, lng: number, radius: number = 5000): Promise<OfferDetails[]> {
    const offers = await apiService.get<RawOffer[]>(`${this.baseUrl}/nearby`, { lat, lng, radius });
    return this.mapOffers(offers);
  }

  /**
   * Search offers
   */
  async searchOffers(query: string, filters?: OfferFilters): Promise<PaginatedResponse<OfferDetails>> {
    // MEDIUM fix (review r2ad MEDIUM-2): strip hook-only `enabled` flag.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { enabled: _enabled, ...apiFilters } = filters ?? {};
    const response = await apiService.get<PaginatedResponse<RawOffer>>(`${this.baseUrl}/search`, { q: query, ...apiFilters });
    return {
      ...response,
      data: this.mapOffers(response.data),
    };
  }

  /**
   * Create a new offer (for partners)
   */
  async createOffer(offer: CreateOfferData): Promise<OfferDetails> {
    const res = await apiService.post<{ success: boolean; data: OfferDetails } | OfferDetails>(this.baseUrl, offer);
    return (res as { data?: OfferDetails }).data ?? (res as OfferDetails);
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
   * Enable / disable an offer (admin-only on the backend).
   *
   * LOW fix: the previous implementation called `POST /offers/:id/activate` to
   * "toggle status" — but that route REDEEMS the offer (increments usageCount
   * and issues a one-time code via offersService.redeemOffer). It does not
   * enable/disable anything, so using it here both failed to change the active
   * state AND silently consumed a redemption on every toggle.
   *
   * The correct route to change an offer's active state is `PUT /offers/:id`
   * (offers.routes.ts ~L309 → offersService.updateOffer), which passes the
   * `status` field straight through to prisma.offer.update. The Prisma
   * `OfferStatus` enum exposes ACTIVE / DRAFT / PAUSED / EXPIRED / CANCELLED —
   * there is no `INACTIVE` member — so disabling maps to PAUSED and enabling to
   * ACTIVE. (MyOffersPage renders an offer as active only when status==='ACTIVE'
   * and as inactive otherwise, so PAUSED reads back correctly as "inactive".)
   *
   * Note: `PUT /offers/:id` is admin-only (authorize ADMIN/SUPER_ADMIN). The
   * MyOffersPage toggle is already gated behind canEditOffers (admin role), so
   * this is consistent; partner-role users never reach this call.
   *
   * The legacy `location` argument is dropped — it has no meaning for a status
   * change. The response is shaped `{ data }` on this route's wrapper-less PUT,
   * so we unwrap defensively to match the other methods here.
   */
  async toggleOfferStatus(
    id: string,
    isActive: boolean,
  ): Promise<OfferDetails> {
    const status = isActive ? 'ACTIVE' : 'PAUSED';
    const res = await apiService.put<{ success: boolean; data: OfferDetails } | OfferDetails>(
      `${this.baseUrl}/${id}`,
      { status },
    );
    return (res as { data?: OfferDetails }).data ?? (res as OfferDetails);
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
   * Redeem offer.
   *
   * LOW fix: the previous implementation targeted `POST /offers/:id/redeem`,
   * which does NOT exist on the backend (offers.routes.ts) and always returned
   * 404. The real redemption endpoint is `POST /offers/:id/activate` — it calls
   * offersService.redeemOffer server-side, increments usageCount, and returns a
   * one-time redemption code. The route only reads an optional
   * `{ latitude, longitude }` body (it does not read a client-supplied `code`),
   * so the legacy `code` argument is no longer forwarded.
   */
  async redeemOffer(id: string, code?: string): Promise<{ success: boolean; message: string; redemptionId?: string }> {
    // `code` is intentionally not sent — the activate route does not read it.
    void code;
    return apiService.post<{ success: boolean; message: string; redemptionId?: string }>(
      `${this.baseUrl}/${id}/activate`,
      {}
    );
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
