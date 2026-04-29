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

export const adminSubscribersService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    plan?: SubscriptionPlan | '';
    status?: SubscriptionStatus | '';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AdminSubscribersResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean['search'] = params.search;
    if (params.plan) clean['plan'] = params.plan;
    if (params.status) clean['status'] = params.status;
    if (params.dateFrom) clean['dateFrom'] = params.dateFrom;
    if (params.dateTo) clean['dateTo'] = params.dateTo;
    return apiService.get<AdminSubscribersResult>('/admin/subscribers', clean);
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

  deleteSubscriber(id: string): Promise<{ ok: boolean }> {
    return apiService.delete(`/admin/subscribers/${id}`);
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
