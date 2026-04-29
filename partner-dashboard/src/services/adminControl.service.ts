import { apiService } from './api.service';

export interface AuditLogActor {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AdminAuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  before: unknown | null;
  after: unknown | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: AuditLogActor | null;
}

export interface AdminSecurityResult {
  data: AdminAuditLog[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface DisputeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface DisputeVenue {
  id: string;
  name: string;
  city: string;
  partner: { id: string; businessName: string };
}

export interface AdminDispute {
  id: string;
  userId: string;
  venueId: string | null;
  status: string;
  total: number | null;
  cashbackAmount: number | null;
  verificationScore: number | null;
  fraudFlags: string | null;
  createdAt: string;
  user: DisputeUser;
  venue: DisputeVenue | null;
}

export interface AdminDisputesResult {
  data: AdminDispute[];
  meta: { total: number; page: number; limit: number; pages: number };
}

// Fraud-signal feed for Контрол > Сигурност (spec §7.2).
// Backed by /admin/control/risk-queue with tier=all so the page can show duplicate
// detection, QR/receipt mismatch, velocity, IBAN-anomaly signals as fraudReasons.
export interface FraudSignalReceipt {
  id: string;
  fraudScore: number;
  fraudReasons: string[];
  status: string;
  merchantName: string | null;
  totalAmount: number | null;
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    riskBucket: string | null;
  };
  venue: {
    id: string;
    name: string;
    partner: { id: string; businessName: string } | null;
  } | null;
}

export interface FraudSignalsResult {
  success: boolean;
  data: FraudSignalReceipt[];
  meta: { total: number; page: number; limit: number; pages: number; tier: string };
}

export const adminControlService = {
  getFraudSignals(params: {
    page?: number;
    limit?: number;
    tier?: 'AUTO_0_30' | 'REVIEW_31_60' | 'HIGH_61_PLUS' | 'all';
    venueId?: string;
  }): Promise<FraudSignalsResult> {
    const clean: Record<string, unknown> = {
      page: params.page,
      limit: params.limit,
      tier: params.tier ?? 'all',
    };
    if (params.venueId) clean.venueId = params.venueId;
    return apiService.get('/admin/control/risk-queue', clean);
  },

  getSecurityLogs(params: {
    page?: number;
    limit?: number;
    action?: string;
    actorId?: string;
    from?: string;
    to?: string;
  }): Promise<AdminSecurityResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.action) clean.action = params.action;
    if (params.actorId) clean.actorId = params.actorId;
    if (params.from) clean.from = params.from;
    if (params.to) clean.to = params.to;
    return apiService.get('/admin/control/security', clean);
  },

  getDisputes(params: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<AdminDisputesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status) clean.status = params.status;
    return apiService.get('/admin/control/disputes', clean);
  },

  approveDispute(id: string): Promise<void> {
    return apiService.post(`/admin/control/disputes/${id}/approve`, {});
  },

  rejectDispute(id: string): Promise<void> {
    return apiService.post(`/admin/control/disputes/${id}/reject`, {});
  },
};
