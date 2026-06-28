/**
 * Unit tests for resolvePayoutEligibility (src/services/payoutEligibility.service.ts).
 *
 * Invariants pinned:
 *
 *   §8.1.3 hard-block (mutation-kill target):
 *     When the user's LATEST subscription is FAILED_PAYMENT, eligible MUST be
 *     false even if an older ACTIVE subscription exists. The guard is the
 *     `!hasFailedPayment` term in `eligible: !hasFailedPayment && !!subscription`.
 *     A mutation that removes that term (e.g. `eligible: true && !!subscription`)
 *     causes test (a) to fail.
 *
 *   §8.1 happy-path: no FAILED_PAYMENT + ACTIVE → eligible: true.
 *
 *   No subscription at all → eligible: false (Step B finds nothing).
 *
 *   Plan/threshold resolution: returned `plan` matches the user's ACTIVE plan
 *   and `threshold` matches the BGN amount for that plan from the compile-time
 *   fallback constants (mocked payoutThreshold DB returns null → fallback).
 *
 * Mock strategy:
 *   - Prisma is module-mocked with a controlled `subscription.findFirst` that
 *     switches on query shape (the two calls differ: one is an unrestricted
 *     "latest-sub" query, the other has an OR status filter for eligibility).
 *   - `getPayoutThresholdBGN` from payoutThreshold utility is module-mocked so
 *     tests are not sensitive to DB state; each test sets the expected return.
 *   - No real DB, no real network, no side effects.
 */

