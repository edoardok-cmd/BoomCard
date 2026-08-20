import { Router } from 'express';
import { WalletTransactionType, WalletTransactionStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { deriveCashbackEntryStatus } from '../services/adminCashback.service';
import { parsePagination } from '../utils/pagination';
import { bgnToEur, toEur, toEurOrNull, sumMixedCurrencyToEur } from '../utils/currency';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

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
router.get('/', requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const { skip, take, page: pageNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

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

    // Stored amount/balanceBefore/balanceAfter are BGN-denominated — convert to
    // EUR before returning (BC-QA-031 — EUR-only responses).
    const transactionsEur = transactions.map(tx => ({
      ...tx,
      amount: bgnToEur(tx.amount),
      balanceBefore: bgnToEur(tx.balanceBefore),
      balanceAfter: bgnToEur(tx.balanceAfter),
      currency: 'EUR',
    }));

    res.json({ transactions: transactionsEur, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/transactions/stats?search=...&type=...&status=...&dateFrom=...&dateTo=...&userId=...
router.get('/stats', requirePermission('transactions.read'), async (req, res, next) => {
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

    const totalVolume = volumeResult._sum.amount ?? 0;
    const totalCashback = cashbackResult._sum.amount ?? 0;
    const totalWithdrawals = withdrawalResult._sum.amount ?? 0;

    // Stored totals are BGN-denominated — convert to EUR before returning
    // (BC-QA-031 — EUR-only responses).
    res.json({
      totalVolume: bgnToEur(totalVolume),
      totalCashback: bgnToEur(totalCashback),
      totalWithdrawals: bgnToEur(totalWithdrawals),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/transactions/adjust
router.post('/adjust', requirePermission('transactions.write'), async (req, res, next) => {
  let validationError: string | null = null;
  try {
    const { userId, amount, reason } = req.body as {
      userId: string;
      amount: number;
      reason: string;
    };

    if (!userId || typeof userId !== 'string' || !userId.trim() || typeof amount !== 'number' || amount === 0 || !isFinite(amount)) {
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
    // even under concurrent requests. Serializable isolation prevents the lost-update
    // TOCTOU where two concurrent negative adjustments both pass the availableBalance
    // guard and both apply their blind decrements, overdrawing the wallet.
    // eslint-disable-next-line prefer-const
    let created: any;
    try {
      created = await prisma.$transaction(async (tx) => {
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

        const transaction = await tx.walletTransaction.create({
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

        return transaction;
      }, { isolationLevel: 'Serializable' });
    } catch (txErr: any) {
      // Serializable isolation can produce a serialization failure (P2034) when two
      // concurrent adjustments race. Return 409 so the caller can retry rather than
      // surfacing an unhandled 500.
      if (txErr?.code === 'P2034') {
        res.status(409).json({
          message: 'Concurrent modification — please retry.',
          reason: 'CONCURRENT_TRANSITION',
        });
        return;
      }
      throw txErr;
    }

    req.auditAction = 'transaction.wallet-adjust';
    req.auditObjectType = 'transaction';
    req.auditObjectId = userId;
    // Stored amount/balanceBefore/balanceAfter are BGN-denominated — convert to
    // EUR before returning (BC-QA-031 — EUR-only responses).
    res.status(201).json({
      ...created,
      amount: bgnToEur(created.amount),
      balanceBefore: bgnToEur(created.balanceBefore),
      balanceAfter: bgnToEur(created.balanceAfter),
      currency: 'EUR',
    });
  } catch (error) {
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    next(error);
  }
});

// Build a Prisma WHERE clause for transaction-scoped queries.
// CRITICAL: This function is the single source of truth for transaction filtering
// across the /business list endpoint (line ~351), /business/stats aggregate (line ~619),
// and /business/stats receipt fallback (line ~645). If this function changes, all three
// query sites must produce consistent results — add a test (transactionStatsParity)
// to catch divergence. minRisk is pushed into the DB layer (spec §7.1 tier ranges)
// so total / pagination / stats stay in sync with the rendered rows.
type BusinessTxWhere = NonNullable<Parameters<typeof prisma.transaction.findMany>[0]>['where'];

function buildBusinessWhere(query: Record<string, unknown>): BusinessTxWhere {
  const partnerId = qs(query.partnerId);
  const userId = qs(query.userId);
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

  // partnerId filter must match BOTH Transaction.partnerId AND venue.partnerId
  // because the row mapping (and the /business response) falls back to
  // venue.partner when Transaction.partnerId is null. Without this OR, rows
  // with only a venue link silently disappear from the list while still being
  // attributed to the partner in the response that DOES come back, and the
  // stats bar undercounts vs. the visible rows.
  if (partnerId) {
    ands.push({
      OR: [
        { partnerId },
        { partnerId: null, venue: { partnerId } },
      ],
    });
  }
  if (userId) where.userId = userId;
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
      // Spec §4.3 v1.1 — prefer the persisted Transaction.riskScore; fall back
      // to live max(receipt.fraudScore, stickerScan.fraudScore) for legacy rows
      // where the column is still null.
      ands.push({
        OR: [
          { riskScore: { gte: Math.round(n) } },
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
router.get('/business', requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const { skip, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

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
          marginAmount: true,
          subscriptionId: true,
          discount: true,
          discountAmount: true,
          finalAmount: true,
          cashbackAmount: true,
          netAmount: true,
          currency: true,
          paymentMethod: true,
          riskScore: true,
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
          // venue.partner is needed as a fallback when Transaction.partnerId
          // is null but venueId is set (legacy rows / bookings created before
          // the partnerId backfill). Spec §4.3 requires every transaction to
          // surface its owning partner, so we recover it from the venue.
          venue: {
            select: {
              id: true,
              name: true,
              partner: {
                select: {
                  id: true,
                  businessName: true,
                  discountRate: true,
                  partnerType: { select: { maxDiscountRate: true } },
                },
              },
            },
          },
          receipt: {
            select: {
              id: true,
              imageUrl: true,
              imageKey: true,
              status: true,
              fraudScore: true,
              createdAt: true,
              cashbackAmount: true,
            },
          },
          stickerScan: {
            select: {
              sessionStartedAt: true,
              fraudScore: true,
            },
          },
          // CASHBACK_CREDIT walletTransaction is the source of truth for the
          // §4.4 lifecycle (Pending/Cleared/Locked/Paid/Expired/Voided).
          // cashbackStatus is the authoritative new-world lifecycle column —
          // it must be fetched so deriveCashbackEntryStatus uses it instead of
          // falling through to the legacy raw-status derivation for every row.
          walletTransaction: {
            select: {
              status: true,
              cashbackStatus: true,
              cashbackExpiresAt: true,
              cashbackPaidAt: true,
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
      // Recover partner from venue when Transaction.partnerId is null.
      // Both the partner field on the wire response and the discountRate used
      // for margin should reflect the venue's owning partner.
      const effectivePartner = tx.partner ?? tx.venue?.partner ?? null;

      // Margin = (partnerDiscountRate × amount) − userCashback.
      // discountRate is the contractual partner charge; fall back to the
      // partner type's maxDiscountRate, then null (column rendered as "—").
      const partnerDiscountRate =
        effectivePartner?.discountRate ?? effectivePartner?.partnerType?.maxDiscountRate ?? null;
      // Cashback fallback chain: Transaction.cashbackAmount → Receipt.cashbackAmount.
      // Older rows created before the cashback engine wrote to Transaction stored
      // the calculated amount only on the receipt; surface it instead of "—".
      // Receipt.cashbackAmount has @default(0) (Prisma schema), so we only fall
      // back when there is independent evidence cashback was actually computed —
      // either a CASHBACK_CREDIT walletTransaction exists, or the receipt was
      // approved. Without that guard, an OCR-rejected receipt with the default
      // 0 would surface as "0.00 BGN cleared" — a lie about lifecycle.
      const receiptCashbackTrustworthy =
        tx.walletTransaction != null || tx.receipt?.status === 'APPROVED';
      const cashbackAmountResolved =
        tx.cashbackAmount ??
        (receiptCashbackTrustworthy ? tx.receipt?.cashbackAmount ?? null : null);
      const cashback = cashbackAmountResolved ?? 0;
      // Prefer the persisted marginAmount (written at transaction creation, immutable
      // to later rate changes). Fall back to runtime calculation for legacy rows.
      const margin = tx.marginAmount ??
        (partnerDiscountRate != null
          ? Math.round(((partnerDiscountRate / 100) * tx.amount - cashback) * 100) / 100
          : null);

      // Prefer the persisted Transaction.riskScore (spec §4.3 v1.1, written at
       // approval time). Fall back to the live max of receipt/stickerScan
       // fraudScores for legacy rows where the column is null.
      const riskScore = tx.riskScore ?? Math.round(
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
              cashbackStatus: tx.walletTransaction.cashbackStatus,
              cashbackExpiresAt: tx.walletTransaction.cashbackExpiresAt,
              cashbackPaidAt: tx.walletTransaction.cashbackPaidAt,
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
      const {
        walletTransaction: _wt,
        partner: _origPartner,
        venue: origVenue,
        amount,
        marginAmount,
        cashbackAmount: _cbAmount,
        discountAmount,
        finalAmount,
        netAmount,
        ...rest
      } = tx;
      // Strip venue.partner from the wire response — only the venue's id+name
      // belong on the row. The partner has been hoisted to the top-level
      // `partner` field via the fallback above.
      const venueOut = origVenue
        ? { id: origVenue.id, name: origVenue.name }
        : null;
      const partnerOut = effectivePartner
        ? {
            id: effectivePartner.id,
            businessName: effectivePartner.businessName,
            discountRate: effectivePartner.discountRate,
            partnerType: effectivePartner.partnerType,
          }
        : null;
      // Every money column on this row is denominated in the row's own
      // Transaction.currency, which is genuinely mixed — convert only the
      // BGN-denominated rows (BC-QA-031 — EUR-only responses). `currency` is
      // then relabelled 'EUR' so the row's amounts and its own label agree;
      // previously it passed through raw via `...rest`, so a converted EUR
      // amount could ship under a 'BGN' label.
      //
      // `margin` is DERIVED FIRST, THEN CONVERTED — not derived from the
      // converted inputs. It is computed above (see the `const margin` block)
      // from the raw stored `tx.amount` and raw `cashback`, and only the result
      // is passed through `toEurOrNull()` here. Because `bgnToEur()` is linear
      // the two orders agree in magnitude, but they are not identical: each
      // conversion rounds to 2dp, so convert-then-derive could differ from
      // derive-then-convert by a cent. Derive-then-convert is deliberate — it
      // keeps `margin` consistent with the persisted `tx.marginAmount` it falls
      // back to, which is itself stored in the row's currency.
      const rowCurrency = (rest as { currency?: string | null }).currency;
      return {
        ...rest,
        partner: partnerOut,
        venue: venueOut,
        currency: 'EUR',
        amount: toEur(amount, rowCurrency),
        marginAmount: toEurOrNull(marginAmount, rowCurrency),
        cashbackAmount: toEurOrNull(cashbackAmountResolved, rowCurrency),
        discountAmount: toEurOrNull(discountAmount, rowCurrency),
        finalAmount: toEurOrNull(finalAmount, rowCurrency),
        netAmount: toEurOrNull(netAmount, rowCurrency),
        margin: toEurOrNull(margin, rowCurrency),
        partnerDiscountRate,
        riskScore,
        cashbackStatus,
        // receiptApplicable distinguishes "no receipt uploaded yet" (true + null date)
        // from "receipt not part of this transaction type" (false + null date).
        // Also check tx.type directly: a PURCHASE transaction that exists before its
        // StickerScan record is linked (narrow creation window) would otherwise
        // report false — misleading the UI into hiding the "upload receipt" prompt.
        receiptApplicable: tx.type === 'PURCHASE' || tx.stickerScan != null || tx.receipt != null,
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
router.get('/business/stats', requirePermission('transactions.read'), async (req, res, next) => {
  try {
    const where = buildBusinessWhere(req.query);

    const [startOfToday, endOfToday] = getTodayBoundariesInSofia();

    // Strip top-level createdAt before composing today's window so the row is
    // bound by today's range only — not AND-stacked with the user's dateFrom/
    // dateTo which would force a row to satisfy BOTH (a row from yesterday
    // would be silently excluded from today's count when dateFrom=yesterday).
    // The user's dateFrom/dateTo still applies to the all-time aggregate via
    // `where`, which is the intended split: today vs total within the same scope.
    const { createdAt: _createdAtScoped, ...whereSansDate } = where as BusinessTxWhere & { createdAt?: unknown };
    void _createdAtScoped;
    const todayWhere: BusinessTxWhere = whereSansDate.AND
      ? { ...whereSansDate, AND: [...(whereSansDate.AND as BusinessTxWhere[]), { createdAt: { gte: startOfToday, lte: endOfToday } }] }
      : { ...whereSansDate, AND: [{ createdAt: { gte: startOfToday, lte: endOfToday } }] };

    const [agg, todayCount, fallbackAgg] = await Promise.all([
      // groupBy(['currency']) rather than a flat aggregate: Transaction.currency
      // is genuinely mixed, so a single `_sum.amount` would add BGN and EUR
      // magnitudes together before any conversion could run. `_avg` is dropped
      // for the same reason — an average across mixed units is meaningless — and
      // recomputed below from the converted total and the total row count
      // (BC-QA-031 — EUR-only responses).
      prisma.transaction.groupBy({
        by: ['currency'],
        where,
        _sum: { amount: true, cashbackAmount: true },
        _count: { _all: true },
      }),
      prisma.transaction.count({ where: todayWhere }),
      // Receipt-side fallback for the same total. Mirrors the row mapping in
      // /business: when Transaction.cashbackAmount is null but the receipt
      // is *trustworthy* (either a CASHBACK_CREDIT walletTransaction was
      // recorded, OR the receipt itself is APPROVED), surface
      // receipt.cashbackAmount. Without this the stats card understates
      // totalCashback vs. the visible row column.
      // Trustworthiness must mirror `receiptCashbackTrustworthy` in the row
      // mapper (line ~489); using only `receipt.status='APPROVED'` here
      // omits the walletTransaction-evidence branch and undercounts a row
      // whose receipt was reverted from APPROVED but already credited.
      //
      // The APPROVED check is placed at the receipt level directly (not via
      // receipt→transaction→receipt) to avoid a circular self-join for a 1:1
      // relation. The walletTransaction check stays at the transaction level.
      prisma.receipt.aggregate({
        where: {
          AND: [
            // Transaction-level base filters (active filter window + no persisted cashback)
            { transaction: {
                AND: [
                  where as BusinessTxWhere,
                  { cashbackAmount: null },
                ],
              },
            },
            // Trustworthiness: receipt is APPROVED (checked directly on the
            // Receipt row — no circular join) OR the transaction already has a
            // CASHBACK_CREDIT walletTransaction confirming the credit happened.
            {
              OR: [
                { status: 'APPROVED' },
                { transaction: { walletTransaction: { isNot: null } } },
              ],
            },
          ],
        },
        _sum: { cashbackAmount: true },
      }),
    ]);

    // Fold the per-currency subtotals into EUR totals (BC-QA-031 — EUR-only
    // responses). Each subtotal is converted according to its own currency
    // before being summed; see sumMixedCurrencyToEur.
    const count = agg.reduce((n, g) => n + g._count._all, 0);
    const totalVolumeEur = sumMixedCurrencyToEur(
      agg.map((g) => ({ currency: g.currency, amount: g._sum.amount })),
    );
    // averageValue is recomputed from the converted total rather than taken from
    // a DB `_avg`, which would have averaged across mixed currency units.
    const averageValueEur = count > 0 ? Math.round((totalVolumeEur / count) * 100) / 100 : 0;
    // Transaction.cashbackAmount rides the same row currency. The receipt-side
    // fallback has no currency column of its own (Receipt stores BGN), so it is
    // converted as BGN.
    const totalCashbackEur =
      sumMixedCurrencyToEur(agg.map((g) => ({ currency: g.currency, amount: g._sum.cashbackAmount }))) +
      bgnToEur(fallbackAgg._sum.cashbackAmount ?? 0);

    res.json({
      count,
      todayCount,
      totalVolume: totalVolumeEur,
      averageValue: averageValueEur,
      totalCashback: Math.round((totalCashbackEur + Number.EPSILON) * 100) / 100,
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
router.get('/business/partner-risk/:partnerId', requirePermission('transactions.read'), async (req, res, next) => {
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
