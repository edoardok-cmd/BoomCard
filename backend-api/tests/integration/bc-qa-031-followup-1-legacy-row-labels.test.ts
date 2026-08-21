/**
 * BC-QA-031-FOLLOWUP-1 — a stored row can no longer surface under a fabricated
 * EUR label.
 *
 * Narrowing the write domain removes the SOURCE of out-of-domain rows, but a
 * database that predates the narrowing may already contain them, and a
 * migration is out of scope for this task (it belongs to the db-engineer). So
 * the read paths carry the second half of the fix: an amount that `toEur()`
 * could not convert is reported under its OWN currency code, never `'EUR'`.
 *
 * The legacy rows below are inserted with raw SQL ON PURPOSE. Every Prisma
 * client in the app now carries the accepted-currency extension, so
 * `prisma.transaction.create({ currency: 'USD' })` is refused — which is the
 * point of the write-side test, and precisely why a legacy row cannot be
 * created through the client here. Raw SQL bypasses the extension exactly the
 * way a row written before the guard existed did.
 */

import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';

const LEGACY_CURRENCIES = ['USD', 'GBP', 'PLN', 'CZK', 'RON'];

/**
 * Insert a Transaction row directly, bypassing the Prisma client extension —
 * the only way to reproduce a row that predates the write-side narrowing.
 * Returns the new row's id.
 */
async function insertLegacyRow(params: {
  userId: string;
  amount: number;
  currency: string;
  orderId: string;
}): Promise<string> {
  const id = `bcqa031f1-${params.currency}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Transaction"
       ("id", "userId", "type", "status", "amount", "currency", "paymentMethod", "description", "metadata", "createdAt", "updatedAt")
     VALUES ($1, $2, 'WALLET_TOPUP', 'COMPLETED', $3, $4, 'CARD', $5, $6, NOW(), NOW())`,
    id,
    params.userId,
    params.amount,
    params.currency,
    `BC-QA-031-FOLLOWUP-1 legacy ${params.currency} row`,
    JSON.stringify({ orderId: params.orderId }),
  );
  return id;
}

describe('BC-QA-031-FOLLOWUP-1 — legacy out-of-domain rows are never relabelled EUR', () => {
  let authToken: string;
  let userId: string;
  const orderIds: Record<string, string> = {};

  beforeAll(async () => {
    const { accessToken, user } = await createTestUser();
    authToken = accessToken;
    userId = user.id;

    for (const currency of LEGACY_CURRENCIES) {
      const orderId = `BCQA031F1-${currency}-${Date.now()}`;
      orderIds[currency] = orderId;
      // 100.00 of each — the exact magnitude from the task's failure scenario.
      await insertLegacyRow({ userId, amount: 100, currency, orderId });
    }

    // Control rows: one BGN (must convert) and one EUR (must pass through).
    orderIds.BGN = `BCQA031F1-BGN-${Date.now()}`;
    await insertLegacyRow({ userId, amount: 19.5583, currency: 'BGN', orderId: orderIds.BGN });
    orderIds.EUR = `BCQA031F1-EUR-${Date.now()}`;
    await insertLegacyRow({ userId, amount: 25, currency: 'EUR', orderId: orderIds.EUR });
  });

  afterAll(async () => {
    await cleanupTestUser(userId);
  });

  it('stored the legacy rows as written (the raw-SQL insert really did bypass the guard)', async () => {
    // Guards the test itself: if this ever fails, the cases below would be
    // vacuously green because there is no out-of-domain row to mislabel.
    for (const currency of LEGACY_CURRENCIES) {
      const row = await prisma.transaction.findFirst({ where: { userId, currency } });
      expect(row).toBeTruthy();
      expect(row?.currency).toBe(currency);
    }
  });

  describe('GET /api/payments/history', () => {
    it('reports each legacy row under its own currency, not EUR', async () => {
      const response = await authRequest(authToken).get('/api/payments/history?limit=100&offset=0');
      expect(response.status).toBe(200);

      const rows: any[] = response.body.data;
      for (const currency of LEGACY_CURRENCIES) {
        const row = rows.find((r) => r.orderId === orderIds[currency]);
        expect(row).toBeDefined();
        // The defect: { amount: 100, currency: 'EUR' } for a ~92 EUR payment.
        expect(row.currency).toBe(currency);
        expect(row.currency).not.toBe('EUR');
        expect(row.amount).toBe(100);
      }
    });

    it('still converts the BGN control row and passes the EUR control row through', async () => {
      const response = await authRequest(authToken).get('/api/payments/history?limit=100&offset=0');
      const rows: any[] = response.body.data;

      const bgnRow = rows.find((r) => r.orderId === orderIds.BGN);
      expect(bgnRow.amount).toBeCloseTo(10, 2);
      expect(bgnRow.currency).toBe('EUR');

      const eurRow = rows.find((r) => r.orderId === orderIds.EUR);
      expect(eurRow.amount).toBe(25);
      expect(eurRow.currency).toBe('EUR');
    });
  });

  describe('GET /api/payments/:orderId/status', () => {
    it('reports a legacy row under its own currency, not EUR', async () => {
      const response = await authRequest(authToken).get(`/api/payments/${orderIds.USD}/status`);
      expect(response.status).toBe(200);
      expect(response.body.data.currency).toBe('USD');
      expect(response.body.data.amount).toBe(100);
    });

    it('still converts the BGN control row', async () => {
      const response = await authRequest(authToken).get(`/api/payments/${orderIds.BGN}/status`);
      expect(response.status).toBe(200);
      expect(response.body.data.currency).toBe('EUR');
      expect(response.body.data.amount).toBeCloseTo(10, 2);
    });
  });

  describe('GET /api/subscriptions/history', () => {
    it('reports a legacy row under its own currency, not EUR', async () => {
      // The exact endpoint named in the task's failure scenario: a 100.00 USD
      // top-up used to be reported as { amount: 100, currency: 'EUR' }.
      const response = await authRequest(authToken).get('/api/subscriptions/history');
      expect(response.status).toBe(200);

      const rows: any[] = response.body.history;
      const usdRow = rows.find((r: any) => r.orderId === orderIds.USD);
      expect(usdRow).toBeDefined();
      expect(usdRow.currency).toBe('USD');
      expect(usdRow.currency).not.toBe('EUR');
      expect(usdRow.amount).toBe(100);
    });

    it('still converts the BGN control row and passes the EUR control row through', async () => {
      const response = await authRequest(authToken).get('/api/subscriptions/history');
      const rows: any[] = response.body.history;

      const bgnRow = rows.find((r: any) => r.orderId === orderIds.BGN);
      expect(bgnRow).toBeDefined();
      expect(bgnRow.amount).toBeCloseTo(10, 2);
      expect(bgnRow.currency).toBe('EUR');

      const eurRow = rows.find((r: any) => r.orderId === orderIds.EUR);
      expect(eurRow).toBeDefined();
      expect(eurRow.amount).toBe(25);
      expect(eurRow.currency).toBe('EUR');
    });
  });
});
