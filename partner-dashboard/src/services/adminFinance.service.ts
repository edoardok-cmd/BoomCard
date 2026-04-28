import { apiService } from './api.service';

export type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export interface AdminInvoice {
  id: string;
  partnerId: string;
  month: string;
  totalCashbackOwed: number;
  status: InvoiceStatus;
  paidAt: string | null;
  paidBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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

  markInvoicePaid(id: string, notes?: string): Promise<void> {
    return apiService.post(`/admin/finance/invoices/${id}/pay`, { notes });
  },

  getPeriods(year?: number): Promise<{ data: PeriodRow[]; meta: { year: number } }> {
    const clean: Record<string, unknown> = {};
    if (year) clean.year = year;
    return apiService.get('/admin/finance/periods', clean);
  },

  getReports(from?: string, to?: string): Promise<{ data: ReportData }> {
    const clean: Record<string, unknown> = {};
    if (from) clean.from = from;
    if (to) clean.to = to;
    return apiService.get('/admin/finance/reports', clean);
  },
};
