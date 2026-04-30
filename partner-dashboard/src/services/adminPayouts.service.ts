import { apiService } from './api.service';

export type PayoutStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TRIAL_PENDING'
  | 'ANNULLED'
  | 'RISK_HOLD';

export interface PayoutUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
}

export interface PayoutWallet {
  id: string;
  availableBalance: number;
  pendingBalance: number;
  payoutIban: string | null;
  payoutBeneficiaryName: string | null;
  user: PayoutUser;
}

export interface AdminPayout {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  status: PayoutStatus;
  description: string | null;
  createdAt: string;
  metadata: string | null;
  wallet: PayoutWallet;
}

export interface PayoutsSummary {
  pendingCount: number;
  pendingTotal: number;
  processingCount: number;
  riskHoldCount: number;
}

export interface AdminPayoutsResult {
  payouts: AdminPayout[];
  total: number;
  page: number;
  limit: number;
  summary: PayoutsSummary;
}

export const adminPayoutsService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: PayoutStatus | '';
  }): Promise<AdminPayoutsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.status) clean.status = params.status;
    return apiService.get<AdminPayoutsResult>('/admin/payouts', clean);
  },

  approve(id: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/approve`, {});
  },

  reject(id: string, reason: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/reject`, { reason });
  },

  complete(id: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/complete`, {});
  },

  hold(id: string, reason?: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/hold`, { reason });
  },

  release(id: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/release`, {});
  },

  fail(id: string, reason?: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/fail`, { reason });
  },
};
