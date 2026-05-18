import { apiService } from './api.service';

export type MenuStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type VenueStatus = 'ACTIVE' | 'SUSPENDED' | 'REPLACED';
export type PartnerStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED' | 'INACTIVE';

export interface AdminVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  region: string | null;
  phone: string | null;
  menuStatus: MenuStatus;
  menuUrl: string | null;
  pendingMenuUrl: string | null;
  venueStatus: VenueStatus;
  venueStatusNote: string | null;
  venueStatusAt: string | null;
  createdAt: string;
  updatedAt: string;
  partner: {
    id: string;
    businessName: string;
    status: PartnerStatus;
    partnerType: { name: string; color: string } | null;
  };
  stickerConfig: {
    cashbackPercent: number;
    isActive: boolean;
    gpsVerificationEnabled: boolean;
    maxScansPerDay: number;
  } | null;
  _count: { stickers: number; statusHistory: number };
  stickers?: Array<{ createdAt: string; status: string; stickerId: string; qrCode: string }>;
}

export interface VenueStatusHistoryEntry {
  id: string;
  fromStatus: VenueStatus;
  toStatus: VenueStatus;
  note: string | null;
  createdAt: string;
  changedBy: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

export interface AdminVenuesResult {
  data: AdminVenue[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export const adminLocationsService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    city?: string;
    menuStatus?: MenuStatus | '';
    venueStatus?: VenueStatus | '';
  }): Promise<AdminVenuesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.city) clean.city = params.city;
    if (params.menuStatus) clean.menuStatus = params.menuStatus;
    if (params.venueStatus) clean.venueStatus = params.venueStatus;
    return apiService.get<AdminVenuesResult>('/admin/venues', clean);
  },

  updateStatus(venueId: string, venueStatus: VenueStatus, note?: string): Promise<{ success: boolean; data: Pick<AdminVenue, 'id' | 'venueStatus' | 'venueStatusNote' | 'venueStatusAt'> }> {
    return apiService.patch(`/admin/venues/${venueId}/status`, { venueStatus, note });
  },

  approveMenu(venueId: string, expectedUrl?: string): Promise<void> {
    return apiService.post<void>(`/admin/venues/${venueId}/menu/approve`, { expectedUrl });
  },

  rejectMenu(venueId: string, reason: string): Promise<void> {
    return apiService.post<void>(`/admin/venues/${venueId}/menu/reject`, { reason });
  },

  // Spec §5.4 — full status-change timeline for one venue. Loaded lazily by
  // the locations drawer; the list response only carries an aggregate count.
  getStatusHistory(venueId: string): Promise<{ success: boolean; data: VenueStatusHistoryEntry[] }> {
    return apiService.get(`/admin/venues/${venueId}/status-history`);
  },
};