// ─── Prisma mock — must be declared before imports ────────────────────────────
const subFindFirstMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    subscription: {
      findFirst: subFindFirstMock,
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─── payoutThreshold mock — avoids real DB hit in getPayoutThresholdBGN ───────
const getPayoutThresholdBGNMock = jest.fn<Promise<number>, [string]>();

jest.mock('../../src/utils/payoutThreshold', () => ({
  getPayoutThresholdBGN: (...args: [string]) => getPayoutThresholdBGNMock(...args),
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { resolvePayoutEligibility } from '../../src/services/payoutEligibility.service';

// ─── Test fixtures ─────────────────────────────────────────────────────────────
const USER_ID = 'user-test-001';
const NOW     = new Date('2026-06-28T12:00:00.000Z');

// Compile-time fallback thresholds (BGN) from receipt.constants.ts:
//   PREMIUM_WEEKLY  = 10 EUR × 1.95583 = 19.56 BGN
//   PREMIUM_MONTHLY = 15 EUR × 1.95583 = 29.34 BGN
//   BASIC           = 20 EUR × 1.95583 = 39.12 BGN
const THRESHOLD_PREMIUM_WEEKLY  = 19.56;
const THRESHOLD_PREMIUM_MONTHLY = 29.34;
const THRESHOLD_BASIC           = 39.12;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wire subFindFirstMock so the first call (unrestricted latest-sub lookup)
 * returns `latestSubRow` and the second call (OR-filtered eligible-sub lookup)
 * returns `eligibleSubRow`.
 *
 * The service issues exactly two findFirst calls per invocation:
 *   Call 1: `{ where: { userId }, orderBy: { createdAt: 'desc' } }` — no status filter.
 *   Call 2: `{ where: { userId, OR: [...] }, orderBy: { createdAt: 'desc' } }` — status-gated.
 *
 * We distinguish them by whether the args include an OR clause.
 */
function wireSubscriptionMocks(
  latestSubRow: { status: string; currentPeriodEnd?: Date } | null,
  eligibleSubRow: { plan: string } | null,
) {
  subFindFirstMock.mockImplementation(async (args: any) => {
    if (args?.where?.OR) {
      // Call 2: eligibility lookup
      return eligibleSubRow;
    }
    // Call 1: latest-sub lookup
    return latestSubRow;
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('resolvePayoutEligibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (a) §8.1.3 hard-block — mutation-kill test
  //
  // Scenario: latest sub = FAILED_PAYMENT (most recent by createdAt),
  //           older sub  = ACTIVE (still in paid period).
  //
  // Expected: eligible = false, hasFailedPayment = true.
  //
  // Mutation that this test kills:
  //   eligible: !hasFailedPayment && !!subscription   (correct)
  //   →
  //   eligible: true && !!subscription                (mutant — drops guard)
  //
  // Under the mutant, eligibleSubRow is non-null so !!subscription = true,
  // and eligible becomes true. This test asserts eligible is false, so it fails.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('(a) FAILED_PAYMENT hard-block (§8.1.3) — mutation-kill invariant', () => {
    it('returns eligible:false and hasFailedPayment:true when latest sub is FAILED_PAYMENT even though an older ACTIVE sub exists', async () => {
      wireSubscriptionMocks(
        // Latest sub (most recent by createdAt) — FAILED_PAYMENT
        { status: 'FAILED_PAYMENT', currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z') },
        // Older eligible sub still in period — the mutant would grant access via this row
        { plan: 'PREMIUM_WEEKLY' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      // The primary invariant: FAILED_PAYMENT hard-block must win
      expect(result.eligible).toBe(false);
      expect(result.hasFailedPayment).toBe(true);

      // plan/threshold are still resolved (callers may log/compare them)
      expect(result.plan).toBe('PREMIUM_WEEKLY');
      expect(result.threshold).toBe(THRESHOLD_PREMIUM_WEEKLY);
    });

    it('remains ineligible when latest sub is FAILED_PAYMENT and the eligible query also returns nothing', async () => {
      // Boundary: no eligible sub rows at all + failed payment — both guards fail.
      wireSubscriptionMocks(
        { status: 'FAILED_PAYMENT' },
        null, // no ACTIVE/TRIALING/in-period-CANCELLED row found
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.eligible).toBe(false);
      expect(result.hasFailedPayment).toBe(true);
      // Falls back to default plan when no eligible sub
      expect(result.plan).toBe('PREMIUM_WEEKLY');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (b) Happy path: no FAILED_PAYMENT + ACTIVE subscription
  // ─────────────────────────────────────────────────────────────────────────────
  describe('(b) Happy path — ACTIVE subscription, no failed payment', () => {
    it('returns eligible:true and hasFailedPayment:false for an ACTIVE subscription', async () => {
      wireSubscriptionMocks(
        { status: 'ACTIVE' },
        { plan: 'PREMIUM_WEEKLY' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.eligible).toBe(true);
      expect(result.hasFailedPayment).toBe(false);
      expect(result.plan).toBe('PREMIUM_WEEKLY');
      expect(result.threshold).toBe(THRESHOLD_PREMIUM_WEEKLY);
    });

    it('returns eligible:true for a TRIALING subscription', async () => {
      wireSubscriptionMocks(
        { status: 'TRIALING' },
        { plan: 'BASIC' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_BASIC);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.eligible).toBe(true);
      expect(result.hasFailedPayment).toBe(false);
      expect(result.plan).toBe('BASIC');
      expect(result.threshold).toBe(THRESHOLD_BASIC);
    });

    it('returns eligible:true for a CANCELLED subscription still within paid period', async () => {
      // CANCELLED but currentPeriodEnd is in the future → Step B finds it
      wireSubscriptionMocks(
        { status: 'CANCELLED', currentPeriodEnd: new Date('2026-07-15T00:00:00.000Z') },
        { plan: 'PREMIUM_MONTHLY' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_MONTHLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.eligible).toBe(true);
      expect(result.hasFailedPayment).toBe(false);
      expect(result.plan).toBe('PREMIUM_MONTHLY');
      expect(result.threshold).toBe(THRESHOLD_PREMIUM_MONTHLY);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (c) No subscription at all
  // ─────────────────────────────────────────────────────────────────────────────
  describe('(c) No subscription', () => {
    it('returns eligible:false when user has no subscription rows at all', async () => {
      wireSubscriptionMocks(null, null);
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.eligible).toBe(false);
      expect(result.hasFailedPayment).toBe(false);
      // Default plan fallback when no subscription
      expect(result.plan).toBe('PREMIUM_WEEKLY');
      expect(result.threshold).toBe(THRESHOLD_PREMIUM_WEEKLY);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // (d) Plan / threshold resolution
  // ─────────────────────────────────────────────────────────────────────────────
  describe('(d) Plan and threshold resolution', () => {
    it('resolves BASIC plan and its threshold when user has a BASIC ACTIVE subscription', async () => {
      wireSubscriptionMocks(
        { status: 'ACTIVE' },
        { plan: 'BASIC' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_BASIC);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.plan).toBe('BASIC');
      expect(result.threshold).toBe(THRESHOLD_BASIC);
      // getPayoutThresholdBGN was called with the resolved plan
      expect(getPayoutThresholdBGNMock).toHaveBeenCalledWith('BASIC');
    });

    it('resolves PREMIUM_MONTHLY plan and its threshold', async () => {
      wireSubscriptionMocks(
        { status: 'ACTIVE' },
        { plan: 'PREMIUM_MONTHLY' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_MONTHLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.plan).toBe('PREMIUM_MONTHLY');
      expect(result.threshold).toBe(THRESHOLD_PREMIUM_MONTHLY);
      expect(getPayoutThresholdBGNMock).toHaveBeenCalledWith('PREMIUM_MONTHLY');
    });

    it('falls back to PREMIUM_WEEKLY plan and its threshold when no eligible subscription exists', async () => {
      // No sub at all — plan defaults to 'PREMIUM_WEEKLY' (spec default)
      wireSubscriptionMocks(null, null);
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.plan).toBe('PREMIUM_WEEKLY');
      expect(result.threshold).toBe(THRESHOLD_PREMIUM_WEEKLY);
      expect(getPayoutThresholdBGNMock).toHaveBeenCalledWith('PREMIUM_WEEKLY');
    });

    it('calls getPayoutThresholdBGN exactly once per invocation', async () => {
      wireSubscriptionMocks(
        { status: 'ACTIVE' },
        { plan: 'PREMIUM_WEEKLY' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      await resolvePayoutEligibility(USER_ID, NOW);

      expect(getPayoutThresholdBGNMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Mutation-kill confirmation: exhaustive eligible=false guard check.
  //
  // These two tests together guarantee that removing either term from
  //   eligible: !hasFailedPayment && !!subscription
  // causes a test failure:
  //
  //   Dropping !hasFailedPayment → test (a) fails (hasFailedPayment=true → eligible stays true under mutant).
  //   Dropping !!subscription    → test below fails (no sub + no failed payment → eligible should be false).
  // ─────────────────────────────────────────────────────────────────────────────
  describe('mutation-kill: both terms of the eligibility guard are load-bearing', () => {
    it('eligible is false when subscription is null even though hasFailedPayment is false (kills !!subscription drop)', async () => {
      // No sub, no failed payment. Under a mutant that drops !!subscription:
      //   eligible: !hasFailedPayment         → !false = true (WRONG)
      // This test forces eligible to be false in that scenario.
      wireSubscriptionMocks(null, null);
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.hasFailedPayment).toBe(false);
      expect(result.eligible).toBe(false); // sub is null → must be ineligible
    });

    it('eligible is false when hasFailedPayment is true even though subscription is non-null (kills !hasFailedPayment drop)', async () => {
      // Failed payment + eligible sub present. Under a mutant that drops !hasFailedPayment:
      //   eligible: !!subscription             → !!{plan} = true (WRONG)
      // This is test (a) restated for clarity in the mutation-kill suite.
      wireSubscriptionMocks(
        { status: 'FAILED_PAYMENT' },
        { plan: 'PREMIUM_WEEKLY' },
      );
      getPayoutThresholdBGNMock.mockResolvedValue(THRESHOLD_PREMIUM_WEEKLY);

      const result = await resolvePayoutEligibility(USER_ID, NOW);

      expect(result.hasFailedPayment).toBe(true);
      expect(result.eligible).toBe(false); // guard must have fired
    });
  });
});
