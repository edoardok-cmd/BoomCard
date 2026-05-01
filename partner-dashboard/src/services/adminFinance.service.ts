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
  /** True when the month has APPROVED scans but no invoices have been generated yet. */
  hasUnbilledScans?: boolean;
}

export interface ReportingPeriodRow {
  id: string;
  month: string;
  status: ReportingPeriodStatus;
  lockedAt: string | null;
  lockedBy: string | null;
  invoicedAt: string | null;
  invoicedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportData {
  period: { from: string; to: string };
  walletTransactions: Record<string, { total: number; count: number }>;
  subscriptionBreakdown: Array<{ plan: string; status: string; _count: { id: number } }>;
  cashbackInvoices: { total: number; count: number };
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

  getReports(from?: string, to?: string): Promise<{ data: ReportData }> {
    const clean: Record<string, unknown> = {};
    if (from) clean.from = from;
    if (to) clean.to = to;
    return apiService.get('/admin/finance/reports', clean);
  },

  async exportPeriods(params: { year?: number }): Promise<void> {
    const q: Record<string, unknown> = { type: 'periods', format: 'xlsx' };
    if (params.year) q.year = String(params.year);
    const { data, filename } = await apiService.getBlob('/admin/finance/export', q);
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  async exportInvoices(params: { status?: string; month?: string; search?: string }): Promise<void> {
    const q: Record<string, unknown> = { type: 'invoices', format: 'xlsx' };
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
