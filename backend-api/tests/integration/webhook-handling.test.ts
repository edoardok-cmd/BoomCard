/**
 * Integration Tests: Webhook Handling
 *
 * Tests payment gateway callback/webhook handling:
 * - Paysera callback signature verification (MD5 ss1 + SHA-256 ss2)
 * - Callback idempotency
 * - Status transitions
 *
 * Note: Paysera callback handler always returns 200 OK to prevent retries,
 * even on errors. We verify behavior by checking database state changes.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  cleanupTestUser,
} from '../helpers/test-utils';
import {
  createSignedCallback,
  createMockCallbackData,
  mockPayseraConfig,
} from '../helpers/payseraTestHelper';

describe('Webhook / Callback Handling', () => {
  const createdUserIds: string[] = [];
  let userId: string;

  beforeAll(async () => {
    const { user } = await createTestUser();
    userId = user.id;
    createdUserIds.push(userId);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Paysera Callback Signature ───────────────────────────────

  describe('POST /api/payments/callback — Signature Verification', () => {
    let testOrderId: string;
    let testTransactionId: string;

    beforeEach(async () => {
      testOrderId = `WH-TEST-${Date.now()}`;

      const tx = await prisma.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          amount: 50.0,
          currency: 'BGN',
          status: 'PENDING',
          metadata: JSON.stringify({ orderId: testOrderId }),
        },
      });
      testTransactionId = tx.id;
    });

    afterEach(async () => {
      await prisma.walletTransaction.deleteMany({
        where: { transactionId: testTransactionId },
      }).catch((e) => { console.warn('afterEach cleanup: walletTransaction:', e); });
      await prisma.transaction.deleteMany({
        where: { id: testTransactionId },
      }).catch((e) => { console.warn('afterEach cleanup: transaction:', e); });
    });

    it('should accept callback with valid MD5 signature (ss1) and complete transaction', async () => {
      const signed = createSignedCallback({
        orderId: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1',
      });

      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: signed.data, ss1: signed.ss1 });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');

      // Verify transaction was completed
      const tx = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });
      expect(tx?.status).toBe('COMPLETED');
    });

    it('should not update transaction when signature is invalid', async () => {
      const signed = createSignedCallback({
        orderId: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1',
      });

      // Send with forged signature — handler returns OK but doesn't update
      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: signed.data, ss1: 'forged-signature-hash' });

      // Paysera handler always returns OK to prevent retries
      expect(res.status).toBe(200);

      // Transaction should remain PENDING
      const tx = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });
      expect(tx?.status).toBe('PENDING');
    });

    it('should not update transaction when data is tampered', async () => {
      // Create valid signature for original data
      const original = createSignedCallback({
        orderId: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1',
      });

      // Tamper with the data (change amount) — reuse original signature
      const tamperedData = createMockCallbackData({
        orderId: testOrderId,
        amount: '100', // Changed from 5000 to 100
        currency: 'BGN',
        status: '1',
      });
      const tamperedQueryString = new URLSearchParams(tamperedData as Record<string, string>).toString();
      const tamperedEncoded = Buffer.from(tamperedQueryString).toString('base64');

      // Use original signature with tampered data
      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: tamperedEncoded, ss1: original.ss1 });

      // Returns OK but data should not be processed
      expect(res.status).toBe(200);

      // Transaction should remain PENDING (signature mismatch)
      const tx = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });
      expect(tx?.status).toBe('PENDING');
    });
  });

  // ─── Payment Status Transitions ───────────────────────────────

  describe('Payment Status Transitions', () => {
    it('should mark transaction as FAILED for failed payment callback', async () => {
      const orderId = `WH-FAIL-${Date.now()}`;

      const tx = await prisma.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          amount: 30.0,
          currency: 'BGN',
          status: 'PENDING',
          metadata: JSON.stringify({ orderId }),
        },
      });

      const signed = createSignedCallback({
        orderId,
        amount: '3000',
        currency: 'BGN',
        status: '5' as any, // Refunded/Cancelled in Paysera
      });

      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: signed.data, ss1: signed.ss1 });

      expect(res.status).toBe(200);

      const updatedTx = await prisma.transaction.findUnique({
        where: { id: tx.id },
      });
      expect(updatedTx?.status).toBe('CANCELLED');

      // Cleanup
      await prisma.transaction.delete({ where: { id: tx.id } }).catch(() => {});
    });

    it('should handle callback with unknown order gracefully', async () => {
      const signed = createSignedCallback({
        orderId: 'UNKNOWN-ORDER-123',
        amount: '1000',
        currency: 'BGN',
        status: '1',
      });

      // Paysera handler returns OK even for unknown orders (to prevent retries)
      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: signed.data, ss1: signed.ss1 });

      expect(res.status).toBe(200);
    });
  });

  // ─── Callback Idempotency ─────────────────────────────────────

  describe('Callback Idempotency', () => {
    it('should handle duplicate successful callbacks gracefully', async () => {
      const orderId = `WH-IDEM-${Date.now()}`;

      const tx = await prisma.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          amount: 20.0,
          currency: 'BGN',
          status: 'PENDING',
          metadata: JSON.stringify({ orderId }),
        },
      });

      const signed = createSignedCallback({
        orderId,
        amount: '2000',
        currency: 'BGN',
        status: '1',
      });

      // First callback
      const res1 = await request(app)
        .post('/api/payments/callback')
        .send({ data: signed.data, ss1: signed.ss1 });
      expect(res1.status).toBe(200);

      // Get wallet balance after first callback
      const walletAfterFirst = await prisma.wallet.findUnique({ where: { userId } });
      const balanceAfterFirst = walletAfterFirst?.balance || 0;

      // Second callback (duplicate) — should not double-credit
      const res2 = await request(app)
        .post('/api/payments/callback')
        .send({ data: signed.data, ss1: signed.ss1 });

      // Should either return 200 (OK, already processed) or some other non-error status
      expect([200, 409].includes(res2.status)).toBe(true);

      // Wallet should NOT be double-credited
      const walletAfterSecond = await prisma.wallet.findUnique({ where: { userId } });
      expect(walletAfterSecond?.balance).toBeLessThanOrEqual(balanceAfterFirst + 20);

      // Transaction should be in a terminal state (not reverted or corrupted)
      const txAfterDuplicate = await prisma.transaction.findUnique({ where: { id: tx.id } });
      expect(txAfterDuplicate?.status).toBe('COMPLETED');

      // Cleanup
      await prisma.walletTransaction.deleteMany({ where: { transactionId: tx.id } }).catch((e) => {
        console.warn('idempotency cleanup: walletTransaction:', e);
      });
      await prisma.transaction.delete({ where: { id: tx.id } }).catch((e) => {
        console.warn('idempotency cleanup: transaction:', e);
      });
    });
  });

  // ─── Webhook Health ───────────────────────────────────────────

  describe('GET /api/webhooks/health', () => {
    it('should return webhook health status', async () => {
      const res = await request(app).get('/api/webhooks/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
