/**
 * BC-QA-031-FOLLOWUP-1 task-r1 F1 + F2 — money AGGREGATES and the guard's HTTP surface.
 *
 * F1: the code-level rounds made every ROW read currency-honest and left every
 * `WalletTransaction` AGGREGATE summing the mixed column flat and dividing the
 * whole thing by the BGN peg. Measured live by the task-level reviewer, with
 * stored rows `195.58 BGN + 19.56 BGN + 50 USD + 40 EUR`:
 *
 *   GET /api/wallet/statistics        -> {"totalTopups":156.02, …, "currency":"EUR"}
 *   GET /api/admin/transactions/stats -> {"totalVolume":156.02}   (beside rows reading 50 USD)
 *   GET /api/admin/payouts            -> summary.completedTotal 66.47 (beside rows reading -70 USD)
 *
 * A EUR label over a total containing an unconverted USD magnitude is the exact
 * shape this task exists to remove, one aggregation level up from where the
 * row-level sweep can see it.
 *
 * F2: `UnsupportedCurrencyError` promised a 400 in its own docblock and
 * delivered a 500 with a server stack trace, because it extended plain `Error`
 * and `errorHandler` reads `statusCode` only from its `AppError` branch.
 *
 * These cases seed LEGACY out-of-domain rows with raw SQL — the write guard
 * refuses them through the client, which is the point — exactly as a database
 * predating the narrowing would hold them.
 */

import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';
import { bgnToEur } from '../../src/utils/currency';

/** Insert a WalletTransaction directly, bypassing the client-side guard. */
async function insertLegacyWalletTx(params: {
  walletId: string;
  type: string;
  amount: number;
  currency: string;
  status?: string;
}): Promise<string> {
  const id = `bcqa031f1-agg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO wallet_transactions
       ("id","walletId","type","amount","balanceBefore","balanceAfter","currency","status","createdAt")
     VALUES ($1,$2,$3::"WalletTransactionType",$4,0,$4,$5,$6::"WalletTransactionStatus",NOW())`,
    id,
    params.walletId,
    params.type,
    params.amount,
    params.currency,
    params.status ?? 'COMPLETED',
  );
  return id;
}

