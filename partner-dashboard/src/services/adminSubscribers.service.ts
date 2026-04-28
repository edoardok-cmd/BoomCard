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

export interface SubscriberWallet {
  availableBalance: number;
  balance: number;
  pendingBalance: number;
}

export interface SubscriberUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  wallet: SubscriberWallet | null;
}

export interface AdminSubscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  trialEnd: string | null;
  autoRenewal: boolean;
  createdAt: string;
  user: SubscriberUser;
}

export interface AdminSubscribersResult {
  subscriptions: AdminSubscription[];
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

  cancelSubscription(id: string): Promise<{ ok: boolean }> {
    return apiService.patch(`/admin/subscribers/${id}/cancel`);
  },

  changePlan(id: string, plan: SubscriptionPlan): Promise<{ id: string; plan: SubscriptionPlan; status: SubscriptionStatus }> {
    return apiService.patch(`/admin/subscribers/${id}/plan`, { plan });
  },
};
