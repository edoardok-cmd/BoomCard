import { Router } from 'express';
import { WalletTransactionType, WalletTransactionStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { deriveCashbackEntryStatus } from '../services/adminCashback.service';

const router = Router();

// Reject arrays and nested objects that qs can produce when a param is repeated
// (?x=a&x=b → ['a','b']) or bracket-notation is used (?x[gt]=1 → {gt:'1'}).
// Without this, `new Date(['x'])` = Invalid Date crashes and Prisma type errors.
function qs(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

type TxWhere = Parameters<typeof prisma.walletTransaction.findMany>[0]['where'];

function buildWhere(query: Record<string, unknown>): TxWhere {
  const search = qs(query.search);
  const type = qs(query.type);
  const status = qs(query.status);
  const dateFrom = qs(query.dateFrom);
  const dateTo = qs(query.dateTo);
  const userId = qs(query.userId);
  const minAmount = qs(query.minAmount);
  const where: TxWhere = {};

  if (type && Object.values(WalletTransactionType).includes(type as WalletTransactionType)) {
    where!.type = type as WalletTransactionType;
  }
  if (status && Object.values(WalletTransactionStatus).includes(status as WalletTransactionStatus)) {
    where!.status = status as WalletTransactionStatus;
  }
  // minAmount: drives the deep-link from the "large pending payouts" alert. Guarded
  // against NaN — invalid input means "no filter" rather than crashing the query.
  if (minAmount) {
    const n = parseFloat(minAmount);
    if (Number.isFinite(n) && n > 0) {
      (where as Record<string, unknown>)['amount'] = { gte: n };
    }
  }

  const walletWhere: Record<string, unknown> = {};
  if (search) {
    walletWhere['user'] = {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ],
    };
  }
  if (userId) {
    walletWhere['userId'] = userId;
  }
  if (Object.keys(walletWhere).length > 0) {
    (where as Record<string, unknown>)['wallet'] = walletWhere;
  }

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter['gte'] = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999); // date-only strings parse as UTC midnight; keep end-of-day in UTC too
      dateFilter['lte'] = to;
    }
    (where as Record<string, unknown>)['createdAt'] = dateFilter;
  }

  return where;
}

// GET /api/admin/transactions?page=1&limit=20&search=...&type=TOP_UP&status=COMPLETED&dateFrom=...&dateTo=...&userId=...
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const page = qs(req.query.page) ?? '1';
    const limit = qs(req.query.limit) ?? '20';
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where = buildWhere(req.query);

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true,
          wallet: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    res.json({ transactions, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/transactions/stats?search=...&type=...&status=...&dateFrom=...&dateTo=...&userId=...
router.get('/stats', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const baseWhere = buildWhere(req.query);

    const [volumeResult, cashbackResult, withdrawalResult] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: baseWhere,
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...baseWhere, type: 'CASHBACK_CREDIT', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...baseWhere, type: 'WITHDRAWAL', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      totalVolume: volumeResult._sum.amount ?? 0,
      totalCashback: cashbackResult._sum.amount ?? 0,
      totalWithdrawals: withdrawalResult._sum.amount ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/transactions/adjust
router.post('/adjust', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.write'), async (req, res, next) => {
  let validationError: string | null = null;
  try {
    const { userId, amount, reason } = req.body as {
      userId: string;
      amount: number;
      reason: string;
    };

    if (!userId || typeof amount !== 'number' || amount === 0 || !isFinite(amount)) {
      res.status(400).json({ error: 'userId and a finite non-zero amount are required' });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: 'reason is required' });
      return;
    }

    // Existence check before entering the transaction — gives a clean 404.
    const exists = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ error: 'Wallet not found for this user' });
      return;
    }

    // Read balance INSIDE the interactive transaction so balanceBefore/After are consistent
    // even under concurrent requests.
    const transaction = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: { id: true, balance: true, availableBalance: true, currency: true },
      });
      if (!wallet) throw new Error('Wallet disappeared inside transaction');

      if (amount < 0 && wallet.availableBalance + amount < 0) {
        validationError = 'Adjustment would result in negative balance';
        throw new Error(validationError);
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      const created = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          amount: Math.abs(amount), // amount field is always the magnitude; direction via balanceBefore→After
          balanceBefore,
          balanceAfter,
          currency: wallet.currency,
          status: 'COMPLETED',
          description: reason.trim(),
        },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount }, availableBalance: { increment: amount } },
      });

      return created;
    });

    res.status(201).json(transaction);
  } catch (error) {
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    next(error);
  }
});

