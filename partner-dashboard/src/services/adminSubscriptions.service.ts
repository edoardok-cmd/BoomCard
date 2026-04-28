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

export interface SubscriptionUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
}

export interface AdminSubscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  autoRenewal: boolean;
  stripeSubscriptionId: string | null;
  payseraOrderId: string | null;
  createdAt: string;
  user: SubscriptionUser;
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
  }): Promise<AdminSubscriptionsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.plan) clean.plan = params.plan;
    if (params.status) clean.status = params.status;
    return apiService.get<AdminSubscriptionsResult>('/admin/subscriptions', clean);
  },

  cancel(id: string): Promise<void> {
    return apiService.post<void>(`/admin/subscriptions/${id}/cancel`, {});
  },

  reactivate(id: string): Promise<void> {
    return apiService.post<void>(`/admin/subscriptions/${id}/reactivate`, {});
  },

  toggleAutoRenewal(id: string, autoRenewal: boolean): Promise<void> {
    return apiService.patch<void>(`/admin/subscriptions/${id}/auto-renewal`, { autoRenewal });
  },
};
