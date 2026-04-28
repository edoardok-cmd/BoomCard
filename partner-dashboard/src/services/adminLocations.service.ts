import { apiService } from './api.service';

export type MenuStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type PartnerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

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
  createdAt: string;
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
  }): Promise<AdminVenuesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.city) clean.city = params.city;
    if (params.menuStatus) clean.menuStatus = params.menuStatus;
    return apiService.get<AdminVenuesResult>('/admin/venues', clean);
  },

  approveMenu(venueId: string, expectedUrl?: string): Promise<void> {
    return apiService.post<void>(`/admin/venues/${venueId}/menu/approve`, { expectedUrl });
  },

  rejectMenu(venueId: string, reason: string): Promise<void> {
    return apiService.post<void>(`/admin/venues/${venueId}/menu/reject`, { reason });
  },
};
