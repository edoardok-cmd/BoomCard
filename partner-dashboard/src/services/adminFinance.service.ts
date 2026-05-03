import { apiService } from './api.service';

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE';
export type ReportingPeriodStatus = 'OPEN' | 'FOR_REVIEW' | 'LOCKED' | 'INVOICED';

export interface AdminInvoice {
  id: string;
  partnerId: string;
  month: string;
  turnoverAmount: number;
  contractedRate: number | null;
  totalCashbackOwed: number;
  marginAmount: number;
  status: InvoiceStatus;
  paidAt: string | null;
  paidBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Lifecycle status of the billing period this invoice belongs to. Null if no period record exists yet. */
  reportingPeriodStatus: ReportingPeriodStatus | null;
  partner: {
    id: string;
    businessName: string;
    status: string;
    city: string | null;
    partnerType: { name: string; color: string } | null;
  };
}

export interface AdminInvoicesResult {
  data: AdminInvoice[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface PeriodRow {
  month: string;
  total: number;
  pending: number;
  paid: number;
  overdue: number;
  count: number;
  /** True when the month has APPROVED scans not yet fully covered by generated invoices. */
  hasUnbilledScans: boolean;
}

export interface ReportingPeriodRow {
  id: string;
  month: string;
  status: ReportingPeriodStatus;
  openedAt: string | null;
  openedBy: string | null;
  openedByName: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  lockedByName: string | null;
  invoicedAt: string | null;
  invoicedBy: string | null;
  invoicedByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportPartnerBreakdown {
  partnerId: string;
  partnerName: string;
  partnerCity: string | null;
  cashback: number;
  margin: number;
  turnover: number;
  contractedRate: number | null;
  /** True when invoices for this partner have genuinely different contracted rates (not just all-null). */
  ratesVary: boolean;
  invoiceCount: number;
  statuses: Record<string, number>;
}

export interface PlanBreakdownRow {
  plan: string;
  scanCount: number;
  cashback: number;
  turnover: number;
}

export type PayoutStatus =
  | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  | 'RISK_HOLD' | 'CANCELLED' | 'ANNULLED' | 'TRIAL_PENDING';

export interface ReportData {
  period: { from: string; to: string };
  walletTransactions: Record<string, { total: number; count: number }>;
  cashbackInvoices: {
    total: number;
    marginTotal: number;
    turnoverTotal: number;
    count: number;
  };
  partnerBreakdown: ReportPartnerBreakdown[];
  /** status is null for months that have no ReportingPeriod record yet */
  periodStatuses: Array<{ month: string; status: string | null; pendingCount: number; overdueCount: number }>;
  planBreakdown: PlanBreakdownRow[];
  /** Spec §6.4 "плащания" dimension: WITHDRAWAL transactions grouped by payout status. */
  payoutBreakdown: {
    byStatus: Record<string, { total: number; count: number }>;
    total: number;
    count: number;
    /** True when the report was filtered to a single payout status. */
    filtered: boolean;
  };
}

export const adminFinanceService = {
  listInvoices(params: {
    page?: number;
    limit?: number;
    status?: InvoiceStatus | '';
    month?: string;
    search?: string;
  }): Promise<AdminInvoicesResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status) clean.status = params.status;
    if (params.month) clean.month = params.month;
    if (params.search) clean.search = params.search;
    return apiService.get('/admin/finance/invoices', clean);
  },

  generateInvoices(month: string): Promise<{ data: { created: number; updated: number; total: number }; message: string }> {
    return apiService.post('/admin/finance/invoices/generate', { month });
  },

  markInvoicePaid(id: string): Promise<void> {
    return apiService.post(`/admin/finance/invoices/${id}/pay`, {});
  },

  markInvoiceOverdue(id: string): Promise<void> {
    return apiService.patch(`/admin/finance/invoices/${id}/status`, { status: 'OVERDUE' });
  },

  markInvoicePending(id: string): Promise<void> {
    return apiService.patch(`/admin/finance/invoices/${id}/status`, { status: 'PENDING' });
  },

  updateInvoiceNotes(id: string, notes: string): Promise<void> {
    return apiService.patch(`/admin/finance/invoices/${id}/notes`, { notes });
  },

  getPeriods(year?: number): Promise<{ data: PeriodRow[]; meta: { year: number } }> {
    const clean: Record<string, unknown> = {};
    if (year) clean.year = year;
    return apiService.get('/admin/finance/periods', clean);
  },

  getReportingPeriods(year?: number): Promise<{ data: ReportingPeriodRow[] }> {
    const clean: Record<string, unknown> = {};
    if (year) clean.year = year;
    return apiService.get('/admin/finance/reporting-periods', clean);
  },

  upsertReportingPeriod(month: string, notes?: string): Promise<{ data: ReportingPeriodRow }> {
    return apiService.post('/admin/finance/reporting-periods', { month, notes });
  },

  advanceReportingPeriod(month: string, status: ReportingPeriodStatus): Promise<{ data: ReportingPeriodRow }> {
    return apiService.patch(`/admin/finance/reporting-periods/${month}/status`, { status });
  },

  deleteReportingPeriod(month: string): Promise<void> {
    return apiService.delete(`/admin/finance/reporting-periods/${month}`);
  },

  getReports(params?: {
    from?: string;
    to?: string;
    partnerId?: string;
    invoiceStatus?: string;
    plan?: string;
    payoutStatus?: string;
  }): Promise<{ data: ReportData }> {
    const clean: Record<string, unknown> = {};
    if (params?.from) clean.from = params.from;
    if (params?.to) clean.to = params.to;
    if (params?.partnerId) clean.partnerId = params.partnerId;
    if (params?.invoiceStatus) clean.invoiceStatus = params.invoiceStatus;
    if (params?.plan) clean.plan = params.plan;
    if (params?.payoutStatus) clean.payoutStatus = params.payoutStatus;
    return apiService.get('/admin/finance/reports', clean);
  },

  getReportPartners(): Promise<{ data: Array<{ id: string; businessName: string }> }> {
    return apiService.get('/admin/finance/report-partners', {});
  },

  async exportReports(params: { from?: string; to?: string; format?: 'csv' | 'xlsx'; partnerId?: string; invoiceStatus?: string; plan?: string; payoutStatus?: string }): Promise<void> {
    const q: Record<string, unknown> = { type: 'reports', format: params.format ?? 'xlsx' };
    if (params.from) q.from = params.from;
    if (params.to) q.to = params.to;
    if (params.partnerId) q.partnerId = params.partnerId;
    if (params.invoiceStatus) q.invoiceStatus = params.invoiceStatus;
    if (params.plan) q.plan = params.plan;
    if (params.payoutStatus) q.payoutStatus = params.payoutStatus;
    const { data, filename } = await apiService.getBlob('/admin/finance/export', q);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  async exportPeriods(params: { year?: number; format?: 'csv' | 'xlsx' }): Promise<void> {
    const q: Record<string, unknown> = { type: 'periods', format: params.format ?? 'xlsx' };
    if (params.year) q.year = String(params.year);
    const { data, filename } = await apiService.getBlob('/admin/finance/export', q);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  getPayoutThresholds(): Promise<{ data: Record<string, number> }> {
    return apiService.get('/admin/finance/payout-thresholds', {});
  },

  async exportInvoices(params: { status?: string; month?: string; search?: string; format?: 'csv' | 'xlsx' }): Promise<void> {
    const q: Record<string, unknown> = { type: 'invoices', format: params.format ?? 'xlsx' };
    if (params.status) q.status = params.status;
    if (params.month) q.month = params.month;
    if (params.search) q.search = params.search;
    const { data, filename } = await apiService.getBlob('/admin/finance/export', q);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
