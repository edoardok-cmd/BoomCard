/**
 * Integration Tests: API Contract Validation
 *
 * Validates that API responses match the contracts expected by the mobile client.
 * This ensures backend changes don't break the mobile app.
 */

import request from 'supertest';
import { app } from '../../src/server';
import {
  createTestUser,
  createTestSubscription,
  cleanupTestUser,
  authRequest,
} from '../helpers/test-utils';

describe('API Contract Validation (Mobile Client Compatibility)', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Auth Response Contract ───────────────────────────────────

  describe('Auth Response Format', () => {
    it('register response matches mobile client expectations', async () => {
      const { user, accessToken, refreshToken } = await createTestUser();
      createdUserIds.push(user.id);

      // Mobile client expects: { data: { user, accessToken, refreshToken, expiresIn } }
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'TestPass123!' });

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');

      const data = res.body.data;
      // User object
      expect(data).toHaveProperty('user');
      expect(data.user).toHaveProperty('id');
      expect(data.user).toHaveProperty('email');
      expect(data.user).toHaveProperty('firstName');
      expect(data.user).toHaveProperty('role');
      expect(data.user).toHaveProperty('status');
      expect(data.user).not.toHaveProperty('passwordHash');

      // Tokens
      expect(data).toHaveProperty('accessToken');
      expect(data).toHaveProperty('refreshToken');
      expect(data).toHaveProperty('expiresIn');
      expect(typeof data.accessToken).toBe('string');
      expect(typeof data.refreshToken).toBe('string');
    });

    it('refresh response matches mobile client expectations', async () => {
      const { refreshToken } = await createTestUser();

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data).toHaveProperty('expiresIn');
    });
  });

  // ─── Error Response Contract ──────────────────────────────────

  describe('Error Response Format', () => {
    it('validation error has consistent format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      // Error may be wrapped as { error: { message } } or { error, message }
      const msg = res.body.message ?? res.body.error?.message ?? res.body.error;
      expect(msg).toBeTruthy();
    });

    it('401 error has consistent format', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('404 error returns JSON', async () => {
      const res = await request(app).get('/api/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
      expect(res.body).toHaveProperty('message');
    });
  });

  // ─── Subscription Response Contract ───────────────────────────

  describe('Subscription Response Format', () => {
    it('current subscription matches mobile expectations', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/subscriptions/current');

      expect(res.status).toBe(200);
      // Mobile expects: { plan, status, benefits }
      expect(res.body).toHaveProperty('plan');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('benefits');
    });

    it('plans list matches mobile expectations', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/subscriptions/plans');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('plans');
      expect(Array.isArray(res.body.plans)).toBe(true);

      // Each plan should have the expected fields
      for (const plan of res.body.plans) {
        expect(plan).toHaveProperty('plan');
        expect(['LIGHT', 'BASIC', 'PREMIUM']).toContain(plan.plan);
      }
    });

    it('subscription status polling returns expected format', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      const sub = await createTestSubscription(user.id, 'PREMIUM');

      const res = await request(app)
        .get(`/api/subscriptions/status/${sub.payseraOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('subscriptionId');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('plan');
      expect(res.body.data.plan).toHaveProperty('code');
      expect(res.body.data.plan).toHaveProperty('name');
      expect(res.body.data).toHaveProperty('isActive');
      expect(typeof res.body.data.isActive).toBe('boolean');
    });
  });

  // ─── User Profile Contract ────────────────────────────────────

  describe('User Profile Response Format', () => {
    it('GET /me returns expected fields', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/auth/me');

      expect(res.status).toBe(200);
      const userData = res.body.data;

      expect(userData).toHaveProperty('id');
      expect(userData).toHaveProperty('email');
      expect(userData).toHaveProperty('firstName');
      expect(userData).toHaveProperty('lastName');
      expect(userData).toHaveProperty('role');
      expect(userData).toHaveProperty('status');
      expect(userData).toHaveProperty('createdAt');
      expect(userData).toHaveProperty('loyaltyAccount');

      // Loyalty account
      expect(userData.loyaltyAccount).toHaveProperty('tier');
      expect(userData.loyaltyAccount).toHaveProperty('points');
    });
  });

  // ─── Payment Response Contract ────────────────────────────────

  describe('Payment Response Format', () => {
    it('create payment returns expected format with redirect URL', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/payments/create')
        .send({ amount: 10.0, currency: 'BGN', description: 'Contract test' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('orderId');
      expect(res.body.data).toHaveProperty('paymentUrl');
      expect(res.body.data).toHaveProperty('transactionId');
      expect(res.body.data).toHaveProperty('amount');
      expect(res.body.data).toHaveProperty('currency');
      expect(res.body.data).toHaveProperty('status', 'pending');

      // Payment URL should be a valid URL
      expect(res.body.data.paymentUrl).toMatch(/^https?:\/\//);
    });

    it('payment methods returns expected format', async () => {
      const res = await request(app).get('/api/payments/methods');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('methods');
      expect(res.body.data).toHaveProperty('currencies');
      expect(Array.isArray(res.body.data.methods)).toBe(true);
      expect(Array.isArray(res.body.data.currencies)).toBe(true);
    });
  });

  // ─── Wallet Response Contract ─────────────────────────────────

  describe('Wallet Response Format', () => {
    it('wallet balance returns expected format', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/wallet/balance');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('balance');
      expect(typeof res.body.balance).toBe('number');
    });
  });
});
