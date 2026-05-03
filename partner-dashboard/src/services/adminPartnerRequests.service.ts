import { apiService } from './api.service';

export interface PendingPartner {
  id: string;
  businessName: string;
  category: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
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

export interface PartnerDetail extends PendingPartner {
  description: string | null;
  website: string | null;
  region: string | null;
  pendingChanges: Record<string, unknown> | null;
  pendingChangesAt: string | null;
  // assignedAdmin is hydrated server-side (see GET /admin/partner-requests/:id)
  // so the drawer can render the owner without a second roundtrip. Inherited
  // shape from PendingPartner.
}

export interface PendingPartnersResult {
  partners: PendingPartner[];
  total: number;
  page: number;
  limit: number;
}

export interface PartnerNote {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; firstName: string | null; lastName: string | null; email: string };
}

export interface AuditEntry {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

export interface AssignableAdmin {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

export interface OnboardingReadiness {
  venueCount: number;
  // Distinct venues with at least one active receipt template — readiness gate
  venuesWithReceipts: number;
  // Total active receipt template rows — informational (may exceed venueCount)
  receiptTemplateCount: number;
  // Distinct venues with an ACTIVE sticker config — readiness gate
  stickerConfigCount: number;
  venuesWithStickers: number;
  ready: boolean;
}

export const adminPartnerRequestsService = {
  list(params: { page?: number; limit?: number; search?: string; requestStatus?: string }): Promise<PendingPartnersResult> {
    return apiService.get<PendingPartnersResult>('/admin/partner-requests', params);
  },

  approve(id: string): Promise<{ success: boolean }> {
    return apiService.post<{ success: boolean }>(`/admin/partner-requests/${id}/approve`);
  },

  reject(id: string, reason: string): Promise<{ success: boolean }> {
    return apiService.post<{ success: boolean }>(`/admin/partner-requests/${id}/reject`, { reason });
  },

  advancePipeline(id: string, requestStatus: string): Promise<{ partner: PendingPartner }> {
    return apiService.patch<{ partner: PendingPartner }>(`/admin/partner-requests/${id}/status`, { requestStatus });
  },

  assign(id: string, adminId: string | null): Promise<{ partner: PendingPartner }> {
    return apiService.patch<{ partner: PendingPartner }>(`/admin/partner-requests/${id}/assign`, { adminId });
  },

  getNotes(id: string): Promise<{ notes: PartnerNote[] }> {
    return apiService.get<{ notes: PartnerNote[] }>(`/admin/partner-requests/${id}/notes`);
  },

  addNote(id: string, body: string, isInternal: boolean): Promise<{ note: PartnerNote }> {
    return apiService.post<{ note: PartnerNote }>(`/admin/partner-requests/${id}/notes`, { body, isInternal });
  },

  getDetail(id: string): Promise<{ partner: PartnerDetail }> {
    return apiService.get<{ partner: PartnerDetail }>(`/admin/partner-requests/${id}`);
  },

  getAuditLog(id: string): Promise<{ entries: AuditEntry[] }> {
    return apiService.get<{ entries: AuditEntry[] }>(`/admin/partner-requests/${id}/audit`);
  },

  getAssignableAdmins(): Promise<{ admins: AssignableAdmin[] }> {
    return apiService.get<{ admins: AssignableAdmin[] }>('/admin/partner-requests/_assignable-admins');
  },

  getOnboardingReadiness(id: string): Promise<OnboardingReadiness> {
    return apiService.get<OnboardingReadiness>(`/admin/partner-requests/${id}/onboarding-readiness`);
  },
};