describe('BC-QA-031-FOLLOWUP-1 F1 — wallet aggregates never label an unconvertible sum EUR', () => {
  let authToken: string;
  let userId: string;
  let walletId: string;

  beforeAll(async () => {
    const { accessToken, user } = await createTestUser();
    authToken = accessToken;
    userId = user.id;

    const wallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    walletId = wallet.id;

    // The reviewer's exact fixture: two convertible TOP_UPs, one unconvertible
    // USD TOP_UP, one EUR TOP_UP that is displayable at face value.
    await insertLegacyWalletTx({ walletId, type: 'TOP_UP', amount: 195.58, currency: 'BGN' });
    await insertLegacyWalletTx({ walletId, type: 'TOP_UP', amount: 19.56, currency: 'BGN' });
    await insertLegacyWalletTx({ walletId, type: 'TOP_UP', amount: 50, currency: 'USD' });
    await insertLegacyWalletTx({ walletId, type: 'TOP_UP', amount: 40, currency: 'EUR' });
    // A WITHDRAWAL pair: one convertible, one not. The USD one is what proves
    // exclusions are counted across EVERY type, not just the three named totals.
    await insertLegacyWalletTx({ walletId, type: 'WITHDRAWAL', amount: -70, currency: 'USD' });
    await insertLegacyWalletTx({ walletId, type: 'WITHDRAWAL', amount: -60, currency: 'BGN' });
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('the legacy rows really are stored out of domain (guards this file against a vacuous pass)', async () => {
    const usd = await prisma.walletTransaction.count({ where: { walletId, currency: 'USD' } });
    const eur = await prisma.walletTransaction.count({ where: { walletId, currency: 'EUR' } });
    // One USD TOP_UP + one USD WITHDRAWAL; one EUR TOP_UP.
    expect(usd).toBe(2);
    expect(eur).toBe(1);
  });

  describe('GET /api/wallet/statistics', () => {
    it('REGRESSION: totalTopups excludes the USD row instead of dividing it by the BGN peg', async () => {
      const res = await authRequest(authToken).get('/api/wallet/statistics');
      expect(res.status).toBe(200);
      const body = res.body.data ?? res.body;

      // Honest total: bgnToEur(195.58) + bgnToEur(19.56) + 40.00 EUR native.
      const expected = bgnToEur(195.58) + bgnToEur(19.56) + 40;
      expect(body.totalTopups).toBeCloseTo(expected, 1);

      // The pre-fix figure: (195.58 + 19.56 + 50 + 40) / 1.95583 = 156.02, i.e.
      // a USD magnitude and a EUR magnitude both divided by the BGN peg and
      // then labelled EUR.
      expect(body.totalTopups).not.toBeCloseTo(156.02, 1);
    });

    it('states the label and what the total could not account for', async () => {
      const res = await authRequest(authToken).get('/api/wallet/statistics');
      const body = res.body.data ?? res.body;

      expect(body.currency).toBe('EUR');
      expect(body.excludedCount).toBe(2);
      expect(body.excludedCurrencies).toEqual(['USD']);
    });

    it('still reports a per-type breakdown, re-folded across the split grouping key', async () => {
      const res = await authRequest(authToken).get('/api/wallet/statistics');
      const body = res.body.data ?? res.body;

      const topUp = body.transactionsByType.find((t: any) => t.type === 'TOP_UP');
      expect(topUp).toBeDefined();
      // Splitting the groupBy by currency must not split the reported breakdown.
      // 3 of the 4 rows are convertible; the USD one is excluded and counted as such.
      expect(topUp._count + topUp.excludedCount).toBe(4);
    });

    /**
     * impl-r4 F9 — the breakdown's MONEY value, not just its row count.
     *
     * The previous case asserted only `_count === 4` and stayed green even
     * under the F1a revert, so nothing pinned the amount. Measured live, this
     * field returned 200.00 — 110 EUR + 40 EUR + a raw 50 USD — three fields
     * below an honest `totalTopups` of 150.00, under a response-level
     * `"currency":"EUR"`.
     */
    it('REGRESSION: transactionsByType[TOP_UP]._sum.amount excludes the USD row', async () => {
      const res = await authRequest(authToken).get('/api/wallet/statistics');
      const body = res.body.data ?? res.body;

      const topUp = body.transactionsByType.find((t: any) => t.type === 'TOP_UP');
      const expected = bgnToEur(195.58) + bgnToEur(19.56) + 40;

      // It must agree with the headline total on the same response.
      expect(topUp._sum.amount).toBeCloseTo(expected, 1);
      expect(topUp._sum.amount).toBeCloseTo(body.totalTopups, 1);
      // The pre-fix value: the raw USD magnitude added at face value.
      expect(topUp._sum.amount).not.toBeCloseTo(200, 1);
      expect(topUp.excludedCount).toBe(1);
    });

    it('REGRESSION: a WITHDRAWAL-only exclusion is still counted in excludedCount', async () => {
      // The USD WITHDRAWAL row appears in `transactionsByType` but in none of
      // the cashback/topups/spent folds, so it used to be excluded from no fold
      // and counted in no exclusion — invisible to a client.
      const res = await authRequest(authToken).get('/api/wallet/statistics');
      const body = res.body.data ?? res.body;

      const withdrawal = body.transactionsByType.find((t: any) => t.type === 'WITHDRAWAL');
      expect(withdrawal).toBeDefined();
      expect(withdrawal._sum.amount).toBeCloseTo(bgnToEur(-60), 1);
      expect(withdrawal._sum.amount).not.toBeCloseTo(-100.68, 1);

      // 1 USD TOP_UP + 1 USD WITHDRAWAL = 2, not the old 1.
      expect(body.excludedCount).toBe(2);
    });
  });

  describe('GET /api/wallet/balance — pendingBalance / expiringBalance', () => {
    beforeAll(async () => {
      // Two PENDING cashback rows: one convertible, one not.
      const bgn = await insertLegacyWalletTx({ walletId, type: 'CASHBACK_CREDIT', amount: 19.56, currency: 'BGN' });
      const usd = await insertLegacyWalletTx({ walletId, type: 'CASHBACK_CREDIT', amount: 33, currency: 'USD' });
      await prisma.$executeRawUnsafe(
        `UPDATE wallet_transactions SET "cashbackStatus" = 'PENDING'::"CashbackEntryStatus" WHERE id IN ($1,$2)`,
        bgn,
        usd,
      );
    });

    it('REGRESSION: pendingBalance excludes the USD row rather than dividing it by the peg', async () => {
      const res = await authRequest(authToken).get('/api/wallet/balance');
      expect(res.status).toBe(200);
      const body = res.body.data ?? res.body;

      // Only the 19.56 BGN row is convertible → 10.00 EUR.
      expect(body.pendingBalance).toBeCloseTo(bgnToEur(19.56), 2);
      // The pre-fix flat aggregate: (19.56 + 33) / 1.95583 = 26.87.
      expect(body.pendingBalance).not.toBeCloseTo(bgnToEur(19.56 + 33), 2);
      expect(body.currency).toBe('EUR');
    });
  });

});
