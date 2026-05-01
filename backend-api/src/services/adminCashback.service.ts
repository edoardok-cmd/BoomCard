/**
 * Admin Cashback Service
 *
 * Computes per-partner monthly cashback summaries from APPROVED sticker scans
 * (the live cashback pipeline — direct Receipt submission is retired) and
 * manages PartnerCashbackPayment records.
 *
 * StickerScan.venueId is a FK to Venue.id; liability rolls up to Venue.partnerId
 * which is the valid FK target of PartnerCashbackPayment.partnerId.
 */

import { ScanStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import { CASHBACK_MATRIX, CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';

export interface CashbackSummaryEntry {
  partnerId: string;
  partnerName: string;
  partnerEmail: string | null;
  month: string;          // "YYYY-MM"
  receiptCount: number;   // count of APPROVED sticker scans (legacy field name kept for frontend compat)
  totalOwed: number;      // sum of cashbackAmount from APPROVED sticker scans
  paymentStatus: 'PENDING' | 'PAID' | 'OVERDUE';
  paidAt: Date | null;
  paidBy: string | null;
  notes: string | null;
}

class AdminCashbackService {
  /**
   * Get monthly cashback summary for all partners.
   * Groups APPROVED receipts by partner and month, enriched with payment status.
   *
   * @param month Optional "YYYY-MM" filter. Defaults to current month.
   * @param status Optional payment status filter.
   */
  async getSummary(params?: {
    month?: string;
    status?: 'PENDING' | 'PAID' | 'OVERDUE';
  }): Promise<CashbackSummaryEntry[]> {
    const targetMonth = params?.month || this.currentMonth();

    // Build date range for the month
    const [year, mon] = targetMonth.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);

    // Aggregate APPROVED sticker scans in this month.
    // StickerScan.venueId → Venue.id → Venue.partnerId gives the FK-valid Partner.id
    // that PartnerCashbackPayment.partnerId expects.
    const scans = await prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.APPROVED,
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      select: {
        venueId: true,
        cashbackAmount: true,
        venue: { select: { partnerId: true } },
      },
    });

    if (scans.length === 0) return [];

    // Roll up per-scan cashback to per-partner totals
    type Totals = { totalOwed: number; count: number };
    const partnerTotals = new Map<string, Totals>();
    for (const scan of scans) {
      const partnerId = scan.venue?.partnerId;
      if (!partnerId) continue;
      const current = partnerTotals.get(partnerId) ?? { totalOwed: 0, count: 0 };
      current.totalOwed += scan.cashbackAmount;
      current.count += 1;
      partnerTotals.set(partnerId, current);
    }

    if (partnerTotals.size === 0) return [];

    const partnerIds = [...partnerTotals.keys()];

    const [partners, payments] = await Promise.all([
      prisma.partner.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, businessName: true, email: true },
      }),
      prisma.partnerCashbackPayment.findMany({
        where: { partnerId: { in: partnerIds }, month: targetMonth },
      }),
    ]);

    const partnerMap = new Map(partners.map(p => [p.id, p]));
    const paymentMap = new Map(payments.map(p => [p.partnerId, p]));

    const now = new Date();
    const overdueThreshold = new Date(monthEnd);
    overdueThreshold.setDate(overdueThreshold.getDate() + 30); // overdue after 30 days past end of month

    const results: CashbackSummaryEntry[] = partnerIds.map(partnerId => {
      const partner = partnerMap.get(partnerId);
      const payment = paymentMap.get(partnerId);
      const totals = partnerTotals.get(partnerId)!;

      let paymentStatus: CashbackSummaryEntry['paymentStatus'] = 'PENDING';
      if (payment?.status === 'PAID') {
        paymentStatus = 'PAID';
      } else if (now > overdueThreshold) {
        paymentStatus = 'OVERDUE';
      }

      return {
        partnerId,
        partnerName: partner?.businessName ?? 'Unknown Partner',
        partnerEmail: partner?.email ?? null,
        month: targetMonth,
        receiptCount: totals.count,
        totalOwed: Math.round(totals.totalOwed * 100) / 100,
        paymentStatus,
        paidAt: payment?.paidAt ?? null,
        paidBy: payment?.paidBy ?? null,
        notes: payment?.notes ?? null,
      };
    });

    const sorted = results.sort((a, b) => a.partnerName.localeCompare(b.partnerName));

    if (params?.status) {
      return sorted.filter(r => r.paymentStatus === params.status);
    }

    return sorted;
  }

  /**
   * Mark a partner's monthly cashback as paid.
   */
  async markPaid(params: {
    partnerId: string;
    month: string;
    adminUserId: string;
    notes?: string;
    totalOwed?: number;
  }): Promise<void> {
    const [year, mon] = params.month.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);

    // Compute totalOwed (cashback) if not provided.
    let totalOwed = params.totalOwed ?? 0;
    if (!totalOwed) {
      const agg = await prisma.stickerScan.aggregate({
        where: {
          status: ScanStatus.APPROVED,
          createdAt: { gte: monthStart, lt: monthEnd },
          venue: { partnerId: params.partnerId },
        },
        _sum: { cashbackAmount: true },
      });
      totalOwed = agg._sum.cashbackAmount ?? 0;
    }

    // Compute turnover (gross transaction amounts) — spec 6.2 Оборот.
    // Per scan: prefer verifiedAmount (staff-verified), fall back to billAmount (customer-submitted).
    // aggregate._sum can't express per-row coalesce, so we fetch individually.
    const turnoverScans = await prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.APPROVED,
        createdAt: { gte: monthStart, lt: monthEnd },
        venue: { partnerId: params.partnerId },
      },
      select: { verifiedAmount: true, billAmount: true },
    });
    const turnoverAmount = turnoverScans.reduce(
      (sum, s) => sum + (s.verifiedAmount ?? s.billAmount ?? 0),
      0,
    );

    // Snapshot contracted rate — spec 6.2 Процент.
    const partner = await prisma.partner.findUnique({
      where: { id: params.partnerId },
      select: { discountRate: true, partnerType: { select: { maxDiscountRate: true } } },
    });
    const contractedRate = partner?.discountRate ?? (partner?.partnerType as { maxDiscountRate?: number } | null)?.maxDiscountRate ?? null;

    // BoomCard margin = what partner owes at contracted rate minus what users received as cashback.
    const marginAmount = contractedRate != null && turnoverAmount > 0
      ? Math.round(((contractedRate / 100) * turnoverAmount - totalOwed) * 100) / 100
      : 0;

    await prisma.partnerCashbackPayment.upsert({
      where: { partnerId_month: { partnerId: params.partnerId, month: params.month } },
      create: {
        partnerId: params.partnerId,
        month: params.month,
        totalCashbackOwed: totalOwed,
        turnoverAmount,
        contractedRate,
        marginAmount,
        status: 'PAID',
        paidAt: new Date(),
        paidBy: params.adminUserId,
        notes: params.notes,
      },
      update: {
        status: 'PAID',
        paidAt: new Date(),
        paidBy: params.adminUserId,
        notes: params.notes,
        totalCashbackOwed: totalOwed,
        turnoverAmount,
        contractedRate,
        marginAmount,
      },
    });

    logger.info(`Admin ${params.adminUserId} marked cashback PAID for partner ${params.partnerId}, month ${params.month}`);
  }

  /**
   * Send a cashback payment reminder email to a partner.
   */
  async sendReminder(partnerId: string, month?: string): Promise<{ sent: boolean; reason?: string }> {
    const targetMonth = month || this.currentMonth();

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { businessName: true, email: true },
    });

    if (!partner) return { sent: false, reason: 'Partner not found' };
    if (!partner.email) return { sent: false, reason: 'Partner has no email address' };

    // Compute outstanding amount across every venue under this partner
    const [year, mon] = targetMonth.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);
    const agg = await prisma.stickerScan.aggregate({
      where: {
        status: ScanStatus.APPROVED,
        createdAt: { gte: monthStart, lt: monthEnd },
        venue: { partnerId },
      },
      _sum: { cashbackAmount: true },
    });

    const amount = agg._sum.cashbackAmount ?? 0;
    if (amount <= 0) return { sent: false, reason: 'No outstanding cashback for this month' };

    const result = await emailService.sendCashbackReminder(partner.email, {
      partnerName: partner.businessName,
      month: targetMonth,
      amount,
    });

    logger.info(`Cashback reminder ${result.success ? 'sent' : 'failed'} for partner ${partnerId}, month ${targetMonth}`);
    return { sent: result.success };
  }

  /**
   * Get subscriber-side cashback stats for admin dashboard cards (spec §3.1).
   * Returns: начислен (total accrued), одобрен (cleared), изчакващ (pending), изтичащ (expiring ≤14 days).
   */
  async getDashboardStats(): Promise<{
    totalAccrued: number;
    totalCleared: number;
    totalPending: number;
    expiringTotal: number;
  }> {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [accruedAgg, pendingAgg, clearedRows, expiringAgg] = await Promise.all([
      // начислен — sum of non-expired cashback entries (expired = forfeited, not a future liability)
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          type: 'CASHBACK_CREDIT',
          OR: [{ cashbackExpiresAt: null }, { cashbackExpiresAt: { gt: now } }],
        },
      }),
      // изчакващ — sum of entries still pending (matches deriveCashbackEntryStatus: PENDING|TRIAL_PENDING|PROCESSING|RISK_HOLD)
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { type: 'CASHBACK_CREDIT', status: { in: ['PENDING', 'TRIAL_PENDING', 'PROCESSING', 'RISK_HOLD'] } },
      }),
      // одобрен — COMPLETED entries not yet expired; we exclude paid-out ones later
      prisma.walletTransaction.findMany({
        where: {
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
          OR: [{ cashbackExpiresAt: null }, { cashbackExpiresAt: { gt: now } }],
        },
        select: { amount: true, walletId: true, createdAt: true },
      }),
      // изтичащ — cleared entries expiring within 14 days
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
          cashbackExpiresAt: { gt: now, lte: soonThreshold },
        },
      }),
    ]);

    // Subtract paid-out amounts from cleared total (entries created before last withdrawal per wallet)
    const walletIds = [...new Set(clearedRows.map(r => r.walletId))];
    const latestWithdrawals = walletIds.length
      ? await prisma.walletTransaction.findMany({
          where: { walletId: { in: walletIds }, type: 'WITHDRAWAL', status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          distinct: ['walletId'],
          select: { walletId: true, createdAt: true },
        })
      : [];
    const withdrawalMap = new Map(latestWithdrawals.map(w => [w.walletId, w.createdAt]));

    const totalCleared = clearedRows
      .filter(r => {
        const lastPaid = withdrawalMap.get(r.walletId);
        return !lastPaid || r.createdAt > lastPaid;
      })
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      totalAccrued: Math.round((accruedAgg._sum.amount ?? 0) * 100) / 100,
      totalCleared: Math.round(totalCleared * 100) / 100,
      totalPending: Math.round((pendingAgg._sum.amount ?? 0) * 100) / 100,
      expiringTotal: Math.round((expiringAgg._sum.amount ?? 0) * 100) / 100,
    };
  }

  /**
   * List all APPROVED sticker scans for a given (partnerId, year, month).
   * Used for reconciliation: confirms exactly which scans were included in a
   * partner's cashback payment period.
   *
   * Field names (`receipts`, `receiptCount`) are retained for frontend compatibility
   * but the rows come from StickerScan, not the retired Receipt submission flow.
   */
  async getReceiptsByPartnerMonth(params: {
    partnerId: string;
    month: string; // "YYYY-MM"
  }): Promise<{
    receipts: Array<{
      id: string;
      userId: string;
      totalAmount: number | null;
      cashbackAmount: number;
      merchantName: string | null;
      receiptDate: Date | null;
      reviewedAt: Date | null;
      reviewedBy: string | null;
    }>;
    receiptCount: number;
    totalCashbackOwed: number;
  }> {
    const [year, mon] = params.month.split('-').map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 1);

    const scans = await prisma.stickerScan.findMany({
      where: {
        status: ScanStatus.APPROVED,
        createdAt: { gte: monthStart, lt: monthEnd },
        venue: { partnerId: params.partnerId },
      },
      select: {
        id: true,
        userId: true,
        billAmount: true,
        verifiedAmount: true,
        cashbackAmount: true,
        processedAt: true,
        createdAt: true,
        venue: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const receipts = scans.map(s => ({
      id: s.id,
      userId: s.userId,
      totalAmount: s.verifiedAmount ?? s.billAmount ?? null,
      cashbackAmount: s.cashbackAmount,
      merchantName: s.venue?.name ?? null,
      receiptDate: s.createdAt,
      reviewedAt: s.processedAt,
      reviewedBy: null, // StickerScan doesn't track the approving admin — unlike Receipt.reviewedBy
    }));

    const totalCashbackOwed = receipts.reduce((sum, r) => sum + r.cashbackAmount, 0);

    return {
      receipts,
      receiptCount: receipts.length,
      totalCashbackOwed: Math.round(totalCashbackOwed * 100) / 100,
    };
  }

  // ── Cashback Rate Matrix Management ──────────────────────────────────────────

  /**
   * Get all cashback rate rows, newest first. Each row covers one discount step.
   */
  async getCashbackRates(): Promise<Array<{
    id: string;
    discountStep: number;
    basic: number;
    premium: number;
    effectiveFrom: Date;
    createdBy: string | null;
    notes: string | null;
    createdAt: Date;
  }>> {
    return prisma.cashbackRate.findMany({
      orderBy: [{ effectiveFrom: 'desc' }, { discountStep: 'asc' }],
    });
  }

  /**
   * The currently effective rate for every discount step (one row per step).
   * Returns hardcoded constants for any step with no DB entry.
   */
  async getCurrentRates(): Promise<Array<{
    discountStep: number;
    basic: number;
    premium: number;
    effectiveFrom: Date | null;
    source: 'db' | 'default';
  }>> {
    const now = new Date();
    const dbRates = await prisma.cashbackRate.findMany({
      where: { effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'desc' },
    });

    const rateMap = new Map<number, { basic: number; premium: number; effectiveFrom: Date }>();
    for (const rate of dbRates) {
      if (!rateMap.has(rate.discountStep)) {
        rateMap.set(rate.discountStep, {
          basic: rate.basic,
          premium: rate.premium,
          effectiveFrom: rate.effectiveFrom,
        });
      }
    }

    return CASHBACK_MATRIX_STEPS.map(step => {
      const db = rateMap.get(step);
      if (db) {
        return { discountStep: step, basic: db.basic, premium: db.premium, effectiveFrom: db.effectiveFrom, source: 'db' as const };
      }
      const defaults = CASHBACK_MATRIX[step];
      return { discountStep: step, basic: defaults.basic, premium: defaults.premium, effectiveFrom: null, source: 'default' as const };
    });
  }

  /**
   * Create a new rate set covering all discount steps.
   * All rows share the same effectiveFrom so they form one versioned "snapshot".
   *
   * @param rates  Array of { discountStep, basic, premium } — must cover all 5 steps.
   * @param params Admin metadata.
   */
  async createCashbackRates(params: {
    rates: Array<{ discountStep: number; basic: number; premium: number }>;
    effectiveFrom?: Date;
    adminUserId: string;
    notes?: string;
  }): Promise<void> {
    const allowedSteps = new Set(CASHBACK_MATRIX_STEPS as readonly number[]);
    const seenSteps = new Set<number>();
    for (const r of params.rates) {
      if (typeof r.discountStep !== 'number' || typeof r.basic !== 'number' || typeof r.premium !== 'number') {
        throw new Error(`discountStep, basic, and premium must all be numbers`);
      }
      if (!allowedSteps.has(r.discountStep)) {
        throw new Error(`Invalid discount step: ${r.discountStep}. Allowed: ${[...allowedSteps].join(', ')}`);
      }
      if (seenSteps.has(r.discountStep)) {
        throw new Error(`Duplicate discountStep ${r.discountStep} in input — each step must appear once`);
      }
      seenSteps.add(r.discountStep);
      if (r.basic < 0 || r.premium < 0 || r.basic > 100 || r.premium > 100) {
        throw new Error(`Cashback percentages must be between 0 and 100`);
      }
    }

    // All steps must be supplied so the snapshot is self-contained.
    // Partial updates would mix DB-controlled and hardcoded-fallback rates in the same
    // "version", making it impossible to reason about which rates are currently active.
    const missingSteps = [...allowedSteps].filter(s => !seenSteps.has(s));
    if (missingSteps.length > 0) {
      throw new Error(`Missing discount steps: ${missingSteps.join(', ')}. All ${allowedSteps.size} steps must be provided to form a complete snapshot`);
    }

    const effectiveFrom = params.effectiveFrom ?? new Date();

    await prisma.cashbackRate.createMany({
      data: params.rates.map(r => ({
        discountStep: r.discountStep,
        basic: r.basic,
        premium: r.premium,
        effectiveFrom,
        createdBy: params.adminUserId,
        notes: params.notes ?? null,
      })),
    });

    logger.info(`Admin ${params.adminUserId} created cashback rates effective ${effectiveFrom.toISOString()} (${params.rates.length} steps)`);
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

export const adminCashbackService = new AdminCashbackService();

// ─── Subscriber cashback entries (spec §4.4) ─────────────────────────────────

export type CashbackEntryStatus = 'Pending' | 'Cleared' | 'Locked' | 'Paid' | 'Expired';

// Spec §4.4 — derived 5-state lifecycle. Single source of truth: any consumer
// rendering a cashback entry's lifecycle state must call this helper. Inlining
// the rules elsewhere will silently drift the moment a status mapping changes.
export function deriveCashbackEntryStatus(
  entry: { status: string; cashbackExpiresAt: Date | null; createdAt: Date; cashbackPaidAt?: Date | null },
  latestWithdrawalAt: Date | null,
  now: Date,
): CashbackEntryStatus {
  // Explicitly marked as paid by admin (individual entry Locked→Paid action)
  if (entry.cashbackPaidAt) return 'Paid';
  if (entry.status === 'PENDING' || entry.status === 'TRIAL_PENDING' || entry.status === 'PROCESSING' || entry.status === 'RISK_HOLD') {
    return 'Pending';
  }
  if (entry.status === 'CANCELLED') {
    // Nightly expiry job marks expired entries CANCELLED; trial voids also use CANCELLED.
    return entry.cashbackExpiresAt && entry.cashbackExpiresAt <= now ? 'Expired' : 'Locked';
  }
  if (entry.status === 'ANNULLED' || entry.status === 'FAILED') return 'Locked';
  if (entry.cashbackExpiresAt && entry.cashbackExpiresAt <= now) return 'Expired';
  if (latestWithdrawalAt && entry.createdAt <= latestWithdrawalAt) return 'Paid';
  return 'Cleared';
}

export interface SubscriberCashbackEntry {
  id: string;
  amount: number;
  status: CashbackEntryStatus;
  rawStatus: string;
  cashbackExpiresAt: Date | null;
  daysUntilExpiry: number | null;
  description: string | null;
  createdAt: Date;
  receipt: { id: string; totalAmount: number | null; merchantName: string | null } | null;
}

export interface SubscriberCashbackResult {
  data: SubscriberCashbackEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function getSubscriberCashbackEntries(
  userId: string,
  page: number,
  limit: number,
): Promise<SubscriberCashbackResult> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!wallet) {
    const err = Object.assign(new Error('Subscriber wallet not found'), { statusCode: 404 });
    throw err;
  }

  const [entries, total, latestWithdrawal] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, type: 'CASHBACK_CREDIT' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        amount: true,
        status: true,
        cashbackExpiresAt: true,
        cashbackPaidAt: true,
        description: true,
        createdAt: true,
        receiptId: true,
        receipt: {
          select: { id: true, totalAmount: true, merchantName: true },
        },
      },
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id, type: 'CASHBACK_CREDIT' } }),
    // Most recent completed payout — any cleared entry before this date was paid out
    prisma.walletTransaction.findFirst({
      where: { walletId: wallet.id, type: 'WITHDRAWAL', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const now = new Date();

  const data: SubscriberCashbackEntry[] = entries.map((e) => {
    const status = deriveCashbackEntryStatus(e, latestWithdrawal?.createdAt ?? null, now);

    const daysUntilExpiry = e.cashbackExpiresAt
      ? Math.max(0, Math.ceil((e.cashbackExpiresAt.getTime() - now.getTime()) / 86_400_000))
      : null;

    return {
      id: e.id,
      amount: e.amount,
      status,
      rawStatus: e.status,
      cashbackExpiresAt: e.cashbackExpiresAt,
      daysUntilExpiry,
      description: e.description,
      createdAt: e.createdAt,
      receipt: e.receipt ?? null,
    };
  });

  return { data, total, page, limit };
}

// ------------------------------------------------------------------
// Global cashback entries listing (spec §4.4 — all 5 states across all users).
// Resolves status per-entry using each user's latest completed withdrawal.
// ------------------------------------------------------------------
export interface GlobalCashbackEntry extends SubscriberCashbackEntry {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

type WTWhere = NonNullable<Parameters<typeof prisma.walletTransaction.findMany>[0]>['where'];

// Build a Prisma WHERE clause for the spec §4.4 derived state.
// For Paid/Cleared we need to know each wallet's most recent completed withdrawal,
// which is fetched up-front so the result can be expressed as a pure DB filter.
async function buildStateWhere(
  state: CashbackEntryStatus,
  now: Date,
): Promise<WTWhere> {
  const PENDING_RAW = ['PENDING', 'TRIAL_PENDING', 'PROCESSING', 'RISK_HOLD'] as const;
  const NEVER_PAID_RAW = [...PENDING_RAW, 'ANNULLED', 'FAILED'] as const;
  const notExpired: WTWhere = {
    OR: [{ cashbackExpiresAt: null }, { cashbackExpiresAt: { gt: now } }],
  };
  const expired: WTWhere = { cashbackExpiresAt: { lte: now } };

  switch (state) {
    case 'Pending':
      return { status: { in: [...PENDING_RAW] } };

    case 'Locked':
      // CANCELLED + not-yet-expired, OR ANNULLED/FAILED (regardless of expiry).
      // Exclude cashbackPaidAt-marked entries — deriveCashbackEntryStatus returns 'Paid' for those first.
      return {
        AND: [
          { cashbackPaidAt: null },
          {
            OR: [
              { AND: [{ status: 'CANCELLED' as const }, notExpired] },
              { status: { in: ['ANNULLED', 'FAILED'] as const } },
            ],
          },
        ],
      };

    case 'Expired':
      // Anything expired, except statuses that map elsewhere (Pending/Locked-by-status).
      // Exclude cashbackPaidAt-marked entries — deriveCashbackEntryStatus returns 'Paid' for those first.
      return {
        AND: [
          { cashbackPaidAt: null },
          expired,
          { status: { notIn: [...PENDING_RAW, 'ANNULLED', 'FAILED'] } },
        ],
      };

    case 'Paid':
    case 'Cleared': {
      // Paid/Cleared depend on the per-wallet latest completed WITHDRAWAL,
      // OR on the explicit cashbackPaidAt admin mark (spec §4.4 Locked→Paid).
      const lastPayouts = await prisma.walletTransaction.findMany({
        where: { type: 'WITHDRAWAL', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        distinct: ['walletId'],
        select: { walletId: true, createdAt: true },
      });

      if (state === 'Paid') {
        // Entry is Paid if explicitly marked (cashbackPaidAt != null)
        // OR if its wallet had a completed withdrawal and entry predates it.
        const payoutOr: WTWhere[] = [{ cashbackPaidAt: { not: null } }];
        if (lastPayouts.length > 0) {
          payoutOr.push({
            AND: [
              { status: { notIn: [...NEVER_PAID_RAW, 'CANCELLED'] } },
              notExpired,
              {
                OR: lastPayouts.map((p) => ({
                  walletId: p.walletId,
                  createdAt: { lte: p.createdAt },
                })),
              },
            ],
          });
        }
        return { OR: payoutOr };
      }

      // Cleared — not explicitly paid and not covered by a wallet withdrawal
      const baseCleared: WTWhere = {
        AND: [
          { cashbackPaidAt: null },
          { status: { notIn: [...NEVER_PAID_RAW, 'CANCELLED'] } },
          notExpired,
        ],
      };
      if (lastPayouts.length === 0) return baseCleared;
      return {
        AND: [
          baseCleared,
          {
            OR: [
              { walletId: { notIn: lastPayouts.map((p) => p.walletId) } },
              ...lastPayouts.map((p) => ({
                walletId: p.walletId,
                createdAt: { gt: p.createdAt },
              })),
            ],
          },
        ],
      };
    }
  }
}

export async function getAllCashbackEntries(
  page: number,
  limit: number,
  statusFilter?: CashbackEntryStatus,
  search?: string,
  dateFrom?: Date,
  dateTo?: Date,
): Promise<{ data: GlobalCashbackEntry[]; total: number; page: number; limit: number }> {
  // Spec §4.4: 5 derived states (Pending / Cleared / Locked / Paid / Expired).
  // We push the filter to Prisma so true DB pagination + count work for all states,
  // including Paid/Cleared which need the per-wallet latest completed withdrawal.
  const now = new Date();

  // Build user search sub-filter (join on wallet → user)
  const userWhere = search
    ? {
        wallet: {
          user: {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        },
      }
    : undefined;

  const dateWhere: WTWhere = {};
  if (dateFrom || dateTo) {
    dateWhere.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const baseWhere: WTWhere = {
    type: 'CASHBACK_CREDIT',
    ...userWhere,
    ...dateWhere,
  };
  const where: WTWhere = statusFilter
    ? { AND: [baseWhere, await buildStateWhere(statusFilter, now)] }
    : baseWhere;

  const [entries, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        amount: true,
        status: true,
        cashbackExpiresAt: true,
        cashbackPaidAt: true,
        description: true,
        createdAt: true,
        wallet: {
          select: {
            userId: true,
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        receipt: {
          select: { id: true, totalAmount: true, merchantName: true },
        },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  // We still need lastPaidByUser to label each row (Paid vs. Cleared) for the
  // unfiltered case, since rows of any state can be returned together.
  const userIds = Array.from(new Set(entries.map((e) => e.wallet.userId)));
  const latestWithdrawals = userIds.length
    ? await prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: { in: userIds } },
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['walletId'],
        select: { wallet: { select: { userId: true } }, createdAt: true },
      })
    : [];
  const lastPaidByUser = new Map<string, Date>();
  for (const w of latestWithdrawals) {
    lastPaidByUser.set(w.wallet.userId, w.createdAt);
  }

  const data: GlobalCashbackEntry[] = entries.map((e) => {
    const status = deriveCashbackEntryStatus(
      { ...e, cashbackPaidAt: (e as any).cashbackPaidAt ?? null },
      lastPaidByUser.get(e.wallet.userId) ?? null,
      now,
    );

    const daysUntilExpiry = e.cashbackExpiresAt
      ? Math.max(0, Math.ceil((e.cashbackExpiresAt.getTime() - now.getTime()) / 86_400_000))
      : null;

    return {
      id: e.id,
      amount: e.amount,
      status,
      rawStatus: e.status,
      cashbackExpiresAt: e.cashbackExpiresAt,
      daysUntilExpiry,
      description: e.description,
      createdAt: e.createdAt,
      receipt: e.receipt ?? null,
      user: e.wallet.user,
    };
  });

  return { data, total, page, limit };
}

// ─── Entry-level admin actions (spec §4.4) ────────────────────────────────────

/**
 * Approve a Pending cashback entry → Cleared (PENDING/TRIAL_PENDING → COMPLETED).
 */
export async function approveEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: { id: true, type: true, status: true, cashbackExpiresAt: true, createdAt: true },
  });
  if (!entry) throw Object.assign(new Error('Entry not found'), { statusCode: 404 });
  if (entry.type !== 'CASHBACK_CREDIT') throw Object.assign(new Error('Not a cashback entry'), { statusCode: 400 });
  if (!['PENDING', 'TRIAL_PENDING', 'PROCESSING', 'RISK_HOLD'].includes(entry.status)) {
    throw Object.assign(new Error(`Cannot approve entry with status ${entry.status}`), { statusCode: 400 });
  }
  const now = new Date();
  // Use existing expiry only if it's still in the future; otherwise grant 60 days from now.
  // Computing from createdAt would produce a past expiry for entries that have been PENDING >60 days,
  // causing the row to immediately resolve as Expired after approval.
  const cashbackExpiresAt = entry.cashbackExpiresAt && entry.cashbackExpiresAt > now
    ? entry.cashbackExpiresAt
    : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  await prisma.walletTransaction.update({
    where: { id: entryId },
    data: { status: 'COMPLETED', cashbackExpiresAt },
  });
  logger.info(`Admin ${adminUserId} approved cashback entry ${entryId}`);
}

/**
 * Lock a Cleared cashback entry (COMPLETED → CANCELLED with future expiresAt → shows as Locked).
 * Rejects entries in "Paid" derived state (COMPLETED but createdAt ≤ wallet's latest payout).
 */
export async function lockEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: { id: true, type: true, status: true, cashbackExpiresAt: true, createdAt: true, walletId: true },
  });
  if (!entry) throw Object.assign(new Error('Entry not found'), { statusCode: 404 });
  if (entry.type !== 'CASHBACK_CREDIT') throw Object.assign(new Error('Not a cashback entry'), { statusCode: 400 });
  if (entry.status !== 'COMPLETED') {
    throw Object.assign(new Error(`Cannot lock entry with status ${entry.status}`), { statusCode: 400 });
  }
  // Guard against locking a "Paid" entry — one that predates the wallet's latest completed payout.
  // Only "Cleared" (COMPLETED, not yet covered by a payout) entries may be locked.
  const latestWithdrawal = await prisma.walletTransaction.findFirst({
    where: { walletId: entry.walletId, type: 'WITHDRAWAL', status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latestWithdrawal && entry.createdAt <= latestWithdrawal.createdAt) {
    throw Object.assign(new Error('Cannot lock a paid-out entry'), { statusCode: 400 });
  }
  const now = new Date();
  const keepExpiresAt = entry.cashbackExpiresAt && entry.cashbackExpiresAt > now
    ? entry.cashbackExpiresAt
    : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.walletTransaction.update({
    where: { id: entryId },
    data: { status: 'CANCELLED', cashbackExpiresAt: keepExpiresAt },
  });
  logger.info(`Admin ${adminUserId} locked cashback entry ${entryId}`);
}

/**
 * Force-expire a cashback entry (cashbackExpiresAt = now, CANCELLED → Expired).
 */
export async function expireEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: { id: true, type: true, status: true },
  });
  if (!entry) throw Object.assign(new Error('Entry not found'), { statusCode: 404 });
  if (entry.type !== 'CASHBACK_CREDIT') throw Object.assign(new Error('Not a cashback entry'), { statusCode: 400 });
  if (['ANNULLED', 'FAILED'].includes(entry.status)) {
    throw Object.assign(new Error(`Cannot expire entry with status ${entry.status}`), { statusCode: 400 });
  }
  await prisma.walletTransaction.update({
    where: { id: entryId },
    data: { status: 'CANCELLED', cashbackExpiresAt: new Date() },
  });
  logger.info(`Admin ${adminUserId} force-expired cashback entry ${entryId}`);
}

