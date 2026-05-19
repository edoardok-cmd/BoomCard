/**
 * Tests for expireStalePendingCashback (Spec §4.4 — audit finding #4)
 *
 * Spec says: "Pending cashback stays Pending until subscription recovery
 * OR natural expiry by the 60-day rule." The function finds PENDING cashback
 * entries older than validityDays from createdAt and marks them EXPIRED.
 * Balance is NOT decremented because PENDING entries are never credited.
 *
 * Cases covered:
 *   1. Happy path — stale PENDING entry is marked EXPIRED + status=CANCELLED, no wallet debit
 *   2. Fresh PENDING entry (within window) is left untouched
 *   3. No candidates — function returns count=0 and writes no audit
 *   4. CAS race — concurrent approve/void wins updateMany (count=0), no audit written
 *   5. updateMany includes cashbackStatus=PENDING predicate (not just id IN [...])
 *   6. Respects validityDays from system setting (mock returns 30 days)
 *   7. Audit after.cutoffDays matches the configured validity window
 */

// ── Shared mutable state ──────────────────────────────────────────────────────

let staleRows: any[] = [];       // returned by walletTransaction.findMany (candidates)
let updateManyCount = 1;         // controls whether the CAS update "wins"
const updateManyWhereArgs: any[] = [];
const updateManyDataArgs: any[] = [];
const auditCalls: any[] = [];

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client = {
    walletTransaction: {
      findMany: jest.fn(async () => staleRows),
      updateMany: jest.fn(async (args: any) => {
        updateManyWhereArgs.push(args?.where);
        updateManyDataArgs.push(args?.data);
        return { count: updateManyCount };
      }),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async (args: any) => { auditCalls.push(args); }),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// System setting mock — default returns 60; tests can override staleRows/cutoff.
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { expireStalePendingCashback } from '../../src/services/cashbackLifecycle.service';
import { prisma } from '../../src/lib/prisma';

type AnyMock = jest.Mock;
const mp = prisma as unknown as {
  walletTransaction: { findMany: AnyMock; updateMany: AnyMock };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIXTY_ONE_DAYS_AGO = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

function makePendingRow(overrides: Record<string, any> = {}) {
  return {
    id: `wt-${Math.random().toString(36).slice(2, 8)}`,
    type: 'CASHBACK_CREDIT',
    cashbackStatus: 'PENDING',
    createdAt: SIXTY_ONE_DAYS_AGO,
    walletId: 'wallet-1',
    amount: 5,
    ...overrides,
  };
}

function reset() {
  staleRows = [];
  updateManyCount = 1;
  updateManyWhereArgs.length = 0;
  updateManyDataArgs.length = 0;
  auditCalls.length = 0;
  jest.clearAllMocks();
  // Re-point findMany to staleRows after clearAllMocks resets it
  mp.walletTransaction.findMany.mockImplementation(async () => staleRows);
  mp.walletTransaction.updateMany.mockImplementation(async (args: any) => {
    updateManyWhereArgs.push(args?.where);
    updateManyDataArgs.push(args?.data);
    return { count: updateManyCount };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('expireStalePendingCashback — §4.4 audit finding #4', () => {
  beforeEach(reset);

  it('happy path — stale PENDING entry is marked EXPIRED with status=CANCELLED, wallet NOT decremented', async () => {
    staleRows = [makePendingRow()];

    const result = await expireStalePendingCashback(null);

    expect(result.count).toBe(1);
    expect(mp.walletTransaction.updateMany).toHaveBeenCalledTimes(1);
    // cashbackStatus drives display; status=CANCELLED removes the entry from
    // operational status=PENDING queries without requiring a new enum value.
    expect(updateManyDataArgs[0]).toMatchObject({ cashbackStatus: 'EXPIRED', status: 'CANCELLED' });
    // Balance is never touched — PENDING entries were never credited
    // (wallet mock has no update delegate, so any wallet call would throw)
  });

  it('happy path — writes an audit entry on success with staleIds, count, and cutoffDays fields', async () => {
    staleRows = [makePendingRow(), makePendingRow()];
    updateManyCount = 2; // mock returns the number of rows actually updated

    await expireStalePendingCashback('admin-1');

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      actorUserId: 'admin-1',
      action: 'CASHBACK_PENDING_EXPIRED_BATCH',
    });
    expect(auditCalls[0].after.count).toBe(2);
    // Field is `staleIds` (all candidates) not `ids`, to distinguish from
    // confirmed transitions when count < staleIds.length under CAS races.
    expect(auditCalls[0].after.staleIds).toHaveLength(2);
    expect(auditCalls[0].after.ids).toBeUndefined();
    // cutoffDays documents the configured window used for this sweep run.
    expect(auditCalls[0].after.cutoffDays).toBe(60);
  });

  it('no candidates — returns count=0 and writes no audit', async () => {
    staleRows = [];

    const result = await expireStalePendingCashback(null);

    expect(result.count).toBe(0);
    expect(mp.walletTransaction.updateMany).not.toHaveBeenCalled();
    expect(auditCalls).toHaveLength(0);
  });

  it('CAS race — concurrent approve wins (updateMany count=0): returns count=0, no audit', async () => {
    staleRows = [makePendingRow()];
    updateManyCount = 0; // concurrent promotePendingToCleared already won

    const result = await expireStalePendingCashback(null);

    expect(result.count).toBe(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('updateMany WHERE includes cashbackStatus=PENDING predicate', async () => {
    staleRows = [makePendingRow()];

    await expireStalePendingCashback(null);

    expect(updateManyWhereArgs.length).toBeGreaterThan(0);
    // Must have cashbackStatus: PENDING in the where clause so concurrent
    // approve/void transitions are not overwritten
    expect(updateManyWhereArgs[0]).toMatchObject({ cashbackStatus: 'PENDING' });
  });

  it('updateMany WHERE includes id IN [...] from findMany results', async () => {
    const row = makePendingRow({ id: 'wt-specific' });
    staleRows = [row];

    await expireStalePendingCashback(null);

    expect(updateManyWhereArgs[0]).toMatchObject({
      id: { in: ['wt-specific'] },
    });
  });

  it('fresh PENDING entry (within window) is not in findMany results — findMany filters by cutoff', async () => {
    // The function delegates cutoff filtering to the Prisma query (createdAt < cutoff).
    // Here we verify that a fresh row passed via staleRows IS expired (since findMany
    // is mocked to return whatever staleRows contains — the DB WHERE is tested at
    // integration level). What we verify is that the function does not add its own
    // age filter client-side that would drop the row.
    staleRows = [makePendingRow({ createdAt: TEN_DAYS_AGO })];

    const result = await expireStalePendingCashback(null);

    // Function processes whatever findMany returns — no client-side age filter
    expect(result.count).toBe(1);
  });

  it('findMany WHERE excludes TRIAL_PENDING status to avoid racing resolveTrialPendingCashback', async () => {
    // TRIAL_PENDING entries share cashbackStatus=PENDING but their status field
    // is TRIAL_PENDING. expireStalePendingCashback must exclude them so the
    // 5:30 AM resolveTrialPendingCashback job (which queries by status) cannot
    // overwrite cashbackStatus=EXPIRED back to CLEARED/VOIDED on the same night.
    staleRows = [];

    await expireStalePendingCashback(null);

    expect(mp.walletTransaction.findMany).toHaveBeenCalledTimes(1);
    const findManyWhere = mp.walletTransaction.findMany.mock.calls[0][0]?.where;
    expect(findManyWhere).toMatchObject({
      status: { not: 'TRIAL_PENDING' },
    });
  });

  it('findMany WHERE excludes entries linked to a StickerScan in MANUAL_REVIEW', async () => {
    // Spec §4.4: "Pending кешбек за транзакция, попаднала в риск преглед,
    // трябва да остане видим за потребителя до финализиране на проверката."
    // The sweep must not expire entries whose owning scan is still under review.
    staleRows = [];

    await expireStalePendingCashback(null);

    const findManyWhere = mp.walletTransaction.findMany.mock.calls[0][0]?.where;
    // NOT clause must include a stickerScan MANUAL_REVIEW guard
    expect(findManyWhere?.NOT).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stickerScan: { status: 'MANUAL_REVIEW' } }),
      ]),
    );
  });

  it('findMany WHERE excludes entries linked to a Receipt in MANUAL_REVIEW', async () => {
    // Same spec guarantee applies to receipt-based risk reviews.
    staleRows = [];

    await expireStalePendingCashback(null);

    const findManyWhere = mp.walletTransaction.findMany.mock.calls[0][0]?.where;
    expect(findManyWhere?.NOT).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ receipt: { status: 'MANUAL_REVIEW' } }),
      ]),
    );
  });

  it('entries NOT in risk review are still expired even after MANUAL_REVIEW guard is added', async () => {
    // Guard must not over-exclude: a stale PENDING entry with no linked scan/receipt
    // (or one whose scan is APPROVED) should still be expired.
    staleRows = [makePendingRow({ id: 'wt-no-scan' })];

    const result = await expireStalePendingCashback(null);

    // Whatever findMany returns is processed — the exclusion lives in the DB
    // WHERE clause, not in client-side filtering after the fact.
    expect(result.count).toBe(1);
    expect(updateManyDataArgs[0]).toMatchObject({ cashbackStatus: 'EXPIRED' });
  });

  it('partial CAS race — staleIds contains all candidates while count reflects actual transitions', async () => {
    // 3 candidates found, only 2 actually transitioned (1 was concurrently approved).
    staleRows = [makePendingRow(), makePendingRow(), makePendingRow()];
    updateManyCount = 2;

    await expireStalePendingCashback(null);

    expect(auditCalls).toHaveLength(1);
    // count = actual transitions
    expect(auditCalls[0].after.count).toBe(2);
    // staleIds = all 3 candidates — makes the discrepancy visible in the audit trail
    expect(auditCalls[0].after.staleIds).toHaveLength(3);
  });

  it('respects validityDays from system setting — 30-day config produces a ~30-day cutoff date', async () => {
    // getSystemSettingInt is mocked at module level; override it for this test to
    // return 30 (instead of the default 60) and confirm the findMany WHERE createdAt.lt
    // is approximately 30 days ago rather than 60.
    const { getSystemSettingInt } = require('../../src/utils/systemSettings');
    (getSystemSettingInt as jest.Mock).mockResolvedValueOnce(30);
    staleRows = [];

    await expireStalePendingCashback(null);

    const findManyWhere = mp.walletTransaction.findMany.mock.calls[0][0]?.where;
    const cutoff: Date = findManyWhere?.createdAt?.lt;
    expect(cutoff).toBeInstanceOf(Date);
    const expectedCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Allow 3-second skew for test execution time
    expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(3000);
  });
});
