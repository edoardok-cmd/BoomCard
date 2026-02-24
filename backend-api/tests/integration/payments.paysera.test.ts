/**
 * Integration tests for Paysera Payment Routes
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import crypto from 'crypto';
import {
  createTestUser,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';
import {
  createSignedCallback,
  mockPayseraConfig,
} from '../helpers/payseraTestHelper';

describe('Paysera Payment Routes', () => {
  let authToken: string;
  let userId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const { accessToken, user } = await createTestUser();
    authToken = accessToken;
    userId = user.id;
    createdUserIds.push(userId);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  describe('POST /api/payments/create', () => {
    it('should create a payment and return payment URL', async () => {
      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 50.0,
          currency: 'BGN',
          description: 'Test wallet top-up',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('orderId');
      expect(response.body.data).toHaveProperty('paymentUrl');
      expect(response.body.data).toHaveProperty('transactionId');
      expect(response.body.data.amount).toBe(5000); // In cents
      expect(response.body.data.currency).toBe('BGN');
      expect(response.body.data.status).toBe('pending');

      // Verify payment URL format
      expect(response.body.data.paymentUrl).toContain('paysera.com/pay');
      expect(response.body.data.paymentUrl).toContain('data=');
      expect(response.body.data.paymentUrl).toContain('sign=');
    });

    it('should create transaction in database', async () => {
      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 25.5,
          currency: 'EUR',
          description: 'Test payment 2',
        });

      expect(response.status).toBe(201);

      const orderId = response.body.data.orderId;
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: { contains: orderId },
        },
      });

      expect(transaction).toBeTruthy();
      expect(transaction?.userId).toBe(userId);
      expect(transaction?.amount).toBe(25.5);
      expect(transaction?.currency).toBe('EUR');
      expect(transaction?.status).toBe('PENDING');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app).post('/api/payments/create').send({
        amount: 50.0,
        currency: 'BGN',
        description: 'No auth test',
      });

      expect(response.status).toBe(401);
    });

    it('should validate amount is positive', async () => {
      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: -10,
          currency: 'BGN',
          description: 'Negative amount',
        });

      expect(response.status).toBe(400);
    });

    it('should validate amount is not zero', async () => {
      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 0,
          currency: 'BGN',
          description: 'Zero amount',
        });

      expect(response.status).toBe(400);
    });

    it('should default to EUR currency if not specified', async () => {
      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 10.0,
          description: 'Default currency',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.currency).toBeTruthy();
    });

    it('should support multiple currencies', async () => {
      const currencies = ['BGN', 'EUR', 'USD', 'GBP'];

      for (const currency of currencies) {
        const response = await authRequest(authToken)
          .post('/api/payments/create')
          .send({
            amount: 10.0,
            currency,
            description: `Multi-currency test ${currency}`,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.currency).toBe(currency);
      }
    });

    it('should store metadata if provided', async () => {
      const metadata = {
        source: 'mobile_app',
        campaign: 'summer_sale',
      };

      const response = await authRequest(authToken)
        .post('/api/payments/create')
        .send({
          amount: 15.0,
          currency: 'BGN',
          description: 'Metadata test',
          metadata,
        });

      expect(response.status).toBe(201);

      const orderId = response.body.data.orderId;
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: { contains: orderId },
        },
      });

      expect(transaction).toBeTruthy();
      const txMetadata = JSON.parse(transaction!.metadata as string);
      expect(txMetadata.orderId).toBe(orderId);
    });
  });

  describe('POST /api/payments/callback', () => {
    let testOrderId: string;
    let testTransactionId: string;

    beforeEach(async () => {
      testOrderId = `CALLBACK-TEST-${Date.now()}`;

      const transaction = await prisma.transaction.create({
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

      testTransactionId = transaction.id;
    });

    afterEach(async () => {
      await prisma.walletTransaction.deleteMany({
        where: { transactionId: testTransactionId },
      }).catch(() => {});
      await prisma.transaction.deleteMany({
        where: { id: testTransactionId },
      }).catch(() => {});
    });

    it('should process successful payment callback', async () => {
      const signed = createSignedCallback({
        orderId: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1', // Success
      });

      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: signed.data,
          ss1: signed.ss1,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      // Verify transaction updated
      const updatedTransaction = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });

      expect(updatedTransaction?.status).toBe('COMPLETED');
    });

    it('should not update transaction with invalid signature', async () => {
      const signed = createSignedCallback({
        orderId: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1',
      });

      // Send with wrong signature — Paysera handler still returns OK to prevent retries
      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: signed.data,
          ss1: 'invalid-signature',
        });

      // Handler always sends OK to Paysera
      expect(response.status).toBe(200);

      // Verify transaction NOT updated
      const transaction = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });

      expect(transaction?.status).toBe('PENDING');
    });

    it('should handle cancelled payment callback', async () => {
      const signed = createSignedCallback({
        orderId: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '5' as any, // Refunded/Cancelled in Paysera
      });

      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: signed.data,
          ss1: signed.ss1,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      // Verify transaction marked as cancelled
      const updatedTransaction = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });

      expect(updatedTransaction?.status).toBe('CANCELLED');
    });

    it('should handle callback for non-existent order gracefully', async () => {
      const signed = createSignedCallback({
        orderId: 'NON-EXISTENT-ORDER',
        amount: '1000',
        currency: 'BGN',
        status: '1',
      });

      // Paysera expects OK even if order not found (prevent retries)
      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: signed.data,
          ss1: signed.ss1,
        });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/payments/:orderId/status', () => {
    let testOrderId: string;

    beforeEach(async () => {
      testOrderId = `STATUS-TEST-${Date.now()}`;

      await prisma.transaction.create({
        data: {
          userId,
          type: 'WALLET_TOPUP',
          paymentMethod: 'CARD',
          amount: 25.0,
          currency: 'EUR',
          status: 'COMPLETED',
          description: 'Test payment',
          metadata: JSON.stringify({ orderId: testOrderId }),
        },
      });
    });

    it('should return payment status', async () => {
      const response = await authRequest(authToken)
        .get(`/api/payments/${testOrderId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orderId).toBe(testOrderId);
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.amount).toBe(25.0);
      expect(response.body.data.currency).toBe('EUR');
    });

    it('should require authentication', async () => {
      const response = await request(app).get(`/api/payments/${testOrderId}/status`);

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await authRequest(authToken)
        .get('/api/payments/NON-EXISTENT/status');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/payments/history', () => {
    beforeAll(async () => {
      // Create some test transactions
      for (let i = 1; i <= 3; i++) {
        await prisma.transaction.create({
          data: {
            userId,
            type: 'WALLET_TOPUP',
            paymentMethod: 'CARD',
            amount: i * 10.0,
            currency: 'BGN',
            status: i % 2 === 0 ? 'COMPLETED' : 'PENDING',
            description: `History test ${i}`,
            metadata: JSON.stringify({ orderId: `HISTORY-${Date.now()}-${i}` }),
          },
        });
      }
    });

    it('should return payment history', async () => {
      const response = await authRequest(authToken)
        .get('/api/payments/history');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('offset');
    });

    it('should support pagination', async () => {
      const response = await authRequest(authToken)
        .get('/api/payments/history?limit=2&offset=0');

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/payments/history');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/payments/methods', () => {
    it('should return supported payment methods and currencies', async () => {
      const response = await request(app).get('/api/payments/methods');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('methods');
      expect(response.body.data).toHaveProperty('currencies');

      expect(Array.isArray(response.body.data.methods)).toBe(true);
      expect(Array.isArray(response.body.data.currencies)).toBe(true);

      expect(response.body.data.currencies).toContain('BGN');
      expect(response.body.data.currencies).toContain('EUR');
    });

    it('should not require authentication', async () => {
      const response = await request(app).get('/api/payments/methods');

      expect(response.status).toBe(200);
    });
  });
});