/**
 * Mark a Locked cashback entry as Paid (spec §4.4 Locked → Paid admin action).
 * Sets cashbackPaidAt = now so deriveCashbackEntryStatus returns 'Paid'.
 */
export async function payEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: { id: true, type: true, status: true, cashbackExpiresAt: true, cashbackPaidAt: true },
  });
  if (!entry) throw Object.assign(new Error('Entry not found'), { statusCode: 404 });
  if (entry.type !== 'CASHBACK_CREDIT') throw Object.assign(new Error('Not a cashback entry'), { statusCode: 400 });
  if (entry.cashbackPaidAt) throw Object.assign(new Error('Entry is already marked as paid'), { statusCode: 400 });
  const now = new Date();
  // Must be derived-Locked: CANCELLED (with future expiresAt), ANNULLED, or FAILED.
  // ANNULLED/FAILED are permanently Locked (no expiry check needed).
  const LOCKED_STATUSES = ['CANCELLED', 'ANNULLED', 'FAILED'] as const;
  if (!(LOCKED_STATUSES as readonly string[]).includes(entry.status)) {
    throw Object.assign(new Error(`Only Locked entries can be marked as paid (current status: ${entry.status})`), { statusCode: 400 });
  }
  // For CANCELLED: verify it hasn't already expired (expired CANCELLED = Expired, not Locked)
  if (entry.status === 'CANCELLED' && (!entry.cashbackExpiresAt || entry.cashbackExpiresAt <= now)) {
    throw Object.assign(new Error('Entry has already expired and cannot be marked as paid'), { statusCode: 400 });
  }
  await prisma.walletTransaction.update({
    where: { id: entryId },
    data: { cashbackPaidAt: now },
  });
  logger.info(`Admin ${adminUserId} marked cashback entry ${entryId} as paid`);
}

/**
 * Backfill cashbackExpiresAt = createdAt + 60 days for pre-migration CASHBACK_CREDIT rows.
 * Idempotent — only touches rows where cashbackExpiresAt IS NULL.
 */
export async function backfillCashbackExpiry(): Promise<number> {
  const rows = await prisma.walletTransaction.findMany({
    where: { type: 'CASHBACK_CREDIT', cashbackExpiresAt: null },
    select: { id: true, createdAt: true },
  });
  if (rows.length === 0) return 0;
  await Promise.all(
    rows.map(r =>
      prisma.walletTransaction.update({
        where: { id: r.id },
        data: { cashbackExpiresAt: new Date(r.createdAt.getTime() + 60 * 24 * 60 * 60 * 1000) },
      }),
    ),
  );
  logger.info(`Backfilled cashbackExpiresAt for ${rows.length} CASHBACK_CREDIT entries`);
  return rows.length;
}
