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

export interface PayoutSubscription {
  plan: string;
  status: string;
}

export interface PayoutUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  subscriptions: PayoutSubscription[];
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
  processingTotal: number;
  completedCount: number;
  completedTotal: number;
  riskHoldCount: number;
  failedCount: number;
  failedTotal: number;
  totalCount: number;
}

export interface PayoutsFilteredSummary {
  pendingCount: number;
  pendingTotal: number;
  processingCount: number;
  processingTotal: number;
  completedCount: number;
  completedTotal: number;
  riskHoldCount: number;
  failedCount: number;
  failedTotal: number;
  cancelledCount: number;
  totalCount: number;
}

export interface AdminPayoutsResult {
  payouts: AdminPayout[];
  total: number;
  page: number;
  limit: number;
  summary: PayoutsSummary;
  filteredSummary: PayoutsFilteredSummary;
}

export const adminPayoutsService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: PayoutStatus | '';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AdminPayoutsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search)   clean.search   = params.search;
    if (params.status)   clean.status   = params.status;
    if (params.dateFrom) clean.dateFrom = params.dateFrom;
    if (params.dateTo)   clean.dateTo   = params.dateTo;
    return apiService.get<AdminPayoutsResult>('/admin/payouts', clean);
  },

  approve(id: string): Promise<void> {
    return apiService.patch(`/admin/payouts/${id}/approve`, {});
  },

  bulkApprove(): Promise<{ approved: number; skipped: number; total: number }> {
    return apiService.patch('/admin/payouts/bulk-approve', {});
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

  async exportPayouts(params: { dateFrom?: string; dateTo?: string; status?: string; format?: 'csv' | 'xlsx' }): Promise<void> {
    const q: Record<string, unknown> = { type: 'payouts', format: params.format ?? 'xlsx' };
    if (params.dateFrom) q.from = params.dateFrom;
    if (params.dateTo)   q.to   = params.dateTo;
    if (params.status)   q.status = params.status;
    const { data, filename } = await (await import('./api.service')).apiService.getBlob('/admin/finance/export', q);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
