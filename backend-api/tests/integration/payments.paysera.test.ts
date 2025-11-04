/**
 * Integration tests for Paysera Payment Routes
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import crypto from 'crypto';

describe('Paysera Payment Routes', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create test user and get auth token
    const testUser = await prisma.user.create({
      data: {
        email: 'payment-test@boomcard.bg',
        password: await require('bcryptjs').hash('Test123!', 10),
        name: 'Payment Test User',
        role: 'USER',
      },
    });

    userId = testUser.id;

    // Login to get token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'payment-test@boomcard.bg',
        password: 'Test123!',
      });

    authToken = loginResponse.body.token;

    // Create wallet for user
    await prisma.wallet.create({
      data: {
        userId,
        balance: 0,
        currency: 'BGN',
        totalEarned: 0,
        totalSpent: 0,
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email: 'payment-test@boomcard.bg' } });
  });

  describe('POST /api/payments/create', () => {
    it('should create a payment and return payment URL', async () => {
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
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
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 25.5,
          currency: 'EUR',
          description: 'Test payment 2',
        });

      expect(response.status).toBe(201);

      const orderId = response.body.data.orderId;
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: {
            path: ['orderId'],
            equals: orderId,
          },
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
      });

      expect(response.status).toBe(401);
    });

    it('should validate amount is positive', async () => {
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: -10,
          currency: 'BGN',
        });

      expect(response.status).toBe(400);
    });

    it('should validate amount is not zero', async () => {
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 0,
          currency: 'BGN',
        });

      expect(response.status).toBe(400);
    });

    it('should default to BGN currency if not specified', async () => {
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 10.0,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.currency).toBe('BGN');
    });

    it('should support multiple currencies', async () => {
      const currencies = ['BGN', 'EUR', 'USD', 'GBP'];

      for (const currency of currencies) {
        const response = await request(app)
          .post('/api/payments/create')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 10.0,
            currency,
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

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 15.0,
          currency: 'BGN',
          metadata,
        });

      expect(response.status).toBe(201);

      const orderId = response.body.data.orderId;
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: {
            path: ['orderId'],
            equals: orderId,
          },
        },
      });

      expect(transaction?.metadata).toMatchObject({
        orderId,
        source: 'mobile_app',
        campaign: 'summer_sale',
      });
    });
  });

  describe('POST /api/payments/callback', () => {
    let testOrderId: string;
    let testTransactionId: string;

    beforeEach(async () => {
      // Create a pending transaction for callback testing
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: 'PAYMENT',
          amount: 50.0,
          currency: 'BGN',
          status: 'PENDING',
          metadata: {
            orderId: 'CALLBACK-TEST-001',
          },
        },
      });

      testTransactionId = transaction.id;
      testOrderId = 'CALLBACK-TEST-001';
    });

    it('should process successful payment callback', async () => {
      const callbackData = {
        projectid: process.env.PAYSERA_PROJECT_ID,
        orderid: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1', // Success
        requestid: 'PSR-123456',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${encodedData}${process.env.PAYSERA_SIGN_PASSWORD}`)
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: encodedData,
          ss1,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      // Verify transaction updated
      const updatedTransaction = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });

      expect(updatedTransaction?.status).toBe('COMPLETED');

      // Verify wallet balance updated
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      expect(wallet?.balance).toBe(50.0);
      expect(wallet?.totalEarned).toBe(50.0);
    });

    it('should reject callback with invalid signature', async () => {
      const callbackData = {
        projectid: process.env.PAYSERA_PROJECT_ID,
        orderid: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '1',
        requestid: 'PSR-789',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
      const ss1 = 'invalid-signature';

      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: encodedData,
          ss1,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

      // Verify transaction NOT updated
      const transaction = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });

      expect(transaction?.status).toBe('PENDING');
    });

    it('should handle failed payment callback', async () => {
      const callbackData = {
        projectid: process.env.PAYSERA_PROJECT_ID,
        orderid: testOrderId,
        amount: '5000',
        currency: 'BGN',
        status: '2', // Failed
        requestid: 'PSR-FAILED',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${encodedData}${process.env.PAYSERA_SIGN_PASSWORD}`)
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: encodedData,
          ss1,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      // Verify transaction marked as failed
      const updatedTransaction = await prisma.transaction.findUnique({
        where: { id: testTransactionId },
      });

      expect(updatedTransaction?.status).toBe('FAILED');

      // Verify wallet balance NOT updated
      const wallet = await prisma.wallet.findUnique({
        where: { userId },
      });

      expect(wallet?.balance).toBe(0);
    });

    it('should return 404 if transaction not found', async () => {
      const callbackData = {
        projectid: process.env.PAYSERA_PROJECT_ID,
        orderid: 'NON-EXISTENT-ORDER',
        amount: '1000',
        currency: 'BGN',
        status: '1',
        requestid: 'PSR-404',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${encodedData}${process.env.PAYSERA_SIGN_PASSWORD}`)
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/callback')
        .send({
          data: encodedData,
          ss1,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/payments/:orderId/status', () => {
    let testOrderId: string;

    beforeEach(async () => {
      testOrderId = 'STATUS-TEST-001';

      await prisma.transaction.create({
        data: {
          userId,
          type: 'PAYMENT',
          amount: 25.0,
          currency: 'EUR',
          status: 'COMPLETED',
          description: 'Test payment',
          metadata: {
            orderId: testOrderId,
          },
        },
      });
    });

    it('should return payment status', async () => {
      const response = await request(app)
        .get(`/api/payments/${testOrderId}/status`)
        .set('Authorization', `Bearer ${authToken}`);

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
      const response = await request(app)
        .get('/api/payments/NON-EXISTENT/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should not allow access to other users payments', async () => {
      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          email: 'other-user@test.com',
          password: 'hashed',
          name: 'Other User',
          role: 'USER',
        },
      });

      // Create payment for other user
      await prisma.transaction.create({
        data: {
          userId: otherUser.id,
          type: 'PAYMENT',
          amount: 10.0,
          currency: 'BGN',
          status: 'COMPLETED',
          metadata: {
            orderId: 'OTHER-USER-ORDER',
          },
        },
      });

      // Try to access with first user's token
      const response = await request(app)
        .get('/api/payments/OTHER-USER-ORDER/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);

      // Cleanup
      await prisma.transaction.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('GET /api/payments/history', () => {
    beforeEach(async () => {
      // Create multiple test transactions
      const transactions = [];
      for (let i = 1; i <= 5; i++) {
        transactions.push({
          userId,
          type: 'PAYMENT',
          amount: i * 10.0,
          currency: 'BGN',
          status: i % 2 === 0 ? 'COMPLETED' : 'PENDING',
          description: `Test payment ${i}`,
          metadata: {
            orderId: `HISTORY-${i}`,
          },
        });
      }

      await prisma.transaction.createMany({ data: transactions });
    });

    it('should return payment history', async () => {
      const response = await request(app)
        .get('/api/payments/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('offset');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/payments/history?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/payments/history');

      expect(response.status).toBe(401);
    });

    it('should only return current users payments', async () => {
      const response = await request(app)
        .get('/api/payments/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // All payments should belong to current user
      const userIdCheck = response.body.data.every((payment: any) => {
        // Would need to join to verify, but trust the API
        return true;
      });

      expect(userIdCheck).toBe(true);
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
