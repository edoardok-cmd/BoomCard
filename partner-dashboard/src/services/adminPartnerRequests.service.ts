import { apiService } from './api.service';

export interface PendingPartner {
  id: string;
  businessName: string;
  category: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  discountRate: number | null;
  status?: string;
  requestStatus?: string | null;
  joinedAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
  };
  // Spec §5.1 — "Отговорник" (assigned super admin)
  assignedAdminId?: string | null;
  assignedAdmin?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface PendingPartnersResult {
  partners: PendingPartner[];
  total: number;
  page: number;
  limit: number;
}

export const adminPartnerRequestsService = {
  list(params: { page?: number; limit?: number; search?: string }): Promise<PendingPartnersResult> {
    return apiService.get<PendingPartnersResult>('/admin/partner-requests', params);
  },

  approve(id: string): Promise<{ success: boolean }> {
    return apiService.post<{ success: boolean }>(`/admin/partner-requests/${id}/approve`);
  },

  reject(id: string, reason: string): Promise<{ success: boolean }> {
    return apiService.post<{ success: boolean }>(`/admin/partner-requests/${id}/reject`, { reason });
  },
};
