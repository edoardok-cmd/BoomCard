/**
 * Unit test for the cashback expiry where-clause in jobs/scheduler.ts:expireWallet.
 *
 * Locks in the §4.4 / §6.1 v1.1 invariant that the expiry sweep must skip
 *   - LOCKED entries (committed to an in-flight payout — would double-decrement)
 *   - PAID entries  (terminal post-payout state — markPaid leaves
 *                    status=COMPLETED + cashbackExpiresAt set, so without
 *                    this filter the sweep would silently cancel a paid-out
 *                    row and erase the PAID audit trail).
 *
 * Prisma is mocked. The test captures the `where` argument passed to
 * `tx.walletTransaction.findMany` and asserts on the cashbackStatus filter.
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

describe('§4.4 v1.1 expireWallet — cashbackStatus exclusion filter', () => {
  beforeEach(() => {
    findManyMock.mockClear();
  });

  it('excludes both LOCKED and PAID entries from the expiry candidate query', async () => {
    await expireWallet('wallet-1', new Date());

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0][0];
    expect(args.where.cashbackStatus).toEqual({
      notIn: [CashbackEntryStatus.LOCKED, CashbackEntryStatus.PAID],
    });
  });

  it('still scopes the candidate query to COMPLETED CASHBACK_CREDIT past expiry', async () => {
    const now = new Date('2026-05-18T12:00:00Z');
    await expireWallet('wallet-2', now);

    const args = findManyMock.mock.calls[0][0];
    expect(args.where.walletId).toBe('wallet-2');
    expect(args.where.type).toBe('CASHBACK_CREDIT');
    expect(args.where.status).toBe('COMPLETED');
    expect(args.where.cashbackExpiresAt).toEqual({ lt: now });
  });
});
