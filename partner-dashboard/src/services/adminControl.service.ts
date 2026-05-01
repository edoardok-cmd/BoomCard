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

// ── Legacy Manual-Review Receipt Queue (spec §7.1 risk queue) ───────────────

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

// ── Dispute Cases (spec §7.3) ────────────────────────────────────────────────

export type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';
export type DisputeSubjectType = 'RECEIPT' | 'CASHBACK' | 'PAYOUT' | 'INVOICE';

export interface DisputeCaseUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface DisputeCaseReceipt {
  id: string;
  merchantName: string | null;
  totalAmount: number | null;
  verifiedAmount: number | null;
  fraudScore: number | null;
  fraudReasons: string[] | null;
  status: string;
  imageUrl: string | null;
  ocrData: unknown | null;
  createdAt: string;
}

export interface DisputeNoteItem {
  id: string;
  disputeId: string;
  authorId: string;
  body: string;
  isAdmin: boolean;
  createdAt: string;
  author: DisputeCaseUser;
}

/** Lightweight shape returned by the list endpoint */
export interface DisputeCase {
  id: string;
  subjectType: DisputeSubjectType;
  receiptId: string | null;
  subjectId: string | null;
  userId: string;
  assignedTo: string | null;
  status: DisputeStatus;
  decision: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: DisputeCaseUser;
  assignee: DisputeCaseUser | null;
  receipt: Pick<DisputeCaseReceipt, 'id' | 'merchantName' | 'totalAmount' | 'fraudScore' | 'status'> | null;
  _count: { notes: number };
}

/** Full shape returned by the detail endpoint */
export interface DisputeCaseDetail extends Omit<DisputeCase, 'receipt' | '_count'> {
  receipt: DisputeCaseReceipt | null;
  notes: DisputeNoteItem[];
}

export interface DisputeCasesResult {
  success: boolean;
  data: DisputeCase[];
  meta: { total: number; page: number; limit: number; pages: number };
}

// ── Fraud signals ────────────────────────────────────────────────────────────

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
    partnerRiskBucket: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  } | null;
}

export interface FraudSignalsResult {
  success: boolean;
  data: FraudSignalReceipt[];
  meta: { total: number; page: number; limit: number; pages: number; tier: string };
}

export interface RiskQueueSummary {
  total: number;
  duplicate: number;
  qrMismatch: number;
  velocity: number;
  receiptMatch: number;
  /** Spec §7.2 "подозрително поведение" — device anomalies, blacklisted merchants, etc. */
  suspicious: number;
  other: number;
  /** Spec §7.2 "странни IBAN промени" — users who changed IBAN within the last 7 days. */
  ibanAnomaly: number;
}

export interface RiskQueueSummaryResult {
  success: boolean;
  data: RiskQueueSummary;
}

// ── Service ──────────────────────────────────────────────────────────────────

export const adminControlService = {
  // Fraud signal queue (§7.1 / §7.2)
  getFraudSignals(params: {
    page?: number;
    limit?: number;
    tier?: 'REVIEW_31_60' | 'HIGH_61_PLUS' | 'all';
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

  // Security audit log (§7.2)
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

  // Legacy manual-review receipt queue — kept for backward compat; use dispute-cases for §7.3
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

  // ── Dispute Cases (spec §7.3) ──────────────────────────────────────────────

  getDisputeCases(params: {
    page?: number;
    limit?: number;
    status?: DisputeStatus | '';
    subjectType?: DisputeSubjectType | '';
    assignedTo?: string;
  }): Promise<DisputeCasesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status) clean.status = params.status;
    if (params.subjectType) clean.subjectType = params.subjectType;
    if (params.assignedTo) clean.assignedTo = params.assignedTo;
    return apiService.get('/admin/control/dispute-cases', clean);
  },

  getDisputeCase(id: string): Promise<{ success: boolean; data: DisputeCaseDetail }> {
    return apiService.get(`/admin/control/dispute-cases/${id}`);
  },

  createDisputeCase(
    params:
      | { subjectType?: 'RECEIPT'; receiptId: string; notes?: string }
      | { subjectType: 'CASHBACK' | 'PAYOUT' | 'INVOICE'; subjectId: string; userId: string; notes?: string },
  ): Promise<{ success: boolean; data: Omit<DisputeCase, 'assignee' | '_count'> }> {
    return apiService.post('/admin/control/dispute-cases', params);
  },

  patchDisputeCase(
    id: string,
    patch: { status?: DisputeStatus; assignedTo?: string | null; decision?: string | null },
  ): Promise<{ success: boolean; data: Omit<DisputeCase, 'receipt' | '_count'> }> {
    return apiService.patch(`/admin/control/dispute-cases/${id}`, patch);
  },

  addDisputeNote(id: string, body: string): Promise<{ success: boolean; data: DisputeNoteItem }> {
    return apiService.post(`/admin/control/dispute-cases/${id}/notes`, { body });
  },

  /** List admin users for the assignee dropdown */
  getAdminUsers(): Promise<{ admins: { id: string; email: string; firstName: string | null; lastName: string | null }[]; total: number }> {
    return apiService.get('/admin/admins', { limit: 100 });
  },
};
