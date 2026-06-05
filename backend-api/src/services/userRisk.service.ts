import { prisma } from '../lib/prisma';
import { RiskBucket } from '@prisma/client';

// Spec §4.1 + §7.2 — behaviour-based risk profile per subscriber.
// Rule-sum scorer (0-100). Buckets use the canonical RiskBucket ranges:
//   0-20  → LOW_0_20      (auto-approve)
//   21-50 → MEDIUM_21_50  (manual review)
//   51+   → HIGH_51_PLUS  (high risk)
//
// Each rule contributes a fixed score when its signal fires. The total is
// capped at 100. If new signals are added, keep the cap so a single
// catastrophic rule cannot single-handedly classify every account as HIGH.

const SCORE_CAP = 100;

const RULES = {
  // 3+ failed login attempts in the past 7 days
  RECENT_FAILED_LOGINS: 15,
  // IBAN was rotated within the past 7 days (cash-out fraud signal per §7.2)
  RECENT_IBAN_CHANGE: 10,
  // 10+ transactions in the trailing 24 hours
  HIGH_TX_FREQUENCY_24H: 25,
  // 1+ transactions failed in the past 30 days
  RECENT_FAILED_TX: 10,
  // Subscription is in PAST_DUE / UNPAID
  SUBSCRIPTION_DUE: 20,
  // 1+ open or in-review dispute against this user
  OPEN_DISPUTE: 30,
  // Account younger than 7 days with 3+ transactions already
  NEW_ACCOUNT_HIGH_VELOCITY: 20,
  // Spec §7.2 "Receipt match" — 3+ receipts in last 30d that scored above the
  // per-receipt review threshold (fraudScore >= 31, the same boundary as §7.1).
  // Rolls up transaction-level mismatches into the user profile.
  RECENT_RECEIPT_MISMATCHES: 15,
} as const;

// Per-receipt review threshold lifted from spec §7.1's review band (31-60).
// In spec terminology "транзакция" refers to a receipt-cashback claim under
// fraud review (Receipt.fraudScore), NOT the codebase's `Transaction` model
// (Stripe/Paysera charges). Same 31 boundary keeps the operator's mental model
// uniform across receipt review and the user-risk roll-up.
const RECEIPT_REVIEW_FRAUD_THRESHOLD = 31;

// Threshold for HIGH_TX_FREQUENCY_24H. Used both to fire the rule and to
// suppress NEW_ACCOUNT_HIGH_VELOCITY for the same user — keep them in lockstep
// (else a user with N tx in 24h could double-count both rules). Exported so
// tests assert against the constant rather than a string literal.
export const HIGH_TX_24H_THRESHOLD = 10;

// NOTE on thresholds: the canonical RiskBucket ranges (0-20 / 21-50 / 51+) are
// the source of truth, encoded directly in the RiskBucket enum names. Spec §4.1
// references user-level "Риск" without numeric bands, so we reuse these
// receipt-review boundaries here for UI consistency. If product later splits the
// two scales, change this function AND bucketLabel in the dashboards.
export function bucketFor(score: number): RiskBucket {
  if (score <= 20) return 'LOW_0_20';
  if (score <= 50) return 'MEDIUM_21_50';
  return 'HIGH_51_PLUS';
}

export interface RiskAssessment {
  userId: string;
  score: number;
  bucket: RiskBucket;
  reasons: string[];
}

interface UserSlice {
  id: string;
  createdAt: Date;
  ibanLastChangedAt: Date | null;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// Compute risk for a batch of users in O(rules) DB queries (not O(rules*users)).
// Used by the admin subscribers list to render fresh scores without per-row work.
export async function computeRiskForUsers(users: UserSlice[]): Promise<Map<string, RiskAssessment>> {
  const out = new Map<string, RiskAssessment>();
  if (users.length === 0) return out;

  const now = Date.now();
  const ids = users.map((u) => u.id);
  const sevenDaysAgo = new Date(now - SEVEN_DAYS);
  const oneDayAgo = new Date(now - ONE_DAY);
  const thirtyDaysAgo = new Date(now - THIRTY_DAYS);

  // Initialise every user with a 0/empty assessment so users without any
  // signals still get an explicit LOW bucket (not undefined).
  for (const u of users) {
    out.set(u.id, { userId: u.id, score: 0, bucket: 'LOW_0_20', reasons: [] });
  }

  // Rule batches — one groupBy per rule across the input set.
  const [failedLogins, txCounts24h, failedTx30d, dueSubs, openDisputes, totalTx, recentReceiptMismatches] =
    await Promise.all([
      prisma.loginHistory.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, success: false, createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, createdAt: { gte: oneDayAgo } },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'FAILED', createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: { in: ['PAST_DUE', 'UNPAID'] } },
        _count: { _all: true },
      }),
      prisma.dispute.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: { in: ['OPEN', 'IN_REVIEW'] } },
        _count: { _all: true },
      }),
      prisma.transaction.groupBy({
        by: ['userId'],
        where: { userId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.receipt.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          fraudScore: { gte: RECEIPT_REVIEW_FRAUD_THRESHOLD },
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: { _all: true },
      }),
    ]);

  const apply = (userId: string, points: number, reason: string) => {
    const a = out.get(userId);
    if (!a) return;
    a.score = Math.min(SCORE_CAP, a.score + points);
    a.reasons.push(reason);
  };

  for (const r of failedLogins) {
    if (r._count._all >= 3) apply(r.userId, RULES.RECENT_FAILED_LOGINS, '3+ failed logins / 7d');
  }
  for (const r of txCounts24h) {
    if (r._count._all >= HIGH_TX_24H_THRESHOLD) {
      apply(r.userId, RULES.HIGH_TX_FREQUENCY_24H, `${HIGH_TX_24H_THRESHOLD}+ transactions / 24h`);
    }
  }
  for (const r of failedTx30d) {
    if (r._count._all >= 1) apply(r.userId, RULES.RECENT_FAILED_TX, 'failed transactions / 30d');
  }
  for (const r of dueSubs) {
    if (r._count._all >= 1) apply(r.userId, RULES.SUBSCRIPTION_DUE, 'subscription past due / unpaid');
  }
  for (const r of openDisputes) {
    if (r._count._all >= 1) apply(r.userId, RULES.OPEN_DISPUTE, 'open dispute against user');
  }
  for (const r of recentReceiptMismatches) {
    if (r._count._all >= 3) apply(r.userId, RULES.RECENT_RECEIPT_MISMATCHES, '3+ flagged receipts / 30d');
  }

  // Track which users already triggered HIGH_TX_FREQUENCY_24H so we don't
  // double-count them under NEW_ACCOUNT_HIGH_VELOCITY (a new-account 24h burst
  // satisfies both rules, but they describe the same underlying signal).
  const fired24hFreq = new Set(
    txCounts24h.filter((r) => r._count._all >= HIGH_TX_24H_THRESHOLD).map((r) => r.userId),
  );

  const txTotalByUser = new Map(totalTx.map((r) => [r.userId, r._count._all]));
  for (const u of users) {
    if (u.ibanLastChangedAt && now - u.ibanLastChangedAt.getTime() < SEVEN_DAYS) {
      apply(u.id, RULES.RECENT_IBAN_CHANGE, 'IBAN changed / 7d');
    }
    const accountAgeMs = now - u.createdAt.getTime();
    const txCount = txTotalByUser.get(u.id) ?? 0;
    if (accountAgeMs < SEVEN_DAYS && txCount >= 3 && !fired24hFreq.has(u.id)) {
      apply(u.id, RULES.NEW_ACCOUNT_HIGH_VELOCITY, 'new account, 3+ transactions');
    }
  }

  for (const a of out.values()) {
    a.bucket = bucketFor(a.score);
  }

  return out;
}

