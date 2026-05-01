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
    partnerId: string;
    partner: { id: string; businessName: string } | null;
    // Spec §7.2 "Риск при партньор": derived from risk-receipt count across all partner venues.
    partnerRiskBucket: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  } | null;
}

export interface FraudSignalsResult {
  success: boolean;
  data: FraudSignalReceipt[];
  meta: { total: number; page: number; limit: number; pages: number; tier: string };
}

// Global signal counts (not page-scoped) from /risk-queue/summary.
export interface RiskQueueSummary {
  total: number;
  duplicate: number;
  qrMismatch: number;
  velocity: number;
  ibanAnomaly: number;
  receiptMatch: number;
  other: number;
}

export interface RiskQueueSummaryResult {
  success: boolean;
  data: RiskQueueSummary;
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

  getRiskQueueSummary(): Promise<RiskQueueSummaryResult> {
    return apiService.get('/admin/control/risk-queue/summary');
  },

  approveRiskSignal(id: string, notes?: string): Promise<{ success: boolean }> {
    return apiService.post(`/admin/control/risk-queue/${id}/approve`, notes ? { notes } : {});
  },

  rejectRiskSignal(id: string, reason?: string): Promise<{ success: boolean }> {
    return apiService.post(`/admin/control/risk-queue/${id}/reject`, reason ? { reason } : {});
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

  approveDispute(id: string, notes?: string): Promise<void> {
    return apiService.post(`/admin/control/disputes/${id}/approve`, notes ? { notes } : {});
  },

  rejectDispute(id: string, notes?: string): Promise<void> {
    return apiService.post(`/admin/control/disputes/${id}/reject`, notes ? { notes } : {});
  },
};
