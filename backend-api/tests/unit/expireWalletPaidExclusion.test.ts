/**
 * Unit tests for the cashback expiry where-clause in jobs/scheduler.ts:expireWallet.
 *
 * Locks in the §4.4 / §6.1 v1.1 invariant that the expiry sweep must:
 *   - Skip LOCKED entries (committed to an in-flight payout — would double-decrement)
 *   - Skip PAID entries  (terminal post-payout state — markPaid leaves
 *                         status=COMPLETED + cashbackExpiresAt set, so without
 *                         this filter the sweep would silently cancel a paid-out
 *                         row and erase the PAID audit trail)
 *   - INCLUDE null-status entries (legacy pre-lifecycle-column rows).
 *     SQL `NOT IN (...)` does not match NULL — an explicit OR branch is the
 *     only way to include them. Without it, the notification job warns users
 *     about expiry that the sweep never actually performs (ghost warnings).
 *
 * Prisma is mocked. The test captures the `where` argument passed to
 * `tx.walletTransaction.findMany` and asserts on the cashbackStatus filter shape.
 */

const findManyMock = jest.fn(async (_args: any) => [] as any[]);

jest.mock('../../src/lib/prisma', () => {
  const txDelegate = {
    walletTransaction: { findMany: findManyMock },
    wallet: { findUniqueOrThrow: jest.fn() },
    $queryRaw: jest.fn(async () => []),
  };
  const client = {
    $transaction: jest.fn(async (cb: any) => cb(txDelegate)),
  };
  return { __esModule: true, default: client, prisma: client };
});

import { expireWallet } from '../../src/jobs/scheduler';
import { CashbackEntryStatus } from '@prisma/client';

describe('§4.4 v1.1 expireWallet — cashbackStatus filter (OR clause)', () => {
  beforeEach(() => {
    findManyMock.mockClear();
  });

  it('uses an OR clause (not a bare notIn) so null-status entries are included', async () => {
    await expireWallet('wallet-1', new Date());

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0][0];

    // The top-level where must NOT have a bare cashbackStatus key — that would
    // exclude null entries via SQL NOT IN semantics.
    expect(args.where.cashbackStatus).toBeUndefined();

    // Must use an OR branch instead.
    expect(args.where.OR).toBeDefined();
    expect(Array.isArray(args.where.OR)).toBe(true);
  });

  it('OR clause contains a notIn branch that excludes LOCKED and PAID', async () => {
    await expireWallet('wallet-1', new Date());

    const { OR } = findManyMock.mock.calls[0][0].where as { OR: any[] };
    const notInBranch = OR.find((b: any) => b.cashbackStatus?.notIn);
    expect(notInBranch).toBeDefined();
    expect(notInBranch.cashbackStatus.notIn).toContain(CashbackEntryStatus.LOCKED);
    expect(notInBranch.cashbackStatus.notIn).toContain(CashbackEntryStatus.PAID);
  });

  it('OR clause contains a null branch to catch legacy pre-lifecycle-column entries', async () => {
    await expireWallet('wallet-1', new Date());

    const { OR } = findManyMock.mock.calls[0][0].where as { OR: any[] };
    const nullBranch = OR.find((b: any) => b.cashbackStatus === null);
    expect(nullBranch).toBeDefined();
  });

  it('OR clause does not accidentally include LOCKED entries via the null branch', async () => {
    await expireWallet('wallet-1', new Date());

    const { OR } = findManyMock.mock.calls[0][0].where as { OR: any[] };
    // Confirm there is no branch that would match LOCKED
    const lockedBranch = OR.find(
      (b: any) => b.cashbackStatus === CashbackEntryStatus.LOCKED ||
                  b.cashbackStatus?.in?.includes(CashbackEntryStatus.LOCKED),
    );
    expect(lockedBranch).toBeUndefined();
  });

  it('still scopes the candidate query to COMPLETED CASHBACK_CREDIT past expiry', async () => {
    const now = new Date('2026-05-19T12:00:00Z');
    await expireWallet('wallet-2', now);

    const args = findManyMock.mock.calls[0][0];
    expect(args.where.walletId).toBe('wallet-2');
    expect(args.where.type).toBe('CASHBACK_CREDIT');
    expect(args.where.status).toBe('COMPLETED');
    expect(args.where.cashbackExpiresAt).toEqual({ lt: now });
  });
});
