import { apiService } from './api.service';

export type WalletTransactionType =
  | 'TOP_UP'
  | 'WITHDRAWAL'
  | 'CASHBACK_CREDIT'
  | 'PURCHASE'
  | 'REFUND'
  | 'TRANSFER'
  | 'ADJUSTMENT';

export type WalletTransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TRIAL_PENDING'
  | 'ANNULLED';

export interface TransactionUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
}

export interface TransactionWallet {
  id: string;
  user: TransactionUser;
}

export interface AdminTransaction {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  status: WalletTransactionStatus;
  description: string | null;
  createdAt: string;
  wallet: TransactionWallet;
}

export interface AdminTransactionsResult {
  transactions: AdminTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminTransactionStats {
  totalVolume: number;
  totalCashback: number;
  totalWithdrawals: number;
}

// Returned by POST /adjust — does not include wallet (no join needed for the creation response)
export interface AdjustmentResult {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  currency: string;
  status: WalletTransactionStatus;
  description: string | null;
  createdAt: string;
}

export const adminTransactionsService = {
  list(params: {
    page?: number;
    limit?: number;
    search?: string;
    type?: WalletTransactionType | '';
    status?: WalletTransactionStatus | '';
    dateFrom?: string;
    dateTo?: string;
    userId?: string;
  }): Promise<AdminTransactionsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean['search'] = params.search;
    if (params.type) clean['type'] = params.type;
    if (params.status) clean['status'] = params.status;
    if (params.dateFrom) clean['dateFrom'] = params.dateFrom;
    if (params.dateTo) clean['dateTo'] = params.dateTo;
    if (params.userId) clean['userId'] = params.userId;
    return apiService.get<AdminTransactionsResult>('/admin/transactions', clean);
  },

  getStats(params: {
    search?: string;
    type?: WalletTransactionType | '';
    status?: WalletTransactionStatus | '';
    dateFrom?: string;
    dateTo?: string;
    userId?: string;
  }): Promise<AdminTransactionStats> {
    const clean: Record<string, unknown> = {};
    if (params.search) clean['search'] = params.search;
    if (params.type) clean['type'] = params.type;
    if (params.status) clean['status'] = params.status;
    if (params.dateFrom) clean['dateFrom'] = params.dateFrom;
    if (params.dateTo) clean['dateTo'] = params.dateTo;
    if (params.userId) clean['userId'] = params.userId;
    return apiService.get<AdminTransactionStats>('/admin/transactions/stats', clean);
  },

  adjust(data: { userId: string; amount: number; reason: string }): Promise<AdjustmentResult> {
    return apiService.post<AdjustmentResult>('/admin/transactions/adjust', data);
  },

  // Spec §4.3: receipt/business transactions with partner / venue / cashback / margin / risk score.
  listBusiness(params: {
    page?: number;
    limit?: number;
    search?: string;
    partnerId?: string;
    type?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<BusinessTransactionsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean['search'] = params.search;
    if (params.partnerId) clean['partnerId'] = params.partnerId;
    if (params.type) clean['type'] = params.type;
    if (params.status) clean['status'] = params.status;
    if (params.dateFrom) clean['dateFrom'] = params.dateFrom;
    if (params.dateTo) clean['dateTo'] = params.dateTo;
    return apiService.get<BusinessTransactionsResult>('/admin/transactions/business', clean);
  },
};

export interface BusinessTransaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  discountAmount: number | null;
  finalAmount: number | null;
  cashbackAmount: number | null;
  netAmount: number | null;
  margin: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
  partner: { id: string; businessName: string; businessNameBg: string | null } | null;
  venue: { id: string; name: string } | null;
}

export interface BusinessTransactionsResult {
  transactions: BusinessTransaction[];
  total: number;
  page: number;
  limit: number;
}
