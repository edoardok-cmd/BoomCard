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

export interface CashbackDashboardStats {
  pendingTotal: number;
  paidThisMonth: number;
  overdueCount: number;
  activePartners: number;
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

class AdminCashbackService {
  private readonly base = '/admin/cashback';

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