// Persist a freshly computed batch back to User rows. Independent updates
// (one per user) — NOT wrapped in $transaction: there is no atomicity
// requirement and bundling them serializes lock acquisition across users in
// undefined order, which deadlocks under concurrent admin viewing.
//
// Each update is guarded by a `where` clause that only matches rows whose
// stored riskScore/riskBucket differs from the freshly computed value, so
// no-op pages don't write at all. Failures are isolated per row.
//
// Concurrency is capped at PERSIST_CONCURRENCY (default 10) so the daily
// 200-row sweep doesn't saturate the Prisma connection pool at 04:00.

// Minimum score that keeps a user in the HIGH bucket (spec §7.1 boundary: 61+).
// Used as the RISK_HOLD floor: a user with an open RISK_HOLD payout must not be
// downgraded below HIGH by periodic recomputes (spec §3.7 / FIX-B).
const RISK_HOLD_FLOOR_SCORE = 61;

const PERSIST_CONCURRENCY = 10;

export async function persistRiskAssessments(assessments: RiskAssessment[]): Promise<void> {
  if (assessments.length === 0) return;

  // Look up which users in this batch currently have at least one RISK_HOLD payout.
  // A single IN-query across the whole batch is cheaper than per-user lookups and
  // avoids inflating the concurrency cap with extra DB round-trips.
  const userIds = assessments.map((a) => a.userId);
  const riskHoldWallets = await prisma.walletTransaction.findMany({
    where: {
      type: 'WITHDRAWAL',
      status: 'RISK_HOLD',
      wallet: { userId: { in: userIds } },
    },
    select: { wallet: { select: { userId: true } } },
  }).catch(() => [] as Array<{ wallet: { userId: string } }>);

  const usersWithRiskHold = new Set(riskHoldWallets.map((r) => r.wallet.userId));

  // Apply RISK_HOLD floor: if the live-signal score is below the HIGH boundary
  // but the user has an open RISK_HOLD payout, clamp to RISK_HOLD_FLOOR_SCORE.
  const floored = assessments.map((a) => {
    if (usersWithRiskHold.has(a.userId) && a.score < RISK_HOLD_FLOOR_SCORE) {
      return { ...a, score: RISK_HOLD_FLOOR_SCORE, bucket: 'HIGH_51_PLUS' as RiskBucket };
    }
    return a;
  });

  for (let i = 0; i < floored.length; i += PERSIST_CONCURRENCY) {
    const chunk = floored.slice(i, i + PERSIST_CONCURRENCY);
    await Promise.all(
      chunk.map((a) =>
        prisma.user
          .updateMany({
            where: {
              id: a.userId,
              // Why three clauses, not two: Prisma's `{ field: { not: X } }` over
              // a nullable scalar produces SQL `field <> X`, which evaluates to
              // NULL (not TRUE) when the stored value is NULL. Without the third
              // clause, a freshly migrated user with riskBucket=NULL never matches
              // the where, so the bucket stays NULL forever even though score=0
              // and bucket='LOW_0_20' were computed. The explicit `riskBucket: null`
              // covers the NULL-stored case.
              OR: [
                { riskScore: { not: a.score } },
                { riskBucket: { not: a.bucket } },
                { riskBucket: null },
              ],
            },
            data: { riskScore: a.score, riskBucket: a.bucket },
          })
          .catch(() => undefined),
      ),
    );
  }
}
