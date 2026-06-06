import { apiService } from './api.service';

/**
 * BC-PARTNER-PORTAL-SCOPE-B — partner-scoped read endpoints (§6 transactions, §7 finance).
 *
 * Backend (already live on the API) strips every internal field via Prisma `select`
 * allowlists. The shapes below intentionally contain ONLY partner-safe fields — do NOT
 * add cashback formula / margin / risk fields here.
 */

/** §6 — one partner transaction row (StickerScan, partner-safe projection). */
export interface PartnerTransaction {
  id: string;
  createdAt: string;
  venueId: string;
  venueName: string | null;
  amount: number;
  status: string;
  transactionId: string | null;
  /** Offer-level discount, partner-safe. Omitted when no offer FK → frontend renders "—". */
  discountPercent?: number | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PartnerTransactionsResponse {
  success: boolean;
  data: PartnerTransaction[];
  pagination: PaginationMeta;
}

export interface PartnerTransactionFilters {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  venueId?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}

/** §7.1 — one monthly finance row (PartnerCashbackPayment, partner-safe projection). */
export interface PartnerFinanceRow {
  month: string;
  turnoverAmount: number;
  /** Float? in DB — may be null when no contracted rate is set. Render "—" when nullish. */
  contractedRate: number | null;
  totalCashbackOwed: number;
  status: string; // PENDING | PAID | OVERDUE
  paidAt: string | null;
  invoiceNumber: string | null;
  periodStatus: string | null; // OPEN | FOR_REVIEW | LOCKED | INVOICED
}

export interface PartnerFinanceResponse {
  success: boolean;
  data: PartnerFinanceRow[];
}

class PartnerPortalService {
  private readonly baseUrl = '/partners/me';

  /** §6 — GET /api/partners/me/transactions (server-side filtered + paginated). */
  async getTransactions(
    filters?: PartnerTransactionFilters,
  ): Promise<PartnerTransactionsResponse> {
    // Strip undefined/empty params so they are not sent as empty query strings.
    const params: Record<string, unknown> = {};
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') params[k] = v;
      }
    }
    return apiService.get<PartnerTransactionsResponse>(`${this.baseUrl}/transactions`, params);
  }

  /** §7.1 — GET /api/partners/me/finance (feeds both finance tables). */
  async getFinance(): Promise<PartnerFinanceResponse> {
    return apiService.get<PartnerFinanceResponse>(`${this.baseUrl}/finance`);
  }
}

export const partnerPortalService = new PartnerPortalService();
