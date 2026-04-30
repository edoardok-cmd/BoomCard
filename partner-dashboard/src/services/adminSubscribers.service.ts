import { apiService } from './api.service';

export type SubscriptionPlan = 'LIGHT' | 'BASIC' | 'PREMIUM';
export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'TRIALING'
  | 'UNPAID'
  | 'PAUSED';

export type UserAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface SubscriberWallet {
  availableBalance: number;
  balance: number;
  pendingBalance: number;
}

export interface SubscriberSubscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  autoRenewal: boolean;
  canceledAt: string | null;
  createdAt: string;
  planDisplayName?: string;
}

// User-centric shape returned by GET /api/admin/subscribers
export interface AdminSubscriber {
  id: string;               // USER id
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  status: UserAccountStatus; // user account status (ACTIVE / SUSPENDED / DELETED)
  deletedAt: string | null;
  riskScore: number | null;
  lastLoginAt: string | null;
  createdAt: string;        // user account creation date
  wallet: SubscriberWallet | null;
  subscription: SubscriberSubscription | null;
}

export interface AdminSubscriberDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  iban: string | null;
  role: string;
  status: UserAccountStatus;
  deletedAt: string | null;
  riskScore: number | null;
  riskBucket: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  marketingConsent: boolean;
  preferredLanguage: string | null;
  wallet: SubscriberWallet | null;
  subscriptions: Array<{
    id: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodEnd: string;
    autoRenewal: boolean;
    canceledAt: string | null;
    createdAt: string;
  }>;
}

export interface LoginHistoryEntry {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  success: boolean;
}

export interface AdminSubscribersResult {
  subscribers: AdminSubscriber[];
  total: number;
  page: number;
  limit: number;
}

export type AccountStatusFilter = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type RiskLevelFilter = 'low' | 'medium' | 'high';

export interface SubscriberFilters {
  search?: string;
  plan?: SubscriptionPlan | '';
  status?: SubscriptionStatus | '';
  accountStatus?: AccountStatusFilter | '';
  riskLevel?: RiskLevelFilter | '';
  dateFrom?: string;
  dateTo?: string;
}

function cleanFilters(f: SubscriberFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.search) out['search'] = f.search;
  if (f.plan) out['plan'] = f.plan;
  if (f.status) out['status'] = f.status;
  if (f.accountStatus) out['accountStatus'] = f.accountStatus;
  if (f.riskLevel) out['riskLevel'] = f.riskLevel;
  if (f.dateFrom) out['dateFrom'] = f.dateFrom;
  if (f.dateTo) out['dateTo'] = f.dateTo;
  return out;
}

export const adminSubscribersService = {
  list(params: SubscriberFilters & { page?: number; limit?: number }): Promise<AdminSubscribersResult> {
    return apiService.get<AdminSubscribersResult>('/admin/subscribers', {
      page: params.page,
      limit: params.limit,
      ...cleanFilters(params),
    });
  },

  exportAll(params: SubscriberFilters): Promise<{ subscribers: AdminSubscriber[]; limit: number }> {
    return apiService.get('/admin/subscribers/export', cleanFilters(params));
  },

  cancelSubscription(userId: string): Promise<{ ok: boolean }> {
    return apiService.patch(`/admin/subscribers/${userId}/cancel`);
  },

  changePlan(
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<{ id: string; plan: SubscriptionPlan; status: SubscriptionStatus }> {
    return apiService.patch(`/admin/subscribers/${userId}/plan`, { plan });
  },

  getSubscriber(id: string): Promise<AdminSubscriberDetail> {
    return apiService.get(`/admin/subscribers/${id}`);
  },

  suspendSubscriber(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<{ ok: boolean }> {
    return apiService.patch(`/admin/subscribers/${id}/status`, { status });
  },

  deleteAccount(id: string, reason?: string): Promise<{ ok: boolean; userId: string; reason: string | null }> {
    return apiService.delete(`/admin/subscribers/${id}/account`, { data: reason ? { reason } : undefined });
  },

  restoreAccount(id: string): Promise<{ ok: boolean; id: string; status: string }> {
    return apiService.post(`/admin/subscribers/${id}/restore`);
  },

  refund(
    id: string,
    payload: { amount?: number; reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' } = {},
  ): Promise<{ ok: boolean; refundId: string; amount: number; currency: string }> {
    return apiService.post(`/admin/subscribers/${id}/refund`, payload);
  },

  forceLogout(id: string): Promise<{ ok: boolean; revokedCount: number }> {
    return apiService.delete(`/admin/subscribers/${id}/sessions`);
  },

  getLoginHistory(
    id: string,
    page: number,
    limit: number,
  ): Promise<{ history: LoginHistoryEntry[]; total: number; page: number; limit: number }> {
    return apiService.get(`/admin/subscribers/${id}/login-history`, { page, limit });
  },
};
