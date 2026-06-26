import { prisma } from '../lib/prisma';
import { RiskBucket } from '@prisma/client';

// Spec §2.1 — canonical five-signal risk profile per subscriber.
// Additive rule-sum scorer (0-120). Buckets use the canonical RiskBucket ranges:
//   0-20  → LOW_0_20      (auto-approve)
//   21-50 → MEDIUM_21_50  (auto-approve — per spec §2.2/§3.4 amendment 2026-06-24:
//                          Medium no longer enters mandatory manual review;
//                          only High (51+) does)
//   51+   → HIGH_51_PLUS  (high risk — mandatory manual review)
//
// BC-CASHBACK-RISK FIX 2: the previous implementation used a divergent set of
// behaviour signals (failed logins, tx frequency, disputes, subscription dunning,
// new-account velocity, receipt fraudScore roll-up) with non-spec weights. Those
// are NOT the spec §2.1 canonical set. This module now implements the five
// canonical signals with the spec additive weights, mirroring the per-record
// scorer in fraudDetection.service.ts::computeSpecRiskLevel so the per-user
// roll-up and the per-record gate agree.
//
// The total is capped at 120 to match the additive maximum of the five spec weights
// (IBAN +40, receipt +30, QR +20, voided +20, partner +10 = 120).

const SCORE_CAP = 120;

// Spec §2.1 additive weights (identical to fraudDetection.service.ts constants).
const RULES = {
  // Signal 1 — IBAN changed in the last 24h.
  IBAN_CHANGED_24H: 40,
  // Signal 2 — at least one receipt with OCR match confidence < 60%.
  RECEIPT_MATCH_LOW_CONFIDENCE: 30,
  // Signal 3 — at least one QR location mismatch on a recent scan.
  QR_LOCATION_MISMATCH: 20,
  // Signal 4 — user has 3 or more Voided cashback records.
  USER_HAS_3_PLUS_VOIDED: 20,
  // Signal 5 — user transacted at a partner carrying an active risk flag.
  PARTNER_ACTIVE_RISK_FLAG: 10,
} as const;

// Signal 2 boundary: OCR match confidence below 60% fires the +30 signal
// (spec §2.1 "Receipt match confidence < 60%"). Receipt.ocrConfidence is stored
// as a 0–100 percentage.
const RECEIPT_MATCH_CONFIDENCE_THRESHOLD = 60;

// Signal 3 marker: the per-scan fraud detector (fraudDetection.service.ts) writes
// 'LOCATION_MISMATCH' into StickerScan.fraudReasons when GPS distance exceeds the
// venue radius. We roll that up to the user here rather than recomputing Haversine.
const LOCATION_MISMATCH_REASON = 'LOCATION_MISMATCH';

// Signal 1 window: IBAN change must be within the trailing 24 hours (spec §2.1),
// NOT the previous 7-day window.
const IBAN_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  /** Retained for caller-signature compatibility; no longer used by the spec §2.1 signals. */
  createdAt?: Date;
  ibanLastChangedAt: Date | null;
}

// Lookback window for the receipt-confidence and location-mismatch signals.
// Spec §2.1 frames both as "recent" without a fixed window; we use 30 days so a
// single stale event doesn't pin a user at risk forever. Tune here if product
// fixes a window.
const SIGNAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

