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

export type BillingCycle = 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'OTHER';

export interface SubscriptionUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  isTest?: boolean;
}

export interface AdminSubscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  autoRenewal: boolean;
  stripeSubscriptionId: string | null;
  payseraOrderId: string | null;
  createdAt: string;
  user: SubscriptionUser;
  // Spec §4.2 — total subscriptions ever created for this user (history indicator)
  userSubscriptionCount?: number;
  billingCycle?: BillingCycle;
  paymentCount?: number;
  paymentTotalAmount?: number;
}

export interface AdminSubscriptionsResult {
  subscriptions: AdminSubscription[];
  total: number;
  page: number;
  limit: number;
}

export const adminSubscriptionsService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    plan?: SubscriptionPlan | '';
    status?: SubscriptionStatus | '';
    excludeTest?: boolean;
  }): Promise<AdminSubscriptionsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.plan) clean.plan = params.plan;
    if (params.status) clean.status = params.status;
    if (params.excludeTest) clean.excludeTest = 'true';
    return apiService.get<AdminSubscriptionsResult>('/admin/subscriptions', clean);
  },

  cancel(id: string): Promise<void> {
    return apiService.post<void>(`/admin/subscriptions/${id}/cancel`, {});
  },

  reactivate(id: string): Promise<void> {
    return apiService.post<void>(`/admin/subscriptions/${id}/reactivate`, {});
  },

  resume(id: string): Promise<void> {
    return apiService.post<void>(`/admin/subscriptions/${id}/resume`, {});
  },

  toggleAutoRenewal(id: string, autoRenewal: boolean): Promise<void> {
    return apiService.patch<void>(`/admin/subscriptions/${id}/auto-renewal`, { autoRenewal });
  },
};
