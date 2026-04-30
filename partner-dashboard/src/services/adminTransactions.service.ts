import { apiService } from './api.service';

// Maximum rows the client-side export fetches before reporting truncation.
// Matches MAX_PAGES × default pageSize inside fetchAllBusiness / fetchAllWallet.
// Imported by the page to interpolate the cap into the truncation toast string.
export const EXPORT_ROW_CAP = 10_000;

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

interface WalletFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: WalletTransactionType | '';
  status?: WalletTransactionStatus | '';
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  minAmount?: number;
}

function cleanWalletParams(params: WalletFilterParams): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (params.page != null) clean['page'] = params.page;
  if (params.limit != null) clean['limit'] = params.limit;
  if (params.search) clean['search'] = params.search;
  if (params.type) clean['type'] = params.type;
  if (params.status) clean['status'] = params.status;
  if (params.dateFrom) clean['dateFrom'] = params.dateFrom;
  if (params.dateTo) clean['dateTo'] = params.dateTo;
  if (params.userId) clean['userId'] = params.userId;
  if (params.minAmount != null) clean['minAmount'] = params.minAmount;
  return clean;
}

export const adminTransactionsService = {
  list(params: WalletFilterParams): Promise<AdminTransactionsResult> {
    return apiService.get<AdminTransactionsResult>('/admin/transactions', cleanWalletParams(params));
  },

  getStats(params: Omit<WalletFilterParams, 'page' | 'limit' | 'minAmount'>): Promise<AdminTransactionStats> {
    return apiService.get<AdminTransactionStats>('/admin/transactions/stats', cleanWalletParams(params));
  },

  adjust(data: { userId: string; amount: number; reason: string }): Promise<AdjustmentResult> {
    return apiService.post<AdjustmentResult>('/admin/transactions/adjust', data);
  },

  // Spec §4.3: receipt/business transactions with partner / venue / cashback / margin / risk score.
  listBusiness(params: BusinessListParams): Promise<BusinessTransactionsResult> {
    return apiService.get<BusinessTransactionsResult>(
      '/admin/transactions/business',
      cleanBusinessParams({ ...params, page: params.page, limit: params.limit }),
    );
  },

  getBusinessStats(params: BusinessFilterParams): Promise<BusinessTransactionStats> {
    return apiService.get<BusinessTransactionStats>(
      '/admin/transactions/business/stats',
      cleanBusinessParams(params),
    );
  },

  // Spec §6.4 — full-period CSV export. Walks pages of /business until exhausted
  // so the file reflects the current filter set, not just the visible page.
  // Returns { rows, truncated, total } — `truncated` is true iff the result set
  // exceeded the 10 000-row cap so callers can warn the admin that the CSV is
  // incomplete (rather than silently exporting the first 10 000).
  async fetchAllBusiness(
    filters: BusinessFilterParams,
    pageSize = 200,
  ): Promise<{ rows: BusinessTransaction[]; truncated: boolean; total: number }> {
    const all: BusinessTransaction[] = [];
    let page = 1;
    let lastTotal = 0;
    // Hard cap: 50 pages × 200 = 10 000 rows. Beyond that, the export endpoint
    // should be migrated server-side; until then we surface a truncation flag.
    const MAX_PAGES = 50;
    for (let i = 0; i < MAX_PAGES; i++) {
      const result = await this.listBusiness({ ...filters, page, limit: pageSize });
      lastTotal = result.total;
      all.push(...result.transactions);
      if (all.length >= result.total || result.transactions.length === 0) break;
      page += 1;
    }
    // Rows inserted between page fetches may appear in `all` without being
    // reflected in an earlier lastTotal; deletions may cause lastTotal > all.length
    // without hitting MAX_PAGES. Both are acceptable approximations for a CSV export.
    return { rows: all, truncated: all.length < lastTotal, total: lastTotal };
  },

  async fetchAllWallet(
    filters: {
      search?: string;
      type?: WalletTransactionType | '';
      status?: WalletTransactionStatus | '';
      dateFrom?: string;
      dateTo?: string;
      userId?: string;
      minAmount?: number;
    },
    pageSize = 200,
  ): Promise<{ rows: AdminTransaction[]; truncated: boolean; total: number }> {
    const all: AdminTransaction[] = [];
    let page = 1;
    let lastTotal = 0;
    const MAX_PAGES = 50;
    for (let i = 0; i < MAX_PAGES; i++) {
      const result = await this.list({ ...filters, page, limit: pageSize });
      lastTotal = result.total;
      all.push(...result.transactions);
      if (all.length >= result.total || result.transactions.length === 0) break;
      page += 1;
    }
    // Same mid-walk race caveat as fetchAllBusiness applies here.
    return { rows: all, truncated: all.length < lastTotal, total: lastTotal };
  },

  // Spec §7.2 — partner-level fraud signal aggregated across the partner's receipts.
  // Filters mirror /business so the modal reading matches the visible slice (P1-1).
  getPartnerRisk(partnerId: string, filters?: BusinessFilterParams): Promise<PartnerRiskAggregate> {
    return apiService.get<PartnerRiskAggregate>(
      `/admin/transactions/business/partner-risk/${partnerId}`,
      filters ? cleanBusinessParams(filters) : undefined,
    );
  },
};