// Build a Prisma WHERE clause for the Transaction-list endpoint.
// Pulled out so the list, total count, stats, and full-period export use the
// exact same filter semantics. minRisk is pushed into the DB layer (spec §7.1
// tier ranges) so total / pagination / stats stay in sync with the rendered rows.
type BusinessTxWhere = NonNullable<Parameters<typeof prisma.transaction.findMany>[0]>['where'];

function buildBusinessWhere(query: Record<string, unknown>): BusinessTxWhere {
  const partnerId = qs(query.partnerId);
  const type = qs(query.type);
  const status = qs(query.status);
  const dateFrom = qs(query.dateFrom);
  const dateTo = qs(query.dateTo);
  const search = qs(query.search);
  const minAmount = qs(query.minAmount);
  const maxAmount = qs(query.maxAmount);
  const minRisk = qs(query.minRisk);
  const where: BusinessTxWhere = {};
  const ands: BusinessTxWhere[] = [];

  if (partnerId) where.partnerId = partnerId;
  if (type && Object.values(TransactionType).includes(type as TransactionType)) {
    where.type = type as TransactionType;
  }
  if (status && Object.values(TransactionStatus).includes(status as TransactionStatus)) {
    where.status = status as TransactionStatus;
  }
  if (minAmount || maxAmount) {
    const amountFilter: Record<string, number> = {};
    if (minAmount) {
      const n = parseFloat(minAmount);
      if (Number.isFinite(n) && n > 0) amountFilter['gte'] = n;
    }
    if (maxAmount) {
      const n = parseFloat(maxAmount);
      if (Number.isFinite(n) && n > 0) amountFilter['lte'] = n;
    }
    if (Object.keys(amountFilter).length > 0) {
      (where as Record<string, unknown>)['amount'] = amountFilter;
    }
  }
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter['gte'] = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999);
      dateFilter['lte'] = to;
    }
    where.createdAt = dateFilter as never;
  }
  if (search) {
    const searchOR: object[] = [
      { user: { email: { contains: search, mode: 'insensitive' } } },
      { user: { firstName: { contains: search, mode: 'insensitive' } } },
      { user: { lastName: { contains: search, mode: 'insensitive' } } },
      { partner: { businessName: { contains: search, mode: 'insensitive' } } },
      { venue: { name: { contains: search, mode: 'insensitive' } } },
    ];
    // Also match by transaction ID prefix — the UI displays the first 8 chars.
    // Only attempt when the input is a valid hex/dash string to avoid LIKE
    // scans on clearly non-ID queries.
    if (/^[0-9a-f-]+$/i.test(search)) {
      searchOR.push({ id: { startsWith: search, mode: 'insensitive' } } as object);
    }
    ands.push({ OR: searchOR });
  }
  if (minRisk) {
    const n = parseFloat(minRisk);
    if (Number.isFinite(n) && n > 0) {
      // Risk score = max(receipt.fraudScore, stickerScan.fraudScore). At the DB
      // level, "row passes" iff EITHER source is at or above the threshold.
      ands.push({
        OR: [
          { receipt: { fraudScore: { gte: n } } },
          { stickerScan: { fraudScore: { gte: n } } },
        ],
      });
    }
  }
  if (ands.length > 0) where.AND = ands;
  return where;
}

