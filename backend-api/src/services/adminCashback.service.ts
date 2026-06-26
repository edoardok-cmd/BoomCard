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

import { ScanStatus, CashbackEntryStatus as PrismaCashbackEntryStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';
import { emailService } from './email.service';
import { CASHBACK_MATRIX, CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';
import { cashbackLifecycleService, assertVoidReasonCategory } from './cashbackLifecycle.service';
import { resolvePayoutEligibility } from './payoutEligibility.service';
import { writeAudit } from '../middleware/audit.middleware';
import { getSystemSettingInt } from '../utils/systemSettings';

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

    // ── Period-lock / PAID-freeze guards ─────────────────────────────────────
    // This path writes the same PartnerCashbackPayment table as the finance
    // invoice routes (adminFinance.routes.ts) and recomputes financial totals on
    // every call. It must enforce the same two guards the finance module enforces
    // so a frozen period cannot be silently rewritten through here:
    //   1. ReportingPeriod LOCKED/INVOICED → no data changes allowed (mirrors
    //      adminFinance.routes.ts isPeriodLocked()).
    //   2. An already-PAID PartnerCashbackPayment is frozen (mirrors the
    //      "Cannot change status of a paid invoice" guard on PATCH .../status).
    const period = await prisma.reportingPeriod.findUnique({
      where: { month: params.month },
      select: { status: true },
    });
    if (period?.status === 'LOCKED' || period?.status === 'INVOICED') {
      throw new AppError(`Billing period ${params.month} is locked or invoiced — no changes allowed.`, 409);
    }

    const existingPayment = await prisma.partnerCashbackPayment.findUnique({
      where: { partnerId_month: { partnerId: params.partnerId, month: params.month } },
      select: { status: true },
    });
    if (existingPayment?.status === 'PAID') {
      throw new AppError(`Cashback for ${params.month} is already marked as paid — its financials are frozen.`, 400);
    }

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
   * Get subscriber-side cashback stats for admin dashboard cards (spec §3.1 + §4.4).
   * Returns: начислен (total accrued), одобрен (cleared), изчакващ (pending),
   *          изтичащ (expiring ≤14 days), заключен (locked), платен (paid via admin action).
   */
  async getDashboardStats(): Promise<{
    totalAccrued: number;
    totalCleared: number;
    totalPending: number;
    expiringTotal: number;
    totalLocked: number;
    totalPaid: number;
    totalExpired: number;
    totalVoided: number;
  }> {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Use buildStateWhere for each lifecycle state so the per-tile sums are
    // mutually exclusive and exactly partition CASHBACK_CREDIT entries — same
    // assignment that deriveCashbackEntryStatus would make per-row.
    const [
      pendingWhere,
      clearedWhere,
      lockedWhere,
      paidWhere,
      expiredWhere,
      voidedWhere,
    ] = await Promise.all([
      buildStateWhere('Pending', now),
      buildStateWhere('Cleared', now),
      buildStateWhere('Locked', now),
      buildStateWhere('Paid', now),
      buildStateWhere('Expired', now),
      buildStateWhere('Voided', now),
    ]);

    const baseCashbackWhere = { type: 'CASHBACK_CREDIT' as const };
    const wrapAnd = (extra: WTWhere): WTWhere => ({ AND: [baseCashbackWhere, extra] });

    // Split into two Promise.all batches: TypeScript's tuple inference for
    // Promise.all can lose the named-tuple shape beyond ~7 elements when each
    // element resolves to a Prisma aggregate (deeply generic), so we group
    // them to keep each batch within the inferable window.
    const [accruedAgg, pendingAgg, clearedAgg, expiringAgg] = await Promise.all([
      // "Начислен" (total accrued) reflects what was actually credited to users.
      // Ghost VOIDED rows (status=ANNULLED, cashbackStatus=VOIDED, balanceBefore==balanceAfter)
      // never reached a wallet balance, so including them would overstate accrued cashback.
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          AND: [
            baseCashbackWhere,
            { OR: [{ cashbackStatus: null }, { cashbackStatus: { not: 'VOIDED' } }] },
          ],
        },
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: wrapAnd(pendingWhere),
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: wrapAnd(clearedWhere),
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          AND: [
            baseCashbackWhere,
            clearedWhere,
            { cashbackExpiresAt: { gt: now, lte: soonThreshold } },
          ],
        },
      }),
    ]);
    const [lockedAgg, paidAgg, expiredAgg, voidedAgg] = await Promise.all([
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: wrapAnd(lockedWhere),
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: wrapAnd(paidWhere),
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: wrapAnd(expiredWhere),
      }),
      prisma.walletTransaction.aggregate({
        _sum: { amount: true },
        where: wrapAnd(voidedWhere),
      }),
    ]);

    return {
      totalAccrued: Math.round((accruedAgg._sum.amount ?? 0) * 100) / 100,
      totalCleared: Math.round((clearedAgg._sum.amount ?? 0) * 100) / 100,
      totalPending: Math.round((pendingAgg._sum.amount ?? 0) * 100) / 100,
      expiringTotal: Math.round((expiringAgg._sum.amount ?? 0) * 100) / 100,
      totalLocked: Math.round((lockedAgg._sum.amount ?? 0) * 100) / 100,
      totalPaid: Math.round((paidAgg._sum.amount ?? 0) * 100) / 100,
      totalExpired: Math.round((expiredAgg._sum.amount ?? 0) * 100) / 100,
      totalVoided: Math.round((voidedAgg._sum.amount ?? 0) * 100) / 100,
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
      cashbackReversed: boolean;
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
        // Audit-fix [X.2]: join wallet transactions so we can detect CLEARED+VOIDED
        // round-trips. Without this, a scan whose cashback was reversed after approval
        // still appears in the reconciliation total, overstating what is owed.
        walletTransactions: {
          where: { type: 'CASHBACK_CREDIT' },
          select: { cashbackStatus: true, amount: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const receipts = scans.map(s => {
      // A scan's cashback is considered reversed if every CASHBACK_CREDIT
      // wallet transaction for it is VOIDED (meaning the balance reversal
      // already happened). Scans with no wallet transactions are included
      // (edge case: approval without credit — count as owed).
      const credits = s.walletTransactions;
      const cashbackReversed =
        credits.length > 0 && credits.every((t) => t.cashbackStatus === 'VOIDED');

      // Use the effective (non-voided) cashback amount from wallet transactions
      // when available; fall back to StickerScan.cashbackAmount for legacy rows
      // that predate the WalletTransaction join.
      const effectiveCashback = cashbackReversed
        ? 0
        : credits.length > 0
          ? credits
              .filter((t) => t.cashbackStatus !== 'VOIDED')
              .reduce((sum, t) => sum + (t.amount ?? 0), 0)
          : s.cashbackAmount;

      return {
        id: s.id,
        userId: s.userId,
        totalAmount: s.verifiedAmount ?? s.billAmount ?? null,
        cashbackAmount: effectiveCashback,
        merchantName: s.venue?.name ?? null,
        receiptDate: s.createdAt,
        reviewedAt: s.processedAt,
        reviewedBy: null, // StickerScan doesn't track the approving admin — unlike Receipt.reviewedBy
        cashbackReversed,
      };
    });

    const totalCashbackOwed = receipts.reduce((sum, r) => sum + r.cashbackAmount, 0);

    return {
      receipts,
      receiptCount: receipts.length,
      totalCashbackOwed: Math.round(totalCashbackOwed * 100) / 100,
    };
  }

  // ── Cashback Rate Matrix Management ──────────────────────────────────────────

  private async resolveAdminNames(ids: (string | null | undefined)[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))] as string[];
    if (uniqueIds.length === 0) return new Map<string, { name: string | null; email: string | null }>();
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((u) => [
        u.id,
        {
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
          email: u.email,
        },
      ])
    );
  }

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
    createdByName: string | null;
    createdByEmail: string | null;
    notes: string | null;
    createdAt: Date;
  }>> {
    const rows = await prisma.cashbackRate.findMany({
      where: { discountStep: { in: [...CASHBACK_MATRIX_STEPS] } },
      orderBy: [{ effectiveFrom: 'desc' }, { discountStep: 'asc' }],
    });
    const adminMap = await this.resolveAdminNames(rows.map((r) => r.createdBy));
    return rows.map((r) => {
      const admin = r.createdBy ? adminMap.get(r.createdBy) : undefined;
      return { ...r, createdByName: admin?.name ?? null, createdByEmail: admin?.email ?? null };
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
    createdBy: string | null;
    createdByName: string | null;
    createdByEmail: string | null;
    source: 'db' | 'default';
  }>> {
    const now = new Date();
    const dbRates = await prisma.cashbackRate.findMany({
      where: { effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'desc' },
    });

    const rateMap = new Map<number, { basic: number; premium: number; effectiveFrom: Date; createdBy: string | null }>();
    for (const rate of dbRates) {
      if (!rateMap.has(rate.discountStep)) {
        rateMap.set(rate.discountStep, {
          basic: rate.basic,
          premium: rate.premium,
          effectiveFrom: rate.effectiveFrom,
          createdBy: rate.createdBy,
        });
      }
    }

    const allCreatedBy = [...rateMap.values()].map((v) => v.createdBy);
    const adminMap = await this.resolveAdminNames(allCreatedBy);

    return CASHBACK_MATRIX_STEPS.map(step => {
      const db = rateMap.get(step);
      if (db) {
        const admin = db.createdBy ? adminMap.get(db.createdBy) : undefined;
        return {
          discountStep: step,
          basic: db.basic,
          premium: db.premium,
          effectiveFrom: db.effectiveFrom,
          createdBy: db.createdBy,
          createdByName: admin?.name ?? null,
          createdByEmail: admin?.email ?? null,
          source: 'db' as const,
        };
      }
      const defaults = CASHBACK_MATRIX[step];
      return {
        discountStep: step,
        basic: defaults.basic,
        premium: defaults.premium,
        effectiveFrom: null,
        createdBy: null,
        createdByName: null,
        createdByEmail: null,
        source: 'default' as const,
      };
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
        throw new AppError(`discountStep, basic, and premium must all be numbers`, 400);
      }
      if (!allowedSteps.has(r.discountStep)) {
        throw new AppError(`Invalid discount step: ${r.discountStep}. Allowed: ${[...allowedSteps].join(', ')}`, 400);
      }
      if (seenSteps.has(r.discountStep)) {
        throw new AppError(`Duplicate discountStep ${r.discountStep} in input — each step must appear once`, 400);
      }
      seenSteps.add(r.discountStep);
      if (r.basic < 0 || r.premium < 0 || r.basic > 100 || r.premium > 100) {
        throw new AppError(`Cashback percentages must be between 0 and 100`, 400);
      }
      if (r.basic > r.discountStep || r.premium > r.discountStep) {
        throw new AppError(`Step ${r.discountStep}%: cashback cannot exceed the partner discount — margin would be negative`, 400);
      }
    }

    // All steps must be supplied so the snapshot is self-contained.
    // Partial updates would mix DB-controlled and hardcoded-fallback rates in the same
    // "version", making it impossible to reason about which rates are currently active.
    const missingSteps = [...allowedSteps].filter(s => !seenSteps.has(s));
    if (missingSteps.length > 0) {
      throw new AppError(`Missing discount steps: ${missingSteps.join(', ')}. All ${allowedSteps.size} steps must be provided to form a complete snapshot`, 400);
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

export type CashbackEntryStatus = 'Pending' | 'Cleared' | 'Locked' | 'Paid' | 'Expired' | 'Voided' | 'TrialPending';

// Spec §4.4 — derived 6-state lifecycle. Single source of truth: any consumer
// rendering a cashback entry's lifecycle state must call this helper. Inlining
// the rules elsewhere will silently drift the moment a status mapping changes.
//
// `cashbackStatus` (Prisma enum column) is the authoritative new-world signal,
// written by cashbackLifecycleService. Fall back to the raw-status derivation
// for legacy rows that predate the lifecycle service.
export function deriveCashbackEntryStatus(
  entry: {
    status: string;
    cashbackExpiresAt: Date | null;
    createdAt: Date;
    cashbackPaidAt?: Date | null;
    cashbackStatus?: string | null;
  },
  latestWithdrawalAt: Date | null,
  now: Date,
): CashbackEntryStatus {
  // Authoritative: lifecycle service has written an explicit status.
  if (entry.cashbackStatus) {
    const cs = entry.cashbackStatus;
    if (cs === 'TRIAL_PENDING') return 'TrialPending';
    if (cs === 'VOIDED') return 'Voided';
    if (cs === 'PAID') return 'Paid';
    if (cs === 'EXPIRED') return 'Expired';
    if (cs === 'LOCKED') return 'Locked';
    if (cs === 'CLEARED') return 'Cleared';
    if (cs === 'PENDING') return 'Pending';
  }
  // Legacy fallback for rows without cashbackStatus set.
  if (entry.cashbackPaidAt) return 'Paid';
  if (entry.status === 'TRIAL_PENDING') return 'TrialPending';
  if (entry.status === 'PENDING' || entry.status === 'PROCESSING' || entry.status === 'RISK_HOLD') {
    return 'Pending';
  }
  if (entry.status === 'CANCELLED') {
    // Nightly expiry job marks expired entries CANCELLED; trial voids also use CANCELLED.
    return entry.cashbackExpiresAt && entry.cashbackExpiresAt <= now ? 'Expired' : 'Locked';
  }
  if (entry.status === 'ANNULLED') return 'Voided';
  if (entry.status === 'FAILED') return 'Locked';
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
  voidedReason: string | null;
  voidedAt: Date | null;
  receipt: { id: string; totalAmount: number | null; merchantName: string | null } | null;
  partner: { id: string; businessName: string } | null;
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
    throw new AppError('Subscriber wallet not found', 404);
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
        cashbackStatus: true,
        voidedAt: true,
        voidedReason: true,
        description: true,
        createdAt: true,
        receipt: {
          select: {
            id: true,
            totalAmount: true,
            merchantName: true,
            venue: { select: { partner: { select: { id: true, businessName: true } } } },
          },
        },
        stickerScan: {
          select: {
            venue: { select: { partner: { select: { id: true, businessName: true } } } },
          },
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

    // Do not show a positive countdown for entries that are already Expired —
    // cashbackExpiresAt is preserved by expireEntry (Fix 6) as historical context,
    // so it may still be in the future for force-expired entries. Using the
    // authoritative derived `status` here prevents the UI from showing
    // e.g. "Expired — 30 days remaining", which is contradictory.
    const daysUntilExpiry = (e.cashbackExpiresAt && status !== 'Expired')
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
      voidedReason: e.voidedReason ?? null,
      voidedAt: e.voidedAt ?? null,
      receipt: e.receipt
        ? { id: e.receipt.id, totalAmount: e.receipt.totalAmount, merchantName: e.receipt.merchantName }
        : null,
      partner: e.receipt?.venue?.partner ?? e.stickerScan?.venue?.partner ?? null,
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
    riskScore: number;
  };
  clearedAt: Date | null;
  specRiskLevel: string | null;
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

  // TrialPending — wallet rows in the TRIAL_PENDING status (trial-period cashback
  // that is resolved by the scheduler at trial end, not by the 60-day expiry rule).
  if (state === 'TrialPending') {
    return { status: 'TRIAL_PENDING' as const };
  }

  // Voided is the only state that ONLY exists via the new lifecycle column.
  // No legacy fallback — pre-lifecycle rows can never be Voided.
  if (state === 'Voided') {
    return { cashbackStatus: 'VOIDED' as const };
  }

  // For the other 6 states, prefer cashbackStatus when set and fall back to
  // the legacy raw-status derivation so old rows still partition correctly.
  // Two sources of truth per state:
  //   (a) NEW: lifecycle column `cashbackStatus` is set (post-v1.1 writes)
  //   (b) LEGACY: cashbackStatus is null — fall back to raw-status derivation
  // OR the two so old rows continue to partition correctly during migration.
  // Legacy branches require cashbackStatus IS NULL so a row that was later
  // voided via the lifecycle service doesn't double-count under its legacy bucket.
  const legacyOnly: WTWhere = { cashbackStatus: null };
  const newWorldStateUpper = state.toUpperCase() as 'PENDING' | 'CLEARED' | 'LOCKED' | 'PAID' | 'EXPIRED';
  const newWorld: WTWhere = { cashbackStatus: newWorldStateUpper };

  switch (state) {
    case 'Pending': {
      const legacy: WTWhere = {
        AND: [legacyOnly, { cashbackPaidAt: null }, { status: { in: [...PENDING_RAW] } }],
      };
      return { OR: [newWorld, legacy] };
    }

    case 'Locked': {
      const legacy: WTWhere = {
        AND: [
          legacyOnly,
          { cashbackPaidAt: null },
          {
            OR: [
              { AND: [{ status: 'CANCELLED' as const }, notExpired] },
              { status: { in: ['ANNULLED', 'FAILED'] as const } },
            ],
          },
        ],
      };
      return { OR: [newWorld, legacy] };
    }

    case 'Expired': {
      const legacy: WTWhere = {
        AND: [
          legacyOnly,
          { cashbackPaidAt: null },
          expired,
          { status: { notIn: [...PENDING_RAW, 'ANNULLED', 'FAILED'] } },
        ],
      };
      return { OR: [newWorld, legacy] };
    }

    case 'Paid':
    case 'Cleared': {
      const lastPayouts = await prisma.walletTransaction.findMany({
        where: { type: 'WITHDRAWAL', status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        distinct: ['walletId'],
        select: { walletId: true, createdAt: true },
      });

      if (state === 'Paid') {
        const payoutOr: WTWhere[] = [{ AND: [legacyOnly, { cashbackPaidAt: { not: null } }] }];
        if (lastPayouts.length > 0) {
          payoutOr.push({
            AND: [
              legacyOnly,
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
        return { OR: [newWorld, ...payoutOr] };
      }

      // Cleared (legacy): not explicitly paid and not covered by a wallet withdrawal
      const baseCleared: WTWhere = {
        AND: [
          legacyOnly,
          { cashbackPaidAt: null },
          { status: { notIn: [...NEVER_PAID_RAW, 'CANCELLED'] } },
          notExpired,
        ],
      };
      if (lastPayouts.length === 0) return { OR: [newWorld, baseCleared] };
      const legacyCleared: WTWhere = {
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
      return { OR: [newWorld, legacyCleared] };
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
  riskLevel?: 'Low' | 'Medium' | 'High',
): Promise<{ data: GlobalCashbackEntry[]; total: number; page: number; limit: number }> {
  // Spec §4.4: 7 derived states (Pending / TrialPending / Cleared / Locked / Paid / Expired / Voided).
  // We push the filter to Prisma so true DB pagination + count work for all states,
  // including Paid/Cleared which need the per-wallet latest completed withdrawal.
  const now = new Date();

  // riskLevel filter: prefer per-entry StickerScan.specRiskLevel (spec §2.1 five-signal
  // classification written at scan time). Fall back to current user.riskScore bands for
  // entries that have no stickerScan or whose scan predates the specRiskLevel column.
  const riskScoreWhere: { lte?: number; gt?: number } | undefined =
    riskLevel === 'Low' ? { lte: 20 } :
    riskLevel === 'Medium' ? { gt: 20, lte: 50 } :
    riskLevel === 'High' ? { gt: 50 } :
    undefined;

  // Top-level riskLevel WHERE — runs at WalletTransaction level so it can reach
  // both stickerScan.specRiskLevel (per-entry) and wallet.user.riskScore (fallback).
  const riskLevelWhere: WTWhere | undefined = riskLevel
    ? {
        OR: [
          // Entry has a per-scan classification — match it directly
          { stickerScan: { specRiskLevel: riskLevel } },
          // No per-scan classification (receipt-only or legacy) — fall back to user band
          {
            AND: [
              {
                OR: [
                  { stickerScan: null },
                  { stickerScan: { specRiskLevel: null } },
                ],
              },
              { wallet: { user: { riskScore: riskScoreWhere } } },
            ],
          },
        ],
      }
    : undefined;

  // Build user search sub-filter (join on wallet → user)
  const userFilterConditions: Record<string, any>[] = [];
  if (search) {
    userFilterConditions.push({
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
      ],
    });
  }
  const userWhere = userFilterConditions.length > 0
    ? {
        wallet: {
          user: userFilterConditions[0],
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
    ...riskLevelWhere,
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
        cashbackStatus: true,
        cashbackExpiresAt: true,
        cashbackPaidAt: true,
        clearedAt: true,
        voidedAt: true,
        voidedReason: true,
        description: true,
        createdAt: true,
        wallet: {
          select: {
            userId: true,
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, riskScore: true },
            },
          },
        },
        receipt: {
          select: {
            id: true,
            totalAmount: true,
            merchantName: true,
            venue: {
              select: {
                partner: { select: { id: true, businessName: true } },
              },
            },
          },
        },
        stickerScan: {
          select: {
            specRiskLevel: true,
            venue: {
              select: {
                partner: { select: { id: true, businessName: true } },
              },
            },
          },
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

    // Mirror the same guard as getSubscriberCashbackEntries: null when Expired
    // so force-expired entries don't show a positive countdown alongside "Expired".
    const daysUntilExpiry = (e.cashbackExpiresAt && status !== 'Expired')
      ? Math.max(0, Math.ceil((e.cashbackExpiresAt.getTime() - now.getTime()) / 86_400_000))
      : null;

    return {
      id: e.id,
      amount: e.amount,
      status,
      rawStatus: e.status,
      cashbackExpiresAt: e.cashbackExpiresAt,
      clearedAt: (e as any).clearedAt ?? null,
      daysUntilExpiry,
      description: e.description,
      createdAt: e.createdAt,
      voidedReason: (e as any).voidedReason ?? null,
      voidedAt: (e as any).voidedAt ?? null,
      receipt: e.receipt
        ? { id: e.receipt.id, totalAmount: e.receipt.totalAmount, merchantName: e.receipt.merchantName }
        : null,
      partner: e.receipt?.venue?.partner ?? e.stickerScan?.venue?.partner ?? null,
      user: e.wallet.user,
      specRiskLevel: e.stickerScan?.specRiskLevel ?? null,
    };
  });

  return { data, total, page, limit };
}

// ─── Entry-level admin actions (spec §4.4) ────────────────────────────────────

/**
 * Approve a Pending cashback entry → Cleared. Spec §4.4 v1.1:
 * the 60-day rolling validity starts from the Cleared date (not from the
 * original transaction date), so an entry that sat in risk review for weeks
 * gets a fresh 60-day window. Delegates to cashbackLifecycleService.markCleared
 * which writes cashbackStatus=CLEARED, clearedAt=now, cashbackExpiresAt=now+60d
 * and an AuditLog row (spec §10.4).
 */
export async function approveEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: { id: true, type: true, status: true, cashbackStatus: true, amount: true, walletId: true },
  });
  if (!entry) throw new AppError('Entry not found', 404);
  if (entry.type !== 'CASHBACK_CREDIT') throw new AppError('Not a cashback entry', 400);

  // Spec §1.3 — TrialPending records cannot be manually approved or rejected.
  // Only the scheduler resolves them (resolveTrialPendingCashback at 5:30 AM).
  // Guard via both cashbackStatus column and the legacy raw-status field.
  if (entry.cashbackStatus === 'TRIAL_PENDING' || entry.status === 'TRIAL_PENDING') {
    throw new AppError('Cannot manually approve a TrialPending record — only the scheduler resolves these.', 400);
  }

  // Pending = lifecycle-tagged PENDING, OR legacy raw-status in pending bucket.
  // Idempotency: ALSO accept "already-COMPLETED but missing cashbackStatus" so a
  // retry after a previous failed markCleared can recover the entry. Without this,
  // a partial-completion (status=COMPLETED, cashbackStatus=null) would leave the
  // entry stuck — neither pending nor cleared.
  const isPending = entry.cashbackStatus === 'PENDING'
    || (entry.cashbackStatus == null && ['PENDING', 'PROCESSING', 'RISK_HOLD'].includes(entry.status));
  const isMidApproval = entry.cashbackStatus == null && entry.status === 'COMPLETED';
  if (!isPending && !isMidApproval) {
    throw new AppError(`Cannot approve entry — not in Pending state`, 400);
  }

  // Fetch expiry setting before entering the transaction — getSystemSettingInt
  // uses the shared prisma client (not tx), so calling it inside the interactive
  // transaction would consume a second pool connection while the transaction
  // already holds one, creating pool pressure under concurrent approvals.
  const validityDays = await getSystemSettingInt('cashback_expiry_days', 60);

  // Atomicity: flipping raw status to COMPLETED and writing the lifecycle
  // transition must happen as one unit. If markCleared fails after the status
  // update is committed, the row would be stuck with status=COMPLETED but
  // cashbackStatus=null. markCleared has its own internal $transaction; nested
  // calls flatten under Prisma, so this is safe.
  await prisma.$transaction(async (tx) => {
    if (entry.status !== 'COMPLETED') {
      await tx.walletTransaction.update({
        where: { id: entryId },
        data: { status: 'COMPLETED' },
      });
      // Ghost PENDING entry (recordPendingForRiskReview): wallet balance was NOT
      // credited at creation time. Credit it now atomically with the status flip.
      await tx.wallet.update({
        where: { id: entry.walletId },
        data: {
          balance: { increment: entry.amount },
          availableBalance: { increment: entry.amount },
        },
      });
    }
    // Run the lifecycle transition inside the same tx via direct field update
    // (rather than calling markCleared) so an audit-write failure outside the
    // tx cannot leave a half-applied state. We replicate markCleared's behaviour
    // with the idempotency guarantee.
    const clearedAt = new Date();
    const expiresAt = new Date(clearedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
    // Precondition: only transition if still in an approvable state.
    // A concurrent admin click could have already CLEARED the entry between the
    // outer findUnique read and this tx — without this guard the second call
    // would re-write clearedAt / cashbackExpiresAt, silently extending the window.
    const updateResult = await tx.walletTransaction.updateMany({
      where: { id: entryId, cashbackStatus: { not: 'CLEARED' } },
      data: {
        cashbackStatus: 'CLEARED',
        clearedAt,
        cashbackExpiresAt: expiresAt,
      },
    });
    if (updateResult.count === 0) {
      logger.info(`[approveEntry] entry ${entryId} already CLEARED — skipping duplicate transition`);
    }
  });

  // Audit outside the tx — non-fatal, won't undo the transition.
  await writeAudit({
    actorUserId: adminUserId,
    action: 'CASHBACK_CLEARED',
    objectType: 'WalletTransaction',
    objectId: entryId,
    before: { cashbackStatus: entry.cashbackStatus },
    after: { cashbackStatus: 'CLEARED', reason: 'Admin approved cashback entry' },
  }).catch((err) => logger.error('[adminCashback.approveEntry] audit write failed:', err));

  logger.info(`Admin ${adminUserId} approved cashback entry ${entryId} (Pending → Cleared, 60d window from now)`);
}

/**
 * Void a cashback entry with a visible reason (spec §4.4 v1.1).
 * Used when a risk review rejects the originating transaction OR when an
 * admin manually voids a Pending/Cleared/Locked entry. The row stays visible
 * to the user as "Анулиран" with the reason. See cashbackLifecycleService.markVoided.
 */
export async function voidEntry(entryId: string, adminUserId: string, reason: string): Promise<void> {
  if (!reason || reason.trim().length === 0) {
    throw new AppError('Void reason is required', 400);
  }
  // F-008 / Spec §8.1 rule 6 + §1.3: enforce the controlled void-reason vocabulary
  // on EVERY void path — including the inline Locked→Voided branch below, which
  // previously accepted arbitrary text. Validate once here before branching so
  // Pending/Cleared→Voided and Locked→Voided enforce identical rules.
  // markVoided (called for the non-LOCKED path) re-validates idempotently.
  try {
    assertVoidReasonCategory(reason);
  } catch (err: any) {
    throw new AppError(err?.message || 'Invalid void reason category', 400);
  }
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: { id: true, type: true, status: true, cashbackStatus: true, walletId: true, amount: true },
  });
  if (!entry) throw new AppError('Entry not found', 404);
  if (entry.type !== 'CASHBACK_CREDIT') throw new AppError('Not a cashback entry', 400);
  // Spec §1.3 — TrialPending records cannot be manually rejected (voided) by admin.
  // Only the scheduler resolves them (resolveTrialPendingCashback at 5:30 AM).
  if (entry.cashbackStatus === 'TRIAL_PENDING' || entry.status === 'TRIAL_PENDING') {
    throw new AppError('Cannot manually void a TrialPending record — only the scheduler resolves these.', 400);
  }
  // Spec §1.3 + §8.1 rule 2: terminal states (EXPIRED, VOIDED, PAID) cannot transition out.
  // Reject here for a clean 400 before branching.
  if (entry.cashbackStatus === 'EXPIRED') {
    throw new AppError('Cannot void an EXPIRED cashback entry — EXPIRED is terminal (§1.3).', 400);
  }
  if (entry.cashbackStatus === PrismaCashbackEntryStatus.VOIDED) {
    throw new AppError('Cannot void an already-VOIDED cashback entry — VOIDED is terminal (§1.3).', 400);
  }

  // Spec §1.3 + §3.4: Locked → Voided is a supported transition. markVoided
  // throws on LOCKED to protect in-flight payouts. For a standalone admin void
  // (not tied to a payout cancellation), we perform the full transition — setting
  // all voided fields and decrementing the wallet balance — in a SINGLE atomic
  // $transaction. Calling markVoided from within a $transaction is avoided because
  // it opens its own $transaction internally; two separate committed transactions
  // would leave the entry stranded as CLEARED if the process crashed between them.
  if (entry.cashbackStatus === PrismaCashbackEntryStatus.LOCKED) {
    // Distinguish lock origin:
    // - Admin-panel lockEntry sets status='CANCELLED' (wallet NOT yet drained) → safe to decrement.
    // - User's requestPayout sets status='COMPLETED' then LOCKED (wallet already drained) → decrement
    //   would be a double-debit. Reject with 409 so the caller cancels the payout first.
    if (entry.status === 'COMPLETED') {
      throw new AppError(
        'This cashback entry is locked for payout processing; cancel the payout first',
        409,
      );
    }
    const trimmedReason = reason.trim();
    const voidedAt = new Date();
    await prisma.$transaction(async (tx) => {
      // Atomically set all voided fields and decrement the wallet balance.
      // The entry was CLEARED (balance credited) before being LOCKED by admin
      // (status='CANCELLED'), so we decrement both balance and availableBalance
      // to reclaim the amount.
      await tx.walletTransaction.update({
        where: { id: entryId },
        data: {
          cashbackStatus: PrismaCashbackEntryStatus.VOIDED,
          status: 'ANNULLED',
          voidedAt,
          voidedReason: trimmedReason,
          voidedByUserId: adminUserId,
        },
      });
      await tx.wallet.update({
        where: { id: entry.walletId },
        data: {
          balance: { decrement: entry.amount },
          availableBalance: { decrement: entry.amount },
        },
      });
    });
    await writeAudit({
      actorUserId: adminUserId,
      action: 'CASHBACK_VOIDED',
      objectType: 'WalletTransaction',
      objectId: entryId,
      before: { cashbackStatus: entry.cashbackStatus },
      after: {
        cashbackStatus: 'VOIDED',
        voidedAt,
        voidedReason: trimmedReason,
        balanceReversal: true,
        reversalAmount: entry.amount,
      },
    }).catch((err) => logger.error('[adminCashback.voidEntry] audit write failed (Locked→Voided):', err));
    logger.info(`Admin ${adminUserId} voided LOCKED cashback entry ${entryId} (Locked → Voided atomic): ${reason}`);
    return;
  }

  await cashbackLifecycleService.markVoided({
    walletTransactionId: entryId,
    actorUserId: adminUserId,
    reason: reason.trim(),
  });
  logger.info(`Admin ${adminUserId} voided cashback entry ${entryId}: ${reason}`);
}

/**
 * Lock a Cleared cashback entry (COMPLETED → CANCELLED with future expiresAt → shows as Locked).
 * Rejects entries in "Paid" derived state (COMPLETED but createdAt ≤ wallet's latest payout).
 *
 * Spec §8.1 rule 3 (payout eligibility): Before locking, verify the owning user's subscription
 * status and IBAN. Only users with Active/TRIALING subscriptions or Cancelled-within-paid-period,
 * plus a valid IBAN, may have cashback locked for payout. This guard prevents manually locking
 * entries for users who are ineligible — the automated pipeline already enforces this, but manual
 * lock is a SUPER_ADMIN override that must respect the same earned-rights gate.
 */
export async function lockEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: {
      id: true, type: true, status: true, cashbackExpiresAt: true,
      createdAt: true, walletId: true,
      cashbackStatus: true, cashbackPaidAt: true,
      wallet: { select: { userId: true } },
    },
  });
  if (!entry) throw new AppError('Entry not found', 404);
  if (entry.type !== 'CASHBACK_CREDIT') throw new AppError('Not a cashback entry', 400);
  if (entry.status !== 'COMPLETED') {
    throw new AppError(`Cannot lock entry with status ${entry.status}`, 400);
  }
  // Spec §1.3: only Cleared → Locked is a valid transition. A COMPLETED entry
  // without cashbackStatus=CLEARED (e.g. mid-approval where status=COMPLETED but
  // cashbackStatus=null) must NOT be locked — it would skip the Cleared state,
  // leaving clearedAt/cashbackExpiresAt unset and corrupting 60-day expiry tracking.
  if (entry.cashbackStatus !== PrismaCashbackEntryStatus.CLEARED) {
    throw new AppError(
      `Cannot lock entry — cashbackStatus must be CLEARED (current: ${entry.cashbackStatus ?? 'null'})`,
      409,
    );
  }
  // Guard against re-locking a Paid entry via cashbackPaidAt (legacy path).
  // cashbackStatus='PAID' is already excluded by the CLEARED guard above.
  if (entry.cashbackPaidAt != null) {
    throw new AppError('Cannot lock a paid entry', 400);
  }
  // Guard against locking a "Paid" entry — one that predates the wallet's latest completed payout.
  // Only "Cleared" (COMPLETED, not yet covered by a payout) entries may be locked.
  const latestWithdrawal = await prisma.walletTransaction.findFirst({
    where: { walletId: entry.walletId, type: 'WITHDRAWAL', status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latestWithdrawal && entry.createdAt <= latestWithdrawal.createdAt) {
    throw new AppError('Cannot lock a paid-out entry', 400);
  }

  // DEFECT B FIX: Verify payout eligibility before locking.
  // Import resolvePayoutEligibility at the top of the file if needed.
  const { eligible, hasFailedPayment } = await resolvePayoutEligibility(entry.wallet.userId);
  if (!eligible) {
    const reason = hasFailedPayment
      ? 'user has FAILED_PAYMENT subscription status'
      : 'user does not have an eligible subscription';
    throw new AppError(
      `Cannot lock cashback entry — payout ineligible (${reason}). Spec §8.1 rule 3: payout eligibility required.`,
      409,
    );
  }

  // Also verify the user has an IBAN on file (not enforced by resolvePayoutEligibility but required for actual payout).
  const userIban = await prisma.user.findUnique({
    where: { id: entry.wallet.userId },
    select: { iban: true },
  });
  if (!userIban?.iban) {
    throw new AppError(
      'Cannot lock cashback entry — user has no IBAN on file. Spec §3.7: IBAN required before payout.',
      409,
    );
  }

  const now = new Date();
  const keepExpiresAt = entry.cashbackExpiresAt && entry.cashbackExpiresAt > now
    ? entry.cashbackExpiresAt
    : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.walletTransaction.update({
    where: { id: entryId },
    data: { status: 'CANCELLED', cashbackStatus: 'LOCKED', cashbackExpiresAt: keepExpiresAt },
  });
  await writeAudit({
    actorUserId: adminUserId,
    action: 'CASHBACK_LOCKED',
    objectType: 'WalletTransaction',
    objectId: entryId,
    before: { cashbackStatus: entry.cashbackStatus },
    after: { cashbackStatus: 'LOCKED', notes: 'Cleared → Locked (payout pipeline)' },
  }).catch((err) => logger.error('[adminCashback.lockEntry] audit write failed:', err));
  logger.info(`Admin ${adminUserId} locked cashback entry ${entryId}`);
}

/**
 * Force-expire a cashback entry (cashbackExpiresAt = now, CANCELLED → Expired).
 */
export async function expireEntry(
  entryId: string,
  adminUserId: string,
  opts?: { allowPendingOverride?: boolean },
): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: {
      id: true, type: true, status: true, cashbackStatus: true,
      walletId: true, amount: true, cashbackExpiresAt: true,
    },
  });
  if (!entry) throw new AppError('Entry not found', 404);
  if (entry.type !== 'CASHBACK_CREDIT') throw new AppError('Not a cashback entry', 400);
  // Spec §1.3 — TrialPending records cannot be manually expired by admin.
  // Only the scheduler resolves them (resolveTrialPendingCashback at 5:30 AM).
  if (entry.cashbackStatus === 'TRIAL_PENDING' || entry.status === 'TRIAL_PENDING') {
    throw new AppError('Cannot manually expire a TrialPending record — only the scheduler resolves these.', 400);
  }
  // L3 / Spec §8.1 rule 2 — "Pending cashback never expires." A Pending record has
  // no 60-day countdown, so expiring it contradicts the lifecycle. The §3.4 admin
  // force-expire carve-out still allows an explicit override, but it must be opted
  // into deliberately — default behavior refuses to expire a Pending record.
  if (entry.cashbackStatus === 'PENDING' && !opts?.allowPendingOverride) {
    throw new AppError(
      'Pending cashback never expires (spec §8.1). Pass adminOverride=true to force-expire a Pending record.',
      400,
    );
  }
  // Block terminal states that cannot be expired.
  if (['VOIDED', 'PAID', 'EXPIRED'].includes(entry.cashbackStatus ?? '')) {
    throw new AppError(`Cannot expire entry with cashback status ${entry.cashbackStatus}`, 400);
  }
  if (['ANNULLED', 'FAILED'].includes(entry.status) && !entry.cashbackStatus) {
    throw new AppError(`Cannot expire entry with status ${entry.status}`, 400);
  }
  // L1 / Spec §1.3: LOCKED is an intermediate payout-pipeline state whose only
  // valid exits are Locked → Paid and Locked → Voided. The §3.4 "any active →
  // Expired" admin carve-out does NOT cover Locked: Locked is explicitly "NOT
  // terminal" and "already counted" — it sits in the payout pipeline, not in the
  // active-balance pool, so expiring it would silently drop an in-flight payout.
  // Reject any LOCKED entry (both the admin-panel lock, status='CANCELLED', and
  // the user requestPayout lock, status='COMPLETED'). To remove a Locked entry,
  // cancel the payout (revert to Cleared) then expire/void, or pay it.
  if (entry.cashbackStatus === 'LOCKED') {
    throw new AppError(
      'Cannot expire a LOCKED cashback entry — Locked exits only to Paid or Voided (§1.3). ' +
        'Cancel the payout first to revert it to Cleared.',
      409,
    );
  }
  const now = new Date();
  // Was the balance already credited? True for CLEARED state. PENDING entries have
  // no wallet credit yet; expiring them needs no decrement. (LOCKED is rejected
  // above per L1 — Locked exits only to Paid/Voided — so it never reaches here.)
  const wasCleared =
    entry.cashbackStatus === 'CLEARED' ||
    (entry.cashbackStatus == null && (
      entry.status === 'COMPLETED' ||
      (entry.status === 'CANCELLED' && entry.cashbackExpiresAt != null && entry.cashbackExpiresAt > now)
    ));
  await prisma.$transaction(async (tx) => {
    const result = await tx.walletTransaction.updateMany({
      where: {
        id: entryId,
        OR: [
          { cashbackStatus: null },
          { NOT: { cashbackStatus: { in: ['EXPIRED', 'PAID', 'VOIDED'] } } },
        ],
      },
      // Do NOT overwrite cashbackExpiresAt — it holds the original deadline and
      // is meaningful for audit/reconciliation queries. The cashbackStatus=EXPIRED
      // transition is the authoritative expired signal; the deadline is historical context.
      data: { status: 'CANCELLED', cashbackStatus: 'EXPIRED' },
    });
    if (result.count === 0) return; // concurrent expire already ran — skip wallet debit
    // LOCKED entries are rejected before this point (L1), so no payout-locked
    // double-debit case remains; a CLEARED entry's credit is reclaimed here.
    if (wasCleared) {
      await tx.wallet.update({
        where: { id: entry.walletId },
        data: {
          balance: { decrement: entry.amount },
          availableBalance: { decrement: entry.amount },
        },
      });
    }
  });
  await writeAudit({
    actorUserId: adminUserId,
    action: 'CASHBACK_EXPIRED',
    objectType: 'WalletTransaction',
    objectId: entryId,
    before: { cashbackStatus: entry.cashbackStatus },
    after: { cashbackStatus: 'EXPIRED', notes: 'Admin force-expire' },
  }).catch((err) => logger.error('[adminCashback.expireEntry] audit write failed:', err));
  logger.info(`Admin ${adminUserId} force-expired cashback entry ${entryId}`);
}

/**
 * Mark a Locked cashback entry as Paid (spec §4.4 Locked → Paid admin action).
 * Sets cashbackPaidAt = now so deriveCashbackEntryStatus returns 'Paid'.
 */
export async function payEntry(entryId: string, adminUserId: string): Promise<void> {
  const entry = await prisma.walletTransaction.findUnique({
    where: { id: entryId },
    select: {
      id: true, type: true, status: true, cashbackStatus: true,
      cashbackExpiresAt: true, cashbackPaidAt: true,
    },
  });
  if (!entry) throw new AppError('Entry not found', 404);
  if (entry.type !== 'CASHBACK_CREDIT') throw new AppError('Not a cashback entry', 400);
  if (entry.cashbackPaidAt || entry.cashbackStatus === 'PAID') {
    throw new AppError('Entry is already marked as paid', 400);
  }
  const now = new Date();
  // New-world: cashbackStatus === LOCKED is the authoritative locked state.
  // Legacy: raw status is CANCELLED (with future expiresAt) or FAILED.
  // ANNULLED is excluded — deriveCashbackEntryStatus maps ANNULLED → 'Voided', not 'Locked'.
  const isNewWorldLocked = entry.cashbackStatus === 'LOCKED';
  const LEGACY_LOCKED_STATUSES = ['CANCELLED', 'FAILED'] as const;
  const isLegacyLocked = !entry.cashbackStatus &&
    (LEGACY_LOCKED_STATUSES as readonly string[]).includes(entry.status);
  if (!isNewWorldLocked && !isLegacyLocked) {
    throw new AppError(`Only Locked entries can be marked as paid (current status: ${entry.cashbackStatus ?? entry.status})`, 400);
  }
  // For legacy CANCELLED: verify it hasn't already expired (expired CANCELLED = Expired, not Locked)
  if (!entry.cashbackStatus && entry.status === 'CANCELLED' &&
      (!entry.cashbackExpiresAt || entry.cashbackExpiresAt <= now)) {
    throw new AppError('Entry has already expired and cannot be marked as paid', 400);
  }
  const result = await prisma.walletTransaction.updateMany({
    where: { id: entryId, cashbackPaidAt: null },
    data: { cashbackStatus: 'PAID', cashbackPaidAt: now },
  });
  if (result.count === 0) {
    throw new AppError('Entry has already been marked as paid by a concurrent request', 409);
  }
  await writeAudit({
    actorUserId: adminUserId,
    action: 'CASHBACK_PAID',
    objectType: 'WalletTransaction',
    objectId: entryId,
    before: { cashbackStatus: entry.cashbackStatus },
    after: { cashbackStatus: 'PAID', notes: 'Locked → Paid (payout complete)' },
  }).catch((err) => logger.error('[adminCashback.payEntry] audit write failed:', err));
  logger.info(`Admin ${adminUserId} marked cashback entry ${entryId} as paid`);
}

// ─── CSV Export (spec §3.4) ───────────────────────────────────────────────────

/**
 * Derive a display riskLevel label from a numeric riskScore using the same
 * band thresholds as the subscribers listing and the /entries riskLevel filter:
 *   Low   ≤ 20
 *   Medium 21–50
 *   High   > 50
 */
function deriveRiskLevel(riskScore: number): 'Low' | 'Medium' | 'High' {
  if (riskScore <= 20) return 'Low';
  if (riskScore <= 50) return 'Medium';
  return 'High';
}

/** Escape a CSV field value: wrap in double-quotes if it contains comma, quote, or newline. */
function csvField(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Spec §3.4 — "Export by status." Converts an array of GlobalCashbackEntry rows
 * to a CSV string. Columns: id, userId, userEmail, amount, status, riskLevel,
 * clearedAt, expiresAt, voidedReason, createdAt. Capped at 10,000 rows by the
 * caller (getAllCashbackEntries maxLimit=10000).
 */
export function exportCashbackEntriesCsv(entries: GlobalCashbackEntry[]): string {
  const header = [
    'id', 'userId', 'userEmail', 'amount', 'status', 'riskLevel',
    'clearedAt', 'expiresAt', 'voidedReason', 'createdAt',
  ].join(',');

  const rows = entries.map((e) => {
    // Prefer per-entry specRiskLevel (set at scan time per spec §2.1); fall back
    // to current user.riskScore band for receipt-only or legacy entries.
    const riskLevel = e.specRiskLevel ?? deriveRiskLevel(e.user.riskScore);
    return [
      csvField(e.id),
      csvField(e.user.id),
      csvField(e.user.email),
      csvField(e.amount),
      csvField(e.status),
      csvField(riskLevel),
      csvField(e.clearedAt?.toISOString() ?? null),
      csvField(e.cashbackExpiresAt?.toISOString() ?? null),
      csvField(e.voidedReason),
      csvField(e.createdAt.toISOString()),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Backfill cashbackExpiresAt = clearedAt + 60 days for pre-migration CASHBACK_CREDIT rows.
 * Uses clearedAt per spec §4.4 (60-day window anchored to when cashback cleared, not created).
 * Falls back to createdAt for rows where clearedAt is null (immediate-credit legacy rows).
 * Idempotent — only touches rows where cashbackExpiresAt IS NULL.
 */
export async function backfillCashbackExpiry(): Promise<number> {
  // Exclude entries that are still pending — their 60-day window must start
  // from the cleared date, not from createdAt. Including them would write a
  // premature cashbackExpiresAt that misrepresents the lifecycle and could
  // cause the admin dashboard to show stale expiry dates until approval
  // overwrites the value. Both new-world (cashbackStatus) and legacy
  // (raw status) pending signals are excluded.
  const PENDING_RAW = ['PENDING', 'TRIAL_PENDING', 'PROCESSING', 'RISK_HOLD'] as const;
  // Terminal states must not receive a backfilled expiry — deriveCashbackEntryStatus
  // ignores cashbackExpiresAt for these states, but writing a future date would
  // corrupt future queries that filter on cashbackExpiresAt without a state guard.
  const TERMINAL_STATUSES = ['VOIDED', 'PAID', 'EXPIRED'] as const;
  const rows = await prisma.walletTransaction.findMany({
    where: {
      type: 'CASHBACK_CREDIT',
      cashbackExpiresAt: null,
      NOT: {
        OR: [
          { cashbackStatus: { in: [...TERMINAL_STATUSES, 'PENDING'] } },
          { status: { in: [...PENDING_RAW, 'ANNULLED'] } },
          { cashbackPaidAt: { not: null } },
        ],
      },
    },
    select: { id: true, createdAt: true, clearedAt: true },
  });
  if (rows.length === 0) return 0;
  await Promise.all(
    rows.map(r =>
      prisma.walletTransaction.update({
        where: { id: r.id },
        data: { cashbackExpiresAt: new Date((r.clearedAt ?? r.createdAt).getTime() + 60 * 24 * 60 * 60 * 1000) },
      }),
    ),
  );
  logger.info(`Backfilled cashbackExpiresAt for ${rows.length} CASHBACK_CREDIT entries`);
  return rows.length;
}
