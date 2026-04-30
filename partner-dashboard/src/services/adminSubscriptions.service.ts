import { apiService } from './api.service';

export type SubscriptionPlan = 'LIGHT' | 'BASIC' | 'PREMIUM';

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED'
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
  lastPaymentAt?: string | null;
}

export interface AdminSubscriptionsResult {
  subscriptions: AdminSubscription[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminSubscriptionsExportResult {
  subscriptions: AdminSubscription[];
  total: number;
  truncated: boolean;
}

export interface AdminSubscriptionHistoryEntry {
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
  billingCycle: BillingCycle;
  planDisplayName?: string;
}

export interface AdminSubscriptionHistory {
  user: SubscriptionUser;
  subscriptions: AdminSubscriptionHistoryEntry[];
  paymentSummary: {
    count: number;
    totalAmount: number;
    lastPaymentAt: string | null;
  };
}

export interface AdminSubscriptionsListParams {
  page?: number;
  limit?: number;
  search?: string;
  plan?: SubscriptionPlan | '';
  status?: SubscriptionStatus | '';
  billingCycle?: BillingCycle | '';
  cancelScheduled?: 'true' | 'false' | '';
  excludeTest?: boolean;
}

function buildQuery(params: AdminSubscriptionsListParams): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (params.page) clean.page = params.page;
  if (params.limit) clean.limit = params.limit;
  if (params.search) clean.search = params.search;
  if (params.plan) clean.plan = params.plan;
  if (params.status) clean.status = params.status;
  if (params.billingCycle) clean.billingCycle = params.billingCycle;
  if (params.cancelScheduled) clean.cancelScheduled = params.cancelScheduled;
  if (params.excludeTest) clean.excludeTest = 'true';
  return clean;
}

export const adminSubscriptionsService = {
  list(params: AdminSubscriptionsListParams): Promise<AdminSubscriptionsResult> {
    return apiService.get<AdminSubscriptionsResult>('/admin/subscriptions', buildQuery(params));
  },

  exportAll(params: Omit<AdminSubscriptionsListParams, 'page' | 'limit'>): Promise<AdminSubscriptionsExportResult> {
    return apiService.get<AdminSubscriptionsExportResult>('/admin/subscriptions/export', buildQuery(params));
  },

  getUserHistory(userId: string): Promise<AdminSubscriptionHistory> {
    return apiService.get<AdminSubscriptionHistory>(`/admin/subscriptions/user/${userId}/history`);
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
