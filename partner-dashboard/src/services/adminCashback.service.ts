/**
 * Admin Cashback Service (Frontend)
 * Communicates with /api/admin/cashback/* endpoints
 */

import { apiService } from './api.service';

export interface CashbackSummaryEntry {
  partnerId: string;
  partnerName: string;
  partnerEmail: string | null;
  month: string;
  receiptCount: number;
  totalOwed: number;
  paymentStatus: 'PENDING' | 'PAID' | 'OVERDUE';
  paidAt: string | null;
  paidBy: string | null;
  notes: string | null;
}

// Spec §3.1 subscriber-side cashback stats
export interface CashbackDashboardStats {
  totalAccrued: number;    // начислен — all-time sum of cleared credits
  totalCleared: number;   // одобрен — currently available for payout
  totalPending: number;   // изчакващ — not yet approved
  expiringTotal: number;  // изтичащ — cleared but expiring within 14 days
}

export interface CashbackRateRow {
  id: string;
  discountStep: number;
  basic: number;
  premium: number;
  effectiveFrom: string;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CurrentCashbackRate {
  discountStep: number;
  basic: number;
  premium: number;
  effectiveFrom: string | null;
  source: 'db' | 'default';
}

// Spec §4.4 — entry-based cashback with 5 states
export type CashbackEntryStatus = 'Pending' | 'Cleared' | 'Locked' | 'Paid' | 'Expired';

export interface CashbackEntry {
  id: string;
  amount: number;
  status: CashbackEntryStatus;
  rawStatus: string;
  cashbackExpiresAt: string | null;
  daysUntilExpiry: number | null;
  description: string | null;
  createdAt: string;
  receipt: { id: string; totalAmount: number | null; merchantName: string | null } | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
}

export interface CashbackEntriesResult {
  data: CashbackEntry[];
  total: number;
  page: number;
  limit: number;
}

class AdminCashbackService {
  private readonly base = '/admin/cashback';

  async getEntries(params: { page?: number; limit?: number; status?: CashbackEntryStatus }): Promise<CashbackEntriesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status) clean.status = params.status;
    const res = await apiService.get<{ success: boolean } & CashbackEntriesResult>(`${this.base}/entries`, clean);
    return { data: res.data, total: res.total, page: res.page, limit: res.limit };
  }


  async getStats(): Promise<CashbackDashboardStats> {
    const res = await apiService.get<{ success: boolean; data: CashbackDashboardStats }>(`${this.base}/stats`);
    return res.data;
  }

  async getSummary(params?: {
    month?: string;
    status?: 'PENDING' | 'PAID' | 'OVERDUE';
  }): Promise<CashbackSummaryEntry[]> {
    const res = await apiService.get<{ success: boolean; data: CashbackSummaryEntry[] }>(
      `${this.base}/summary`,
      params,
    );
    return res.data ?? [];
  }

  async markPaid(partnerId: string, month: string, notes?: string): Promise<void> {
    await apiService.post(`${this.base}/${partnerId}/${month}/mark-paid`, { notes });
  }

  async sendReminder(partnerId: string, month?: string): Promise<void> {
    await apiService.post(`${this.base}/${partnerId}/remind`, { month });
  }

  async approveEntry(entryId: string): Promise<void> {
    await apiService.post(`${this.base}/entries/${entryId}/approve`, {});
  }

  async lockEntry(entryId: string): Promise<void> {
    await apiService.post(`${this.base}/entries/${entryId}/lock`, {});
  }

  async expireEntry(entryId: string): Promise<void> {
    await apiService.post(`${this.base}/entries/${entryId}/expire`, {});
  }

  async backfillExpiry(): Promise<{ message: string }> {
    const res = await apiService.post<{ success: boolean; message: string }>(`${this.base}/backfill-expiry`, {});
    return { message: res.message };
  }

  async getRates(): Promise<CashbackRateRow[]> {
    const res = await apiService.get<{ success: boolean; data: CashbackRateRow[] }>(`${this.base}/rates`);
    return res.data ?? [];
  }

  async getCurrentRates(): Promise<CurrentCashbackRate[]> {
    const res = await apiService.get<{ success: boolean; data: CurrentCashbackRate[] }>(`${this.base}/rates/current`);
    return res.data ?? [];
  }

  async createRates(params: {
    rates: Array<{ discountStep: number; basic: number; premium: number }>;
    effectiveFrom?: string;
    notes?: string;
  }): Promise<void> {
    await apiService.post(`${this.base}/rates`, params);
  }
}

export const adminCashbackService = new AdminCashbackService();