// GET /api/admin/transactions/business — Spec §4.3 — Transaction model with
// Партньор / Локация / Кешбек / Марджин / Risk score / Receipt link / dual timestamps.
router.get('/business', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const page = qs(req.query.page) ?? '1';
    const limit = qs(req.query.limit) ?? '20';
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const where = buildBusinessWhere(req.query);

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          discount: true,
          discountAmount: true,
          finalAmount: true,
          cashbackAmount: true,
          netAmount: true,
          currency: true,
          paymentMethod: true,
          createdAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, riskScore: true },
          },
          // Partner discountRate (with partnerType fallback) is the contract rate
          // BoomCard charges the partner per accepted transaction. margin =
          // partnerCharge − userCashback; without the rate the formula would
          // collapse to ~0 since Transaction.discountAmount stores the user
          // cashback amount (sticker.service.ts:1170), not the partner charge.
          partner: {
            select: {
              id: true,
              businessName: true,
              discountRate: true,
              partnerType: { select: { maxDiscountRate: true } },
            },
          },
          venue: {
            select: { id: true, name: true },
          },
          receipt: {
            select: {
              id: true,
              imageUrl: true,
              imageKey: true,
              status: true,
              fraudScore: true,
              createdAt: true,
            },
          },
          stickerScan: {
            select: {
              sessionStartedAt: true,
              fraudScore: true,
            },
          },
          // CASHBACK_CREDIT walletTransaction is the source of truth for the
          // §4.4 lifecycle (Pending/Cleared/Locked/Paid/Expired). Receipt.status
          // only describes OCR/admin approval — not payout state — so deriving
          // from WalletTransaction avoids the "approved-but-already-paid-out"
          // conflation.
          walletTransaction: {
            select: {
              status: true,
              cashbackExpiresAt: true,
              createdAt: true,
              walletId: true,
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    // Per-user latest completed withdrawal — needed to flip Cleared → Paid for
    // entries that predate the most recent payout. Batched to avoid N+1.
    const walletIds = Array.from(
      new Set(
        transactions
          .map((tx) => tx.walletTransaction?.walletId)
          .filter((id): id is string => !!id),
      ),
    );
    const latestWithdrawals = walletIds.length
      ? await prisma.walletTransaction.groupBy({
          by: ['walletId'],
          where: { walletId: { in: walletIds }, type: 'WITHDRAWAL', status: 'COMPLETED' },
          _max: { createdAt: true },
        })
      : [];
    const latestWithdrawalByWallet = new Map<string, Date>(
      latestWithdrawals
        .map((r) => [r.walletId, r._max.createdAt])
        .filter((p): p is [string, Date] => !!p[1]),
    );

    const now = new Date();
    const rows = transactions.map((tx) => {
      // Margin = (partnerDiscountRate × amount) − userCashback.
      // discountRate is the contractual partner charge; fall back to the
      // partner type's maxDiscountRate, then null (column rendered as "—").
      const partnerDiscountRate =
        tx.partner?.discountRate ?? tx.partner?.partnerType?.maxDiscountRate ?? null;
      const cashback = tx.cashbackAmount ?? 0;
      const margin =
        partnerDiscountRate != null
          ? (partnerDiscountRate / 100) * tx.amount - cashback
          : null;

      const riskScore = Math.round(
        Math.max(tx.receipt?.fraudScore ?? 0, tx.stickerScan?.fraudScore ?? 0),
      );

      const latestWithdrawalAt = tx.walletTransaction?.walletId
        ? latestWithdrawalByWallet.get(tx.walletTransaction.walletId) ?? null
        : null;
      // Transactions without a CASHBACK_CREDIT (failed scans, refunds) have no
      // lifecycle — leave cashbackStatus null so the UI renders "—".
      const cashbackStatus = tx.walletTransaction
        ? deriveCashbackEntryStatus(
            {
              status: tx.walletTransaction.status,
              cashbackExpiresAt: tx.walletTransaction.cashbackExpiresAt,
              createdAt: tx.walletTransaction.createdAt,
            },
            latestWithdrawalAt,
            now,
          )
        : null;

      // Strip the entire walletTransaction sub-object from the wire response — the
      // walletId was only needed for the withdrawal-lookup Map above, and the rest
      // of the lifecycle fields are expressed as the derived cashbackStatus. UI
      // consumers read cashbackStatus rather than the raw WalletTransaction columns.
      const { walletTransaction: _wt, ...rest } = tx;
      return {
        ...rest,
        margin,
        partnerDiscountRate,
        riskScore,
        cashbackStatus,
        receiptUploadedAt: tx.receipt?.createdAt ?? null,
        sessionStartedAt: tx.stickerScan?.sessionStartedAt ?? null,
        userRiskScore: tx.user.riskScore,
      };
    });

    res.json({ transactions: rows, total, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
});

// Returns [startOfDay, endOfDay] in UTC for the current calendar day in
// Europe/Sofia (UTC+2 winter / UTC+3 summer). Using the server's UTC clock and
// backing out the Sofia offset means "today" on the stats bar matches the admin's
// calendar day in Sofia, not the server's UTC day.
function getTodayBoundariesInSofia(): [Date, Date] {
  const now = new Date();
  // formatToParts with hourCycle:'h23' gives hour 0-23 reliably across locales.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Sofia',
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
  const msFromMidnight =
    (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000 +
    now.getMilliseconds();
  const startOfToday = new Date(now.getTime() - msFromMidnight);
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000 - 1);
  return [startOfToday, endOfToday];
}

// GET /api/admin/transactions/business/stats — Spec §3.1 transactions block:
// Брой транзакции днес, общ оборот, средна стойност (today / total / avg, scoped by current filters).
// Accepts the same filter set as /business so the stats bar matches the visible row count.
router.get('/business/stats', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const where = buildBusinessWhere(req.query);

    const [startOfToday, endOfToday] = getTodayBoundariesInSofia();

    const todayWhere: BusinessTxWhere = where.AND
      ? { ...where, AND: [...(where.AND as BusinessTxWhere[]), { createdAt: { gte: startOfToday, lte: endOfToday } }] }
      : { ...where, AND: [{ createdAt: { gte: startOfToday, lte: endOfToday } }] };

    const [agg, todayCount] = await Promise.all([
      prisma.transaction.aggregate({
        where,
        _sum: { amount: true, cashbackAmount: true },
        _avg: { amount: true },
        _count: { _all: true },
      }),
      prisma.transaction.count({ where: todayWhere }),
    ]);

    res.json({
      count: agg._count._all,
      todayCount,
      totalVolume: agg._sum.amount ?? 0,
      averageValue: agg._avg.amount ?? 0,
      totalCashback: agg._sum.cashbackAmount ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/transactions/business/partner-risk — aggregate fraud signal per partner
// for the active filter window (Spec §7.2 — partner risk distinct from user risk).
// Returns max + avg fraudScore across the partner's receipts in scope so the modal can
// render a partner-level reading without an N+1 join in the list endpoint.
//
// Accepts the SAME filter params as /business so the modal's partner-risk reading
// matches the slice the admin is currently viewing — except minRisk, which is
// excluded on purpose: filtering receipts by their own fraudScore would make the
// aggregate self-fulfilling (you'd only see receipts above the threshold, so the
// "min" and "avg" would always be ≥ threshold).
router.get('/business/partner-risk/:partnerId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const { partnerId } = req.params;
    if (!partnerId) {
      res.status(400).json({ error: 'partnerId is required' });
      return;
    }
    // Build the transaction-side where with the active filters; pin partnerId
    // (overrides any inherited value from query) and drop minRisk to avoid
    // self-fulfilling aggregation.
    // _ignore is defense-in-depth: the frontend never passes partnerId in the
    // query string for this endpoint, but if it ever did the URL param's pin
    // below would be silently overridden without the destructure.
    const { minRisk: _drop, partnerId: _ignore, ...rest } = req.query;
    const txWhere = buildBusinessWhere({ ...(rest as Record<string, unknown>), partnerId });

    // Aggregate fraud signals from BOTH Receipt and StickerScan. The live cashback
    // pipeline is StickerScan-based (Receipt submission is retired — see service
    // header). Aggregating only Receipt rows would silently return risk=0 for any
    // partner whose recent transactions have no Receipt rows.
    const [receiptAgg, stickerAgg] = await Promise.all([
      prisma.receipt.aggregate({
        where: { transaction: txWhere },
        _max: { fraudScore: true },
        _avg: { fraudScore: true },
        _count: { _all: true },
      }),
      prisma.stickerScan.aggregate({
        where: { transaction: txWhere },
        _max: { fraudScore: true },
        _avg: { fraudScore: true },
        _count: { _all: true },
      }),
    ]);

    const receiptCount = receiptAgg._count._all;
    const stickerCount = stickerAgg._count._all;
    // signalCount = sum of rows that contributed a fraud score. A transaction with
    // both a Receipt and a StickerScan is counted once per source — an acceptable
    // approximation since the live pipeline is sticker-scan only.
    const signalCount = receiptCount + stickerCount;
    const maxFraudScore = Math.round(
      Math.max(receiptAgg._max.fraudScore ?? 0, stickerAgg._max.fraudScore ?? 0),
    );
    const avgFraudScore =
      signalCount > 0
        ? Math.round(
            (receiptCount * (receiptAgg._avg.fraudScore ?? 0) +
              stickerCount * (stickerAgg._avg.fraudScore ?? 0)) /
              signalCount,
          )
        : 0;

    res.json({
      partnerId,
      signalCount,
      maxFraudScore,
      avgFraudScore,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