// Spec §4.4 — derived 5-state lifecycle, mirrors backend deriveCashbackEntryStatus.
export type CashbackEntryStatus = 'Pending' | 'Cleared' | 'Locked' | 'Paid' | 'Expired';

export interface BusinessFilterParams {
  search?: string;
  partnerId?: string;
  type?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  minRisk?: number;
}

export interface BusinessListParams extends BusinessFilterParams {
  page?: number;
  limit?: number;
}

function cleanBusinessParams(params: BusinessListParams): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (params.page != null) clean['page'] = params.page;
  if (params.limit != null) clean['limit'] = params.limit;
  if (params.search) clean['search'] = params.search;
  if (params.partnerId) clean['partnerId'] = params.partnerId;
  if (params.type) clean['type'] = params.type;
  if (params.status) clean['status'] = params.status;
  if (params.dateFrom) clean['dateFrom'] = params.dateFrom;
  if (params.dateTo) clean['dateTo'] = params.dateTo;
  if (params.minAmount != null) clean['minAmount'] = params.minAmount;
  if (params.minRisk != null) clean['minRisk'] = params.minRisk;
  return clean;
}

export interface BusinessTransaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  discount: number | null;
  discountAmount: number | null;
  finalAmount: number | null;
  cashbackAmount: number | null;
  netAmount: number | null;
  // Margin = (partnerDiscountRate × amount) − cashbackAmount.
  // null when the partner has no discountRate AND no partnerType.maxDiscountRate
  // configured — render as "—" rather than misleading "+0.00".
  margin: number | null;
  partnerDiscountRate: number | null;
  riskScore: number;
  userRiskScore: number;
  cashbackStatus: CashbackEntryStatus | null;
  receiptUploadedAt: string | null;
  sessionStartedAt: string | null;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string; riskScore: number };
  partner:
    | {
        id: string;
        businessName: string;
        discountRate: number | null;
        partnerType: { maxDiscountRate: number } | null;
      }
    | null;
  venue: { id: string; name: string } | null;
  receipt: {
    id: string;
    imageUrl: string | null;
    imageKey: string | null;
    status: string;
    fraudScore: number;
    createdAt: string;
  } | null;
  stickerScan: {
    sessionStartedAt: string | null;
    fraudScore: number;
  } | null;
}

export interface BusinessTransactionsResult {
  transactions: BusinessTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface BusinessTransactionStats {
  count: number;
  todayCount: number;
  totalVolume: number;
  averageValue: number;
  totalCashback: number;
}

export interface PartnerRiskAggregate {
  partnerId: string;
  // Count of rows (receipts + sticker scans) that contributed a fraud signal.
  // Renamed from receiptCount — the aggregate now covers both sources.
  signalCount: number;
  maxFraudScore: number;
  avgFraudScore: number;
}