// Compute risk for a batch of users in O(signals) DB queries (not O(signals*users)).
// Used by the admin subscribers list to render fresh scores without per-row work.
//
// Signal → data source mapping (spec §2.1):
//   1. IBAN change 24h (+40)        ← User.ibanLastChangedAt (passed in via UserSlice)
//   2. Receipt confidence <60% (+30)← Receipt.ocrConfidence (DATA SOURCE: present)
//   3. QR location mismatch (+20)   ← StickerScan.fraudReasons contains 'LOCATION_MISMATCH'
//   4. 3+ Voided records (+20)      ← WalletTransaction.cashbackStatus = VOIDED
//   5. Partner active risk flag (+10)← StickerScan.venue.partner.hasRiskFlag = true
export async function computeRiskForUsers(users: UserSlice[]): Promise<Map<string, RiskAssessment>> {
  const out = new Map<string, RiskAssessment>();
  if (users.length === 0) return out;

  const now = Date.now();
  const ids = users.map((u) => u.id);
  const lookbackFrom = new Date(now - SIGNAL_LOOKBACK_MS);

  // Initialise every user with a 0/empty assessment so users without any
  // signals still get an explicit LOW bucket (not undefined).
  for (const u of users) {
    out.set(u.id, { userId: u.id, score: 0, bucket: 'LOW_0_20', reasons: [] });
  }

  // Signal batches — one grouped query per signal across the input set.
  const [lowConfidenceReceipts, locationMismatchScans, voidedCounts, partnerFlaggedScans] =
    await Promise.all([
      // Signal 2: users with at least one recent receipt below the confidence threshold.
      prisma.receipt.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          ocrConfidence: { lt: RECEIPT_MATCH_CONFIDENCE_THRESHOLD },
          createdAt: { gte: lookbackFrom },
        },
        _count: { _all: true },
      }),
      // Signal 3: users with at least one recent scan flagged for QR location mismatch.
      prisma.stickerScan.groupBy({
        by: ['userId'],
        where: {
          userId: { in: ids },
          fraudReasons: { has: LOCATION_MISMATCH_REASON },
          createdAt: { gte: lookbackFrom },
        },
        _count: { _all: true },
      }),
      // Signal 4: count of Voided cashback records per USER (3+ across all wallets fires).
      // BC-ADMIN-AUDIT-FIX-002 DEFECT C: spec §2.1 defines as per-user (sum across wallets),
      // not per-wallet. Groupby walletId (scalar field), then map walletId→userId via
      // secondary wallet lookup. This allows a user with 2 voided in wallet A + 1 in
      // wallet B = 3 total and fires. Matches fraudDetection.service.ts logic.
      (async () => {
        const voidedByWallet = await prisma.walletTransaction.groupBy({
          by: ['walletId'],
          where: {
            cashbackStatus: 'VOIDED',
            wallet: { userId: { in: ids } },
          },
          _count: { _all: true },
        });

        if (voidedByWallet.length === 0) return [];

        // Map walletIds back to userIds via a single wallet lookup.
        const walletIds = voidedByWallet.map((r) => r.walletId);
        const wallets = await prisma.wallet.findMany({
          where: { id: { in: walletIds } },
          select: { id: true, userId: true },
        });

        const walletIdToUserId = new Map(wallets.map((w) => [w.id, w.userId]));

        // Aggregate counts per userId (sum across all wallets for each user).
        const voidedByUser = new Map<string, number>();
        for (const row of voidedByWallet) {
          const userId = walletIdToUserId.get(row.walletId);
          if (userId) {
            voidedByUser.set(userId, (voidedByUser.get(userId) ?? 0) + row._count._all);
          }
        }

        // Return in the same format as other groupBy queries for consistency.
        return Array.from(voidedByUser.entries()).map(([userId, count]) => ({
          userId,
          _count: { _all: count },
        }));
      })(),
      // Signal 5: users who scanned at a venue whose partner has an active risk flag.
      // BC-ADMIN-AUDIT-FIX-002 DEFECT D: added createdAt filter (30-day window) for
      // consistency with Signals 2 & 3. Prevents a single historic scan at a now-flagged
      // partner from pinning a user at +10 forever.
      prisma.stickerScan.findMany({
        where: {
          userId: { in: ids },
          venue: { partner: { hasRiskFlag: true } },
          createdAt: { gte: lookbackFrom },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

  const apply = (userId: string, points: number, reason: string) => {
    const a = out.get(userId);
    if (!a) return;
    a.score = Math.min(SCORE_CAP, a.score + points);
    a.reasons.push(reason);
  };

  // Signal 1: IBAN changed within the last 24h.
  for (const u of users) {
    if (u.ibanLastChangedAt && now - u.ibanLastChangedAt.getTime() < IBAN_CHANGE_WINDOW_MS) {
      apply(u.id, RULES.IBAN_CHANGED_24H, 'IBAN changed / 24h');
    }
  }

  // Signal 2: receipt match confidence < 60%.
  for (const r of lowConfidenceReceipts) {
    if (r._count._all >= 1) {
      apply(r.userId, RULES.RECEIPT_MATCH_LOW_CONFIDENCE, 'receipt match confidence < 60%');
    }
  }

  // Signal 3: QR location mismatch.
  for (const r of locationMismatchScans) {
    if (r._count._all >= 1) {
      apply(r.userId, RULES.QR_LOCATION_MISMATCH, 'QR location mismatch');
    }
  }

  // Signal 4: 3+ Voided records (per user, summed across all wallets).
  // BC-ADMIN-AUDIT-FIX-002 DEFECT C: groupBy by walletId (scalar), then aggregate
  // counts per userId via secondary wallet lookup. A user with voided records across
  // multiple wallets has counts summed and fires if total >= 3.
  for (const r of voidedCounts) {
    if (r._count._all >= 3) {
      apply(r.userId, RULES.USER_HAS_3_PLUS_VOIDED, '3+ voided cashback records');
    }
  }

  // Signal 5: partner active risk flag.
  for (const s of partnerFlaggedScans) {
    apply(s.userId, RULES.PARTNER_ACTIVE_RISK_FLAG, 'partner has active risk flag');
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

// Minimum score that keeps a user in the HIGH bucket. Canonical HIGH threshold
// is 51+ (spec §2.1 / Clash 5.1: 0–20 Low, 21–50 Medium, 51+ High) — used
// everywhere else in the codebase. L2 fix: the previous value 61 cited a
// non-existent "spec §7.1 boundary: 61+"; aligned to 51 to match the canonical
// HIGH floor. The clamp pairs this score with the HIGH_51_PLUS bucket below, so
// 51 is the correct lowest score that still lands the user in HIGH.
// Used as the RISK_HOLD floor: a user with an open RISK_HOLD payout must not be
// downgraded below HIGH by periodic recomputes (spec §3.7 / FIX-B).
export const RISK_HOLD_FLOOR_SCORE = 51;

const PERSIST_CONCURRENCY = 10;

export async function persistRiskAssessments(assessments: RiskAssessment[]): Promise<void> {
  if (assessments.length === 0) return;

  // Look up which users in this batch currently have at least one RISK_HOLD payout.
  // A single IN-query across the whole batch is cheaper than per-user lookups and
  // avoids inflating the concurrency cap with extra DB round-trips.
  const userIds = assessments.map((a) => a.userId);

  // M1 — admin manual risk edits are durable. Users with riskOverriddenAt set have
  // had their riskScore/riskBucket edited by an admin (PATCH /subscribers/:id/profile);
  // the behaviour recompute MUST NOT overwrite that. Look up the overridden subset in
  // one IN-query (mirroring the RISK_HOLD batch-lookup just below) and filter them out
  // of the update batch entirely, so the stored override is left untouched.
  const overriddenRows = await prisma.user.findMany({
    where: { id: { in: userIds }, riskOverriddenAt: { not: null } },
    select: { id: true },
  }).catch(() => [] as Array<{ id: string }>);
  const overriddenUserIds = new Set(overriddenRows.map((r) => r.id));

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
  // M1: drop admin-overridden users first so neither the floor nor the recompute
  // touches their stored values — the manual edit is authoritative until cleared.
  const floored = assessments
    .filter((a) => !overriddenUserIds.has(a.userId))
    .map((a) => {
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
