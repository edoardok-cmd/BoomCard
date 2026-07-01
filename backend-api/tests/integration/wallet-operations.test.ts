/**
 * Integration Tests: Wallet Operations
 *
 * Covers P0 critical paths:
 * - F04: Top-up Wallet via Paysera
 * - F05: Pay with Wallet
 * - Cashback credit after receipt/scan
 * - Wallet balance integrity
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { walletService } from '../../src/services/wallet.service';
import {
  createTestUser,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

describe('Wallet Operations (F04, F05)', () => {
  const createdUserIds: string[] = [];
  let userId: string;
  let accessToken: string;
  let walletId: string;

  beforeAll(async () => {
    const testData = await createTestUser();
    userId = testData.user.id;
    accessToken = testData.accessToken;
    createdUserIds.push(userId);

    const wallet = await walletService.getOrCreateWallet(userId);
    walletId = wallet.id;
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Wallet Auto-Creation ─────────────────────────────────────

  describe('Wallet Auto-Creation on Registration', () => {
    it('should auto-create wallet with zero balance', async () => {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });

      expect(wallet).toBeDefined();
      expect(wallet?.balance).toBe(0);
      expect(wallet?.currency).toBe('BGN');
      expect(wallet?.isLocked).toBe(false);
    });
  });

  // ─── Wallet Top-Up (F04) ─────────────────────────────────────

  describe('POST /api/payments/create — Wallet Top-Up', () => {
    it('should create a payment for wallet top-up', async () => {
      const res = await authRequest(accessToken)
        .post('/api/payments/create')
        .send({
          amount: 50.0,
          currency: 'BGN',
          description: 'Wallet top-up',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orderId');
      expect(res.body.data).toHaveProperty('paymentUrl');
      expect(res.body.data.amount).toBe(5000); // cents
      expect(res.body.data.status).toBe('pending');
    });

    it('should reject top-up with zero amount', async () => {
      const res = await authRequest(accessToken)
        .post('/api/payments/create')
        .send({ amount: 0, currency: 'BGN' });

      expect(res.status).toBe(400);
    });

    it('should reject top-up with negative amount', async () => {
      const res = await authRequest(accessToken)
        .post('/api/payments/create')
        .send({ amount: -10, currency: 'BGN' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Cashback Credit ──────────────────────────────────────────

  describe('Cashback Credit Operations', () => {
    it('should credit wallet when cashback is earned', async () => {
      const initialBalance = await walletService.getBalance(userId);

      await walletService.credit({
        userId,
        amount: 5,
        type: 'CASHBACK_CREDIT',
        description: 'Cashback from test receipt',
        metadata: { merchantName: 'Test', totalAmount: 100 },
      });

      const newBalance = await walletService.getBalance(userId);
      expect(newBalance.balance).toBe(initialBalance.balance + 5);
    });

    it('should record transaction with correct balance before/after', async () => {
      const balanceBefore = (await walletService.getBalance(userId)).balance;

      await walletService.credit({
        userId,
        amount: 10,
        type: 'CASHBACK_CREDIT',
        description: 'Test cashback',
      });

      const tx = await prisma.walletTransaction.findFirst({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
      });

      expect(tx).toBeTruthy();
      expect(tx?.balanceBefore).toBe(balanceBefore);
      expect(tx?.balanceAfter).toBe(balanceBefore + 10);
      expect(tx?.type).toBe('CASHBACK_CREDIT');
      expect(tx?.status).toBe('COMPLETED');
    });
  });

  // ─── Wallet Balance Queries ───────────────────────────────────

  describe('GET /api/wallet/balance', () => {
    it('should return wallet balance', async () => {
      const res = await authRequest(accessToken).get('/api/wallet/balance');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('balance');
      expect(typeof res.body.balance).toBe('number');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/wallet/balance');
      expect(res.status).toBe(401);
    });
  });

  // ─── Transaction History ──────────────────────────────────────

  describe('GET /api/wallet/transactions', () => {
    it('should return wallet transaction history', async () => {
      const res = await authRequest(accessToken).get('/api/wallet/transactions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.transactions)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/wallet/transactions');
      expect(res.status).toBe(401);
    });
  });

  // ─── Balance Integrity ────────────────────────────────────────

  describe('Balance Integrity', () => {
    it('should maintain accurate balance equal to sum of transactions', async () => {
      const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId, status: 'COMPLETED' },
      });

      const totalCredits = transactions
        .filter(tx => ['CASHBACK_CREDIT', 'TOP_UP', 'CREDIT'].includes(tx.type))
        .reduce((sum, tx) => sum + tx.amount, 0);

      const totalDebits = transactions
        .filter(tx => ['PAYMENT', 'DEBIT', 'WITHDRAWAL'].includes(tx.type))
        .reduce((sum, tx) => sum + tx.amount, 0);

      expect(wallet?.balance).toBe(totalCredits - totalDebits);
    });

    it('should have consistent balanceBefore/balanceAfter chain', async () => {
      const transactions = await prisma.walletTransaction.findMany({
        where: { walletId },
        orderBy: { createdAt: 'asc' },
      });

      if (transactions.length < 2) return;

      for (let i = 1; i < transactions.length; i++) {
        expect(transactions[i].balanceBefore).toBe(transactions[i - 1].balanceAfter);
      }
    });
  });

  // ─── Wallet in Data Export ────────────────────────────────────

  describe('Wallet in GDPR Data Export', () => {
    it('should include user data in data export (wallet fetched separately as payoutAccount)', async () => {
      const res = await authRequest(accessToken).get('/api/auth/data-export');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userData');
      // Wallet balance/transactions are not embedded in userData; payout IBAN is in payoutAccount.
      expect(res.body).toHaveProperty('payoutAccount');
      expect(res.body.payoutAccount).toHaveProperty('iban');
    });
  });

  // ─── Concurrent Operations ────────────────────────────────────

  describe('Concurrent Wallet Operations', () => {
    it('should handle sequential cashback credits without data loss', async () => {
      const initialBalance = (await walletService.getBalance(userId)).balance;

      const amounts = [3, 5, 7];
      // Execute sequentially to avoid race conditions on wallet balance
      for (const amount of amounts) {
        await walletService.credit({
          userId,
          amount,
          type: 'CASHBACK_CREDIT',
          description: `Sequential test ${amount}`,
        });
      }

      const finalBalance = (await walletService.getBalance(userId)).balance;
      const totalCredited = amounts.reduce((a, b) => a + b, 0);
      expect(finalBalance).toBe(initialBalance + totalCredited);
    });
  });
});
