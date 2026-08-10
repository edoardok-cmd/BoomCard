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

// Spec §3.1 + §4.4 subscriber-side cashback stats
// BC-QA-031: backend now returns plain EUR numbers (dual-currency display
// feature removed) — no more {bgn, eur, windowOpen} wrapper.
export interface CashbackDashboardStats {
  totalAccrued: number;    // начислен — all-time sum of cleared credits
  totalCleared: number;   // одобрен — currently available for payout
  totalPending: number;   // изчакващ — not yet approved
  expiringTotal: number;  // изтичащ — cleared but expiring within 14 days
  totalLocked: number;    // заключен — locked by admin (CANCELLED + ANNULLED/FAILED, not yet paid)
  totalPaid: number;      // платен — explicitly marked paid by admin via Locked→Paid action
  totalExpired: number;   // изтекъл — past 60-day rolling expiry, never paid out
  totalVoided: number;    // анулиран — risk review rejected or admin voided (spec §4.4 v1.1)
}

export interface CashbackRateRow {
  id: string;
  discountStep: number;
  basic: number;
  premium: number;
  effectiveFrom: string;
  createdBy: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CurrentCashbackRate {
  discountStep: number;
  basic: number;
  premium: number;
  effectiveFrom: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  source: 'db' | 'default';
}

// NOTE (BC-QA-031): this admin-cashback surface (stats/payout-thresholds/entries) no
// longer uses DualCurrencyAmount — the backend now returns plain EUR numbers for those
// endpoints (see CashbackDashboardStats / CashbackEntry.amount / getPayoutThresholds()
// below). The type is kept exported here only because `DashboardPage.tsx` (a different,
// partner-side page backed by a different endpoint, `GET /api/dashboard/...`) still
// imports and uses it for `totalAmount`/`cashbackAmount` — removing the export would
// break that unrelated file's typecheck. That page has the same-shaped regression
// (its backing route also now returns plain numbers, not {bgn, eur, windowOpen}) but
// was out of scope for this fix — flagged separately, not fixed here.
export interface DualCurrencyAmount {
  /** BGN value — null once the transition window has closed (EUR-only display). */
  bgn: number | null;
  /** EUR value — always present. */
  eur: number;
  /** Whether the transition window is open (both currencies shown). */
  windowOpen: boolean;
}

// Spec §4.4 v1.1 — entry-based cashback with 7 states (TrialPending + Voided added)
export type CashbackEntryStatus = 'Pending' | 'TrialPending' | 'Cleared' | 'Locked' | 'Paid' | 'Expired' | 'Voided';

export interface CashbackEntry {
  id: string;
  // BC-QA-031: backend now returns a plain EUR number (no more {bgn, eur, windowOpen}).
  amount: number;
  status: CashbackEntryStatus;
  rawStatus: string;
  cashbackExpiresAt: string | null;
  daysUntilExpiry: number | null;
  description: string | null;
  createdAt: string;
  // Spec §4.4 v1.1 — visible to user when status === 'Voided'
  voidedAt: string | null;
  voidedReason: string | null;
  receipt: { id: string; totalAmount: number | null; merchantName: string | null } | null;
  partner: { id: string; businessName: string } | null;
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

  async getEntries(params: {
    page?: number;
    limit?: number;
    status?: CashbackEntryStatus;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CashbackEntriesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status) clean.status = params.status;
    if (params.search) clean.search = params.search;
    if (params.dateFrom) clean.dateFrom = params.dateFrom;
    if (params.dateTo) clean.dateTo = params.dateTo;
    const res = await apiService.get<{ success: boolean } & CashbackEntriesResult>(`${this.base}/entries`, clean);
    return { data: res.data, total: res.total, page: res.page, limit: res.limit };
  }

  // BC-QA-031: backend now returns `{success, data: {BASIC, PREMIUM_WEEKLY, PREMIUM, PREMIUM_MONTHLY}}`
  // — plain EUR numbers, no more top-level `display` envelope key.
  async getPayoutThresholds(): Promise<Record<string, number>> {
    const res = await apiService.get<{ success: boolean; data: Record<string, number> }>(`${this.base}/payout-thresholds`);
    return res.data ?? {};
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

  async payEntry(entryId: string): Promise<void> {
    await apiService.post(`${this.base}/entries/${entryId}/pay`, {});
  }

  // Spec §4.4 v1.1 — admin voids a cashback entry with a visible reason.
  // The row stays visible to the user as "Анулиран" with the reason.
  async voidEntry(entryId: string, reason: string): Promise<void> {
    await apiService.post(`${this.base}/entries/${entryId}/void`, { reason });
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

  /** Cancel a future-scheduled snapshot by its effectiveFrom ISO string. */
  async deleteSnapshot(effectiveFromISO: string): Promise<void> {
    await apiService.delete(`${this.base}/rates/snapshot/${encodeURIComponent(effectiveFromISO)}`);
  }
}

export const adminCashbackService = new AdminCashbackService();
