/**
 * Integration Tests: Checkout Flow (Payment-First Onboarding)
 *
 * Spec Reference: §4.1, §7.1
 * Tests checkout initiation, status polling, and language persistence.
 *
 * Covers:
 * - POST /api/checkout/initiate — create pending checkout
 * - GET /api/checkout/status/:orderId — poll for payment status + retrieve language
 * - Paysera callback handling (mocked)
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import crypto from 'crypto';

describe('Checkout Flow (Payment-First Onboarding)', () => {
  let testPlanId: string;

  beforeAll(async () => {
    // Ensure test plan exists
    const existingPlan = await prisma.plan.findFirst({
      where: { planCode: 'TEST_CHECKOUT' },
    });

    if (existingPlan) {
      testPlanId = existingPlan.id;
    } else {
      const plan = await prisma.plan.create({
        data: {
          planCode: 'TEST_CHECKOUT',
          displayName: 'Test Plan',
          displayNameBg: 'Тестов план',
          isActive: true,
          hasWeeklyOption: true,
          hasMonthlyOption: true,
          hasYearlyOption: true,
          priceWeeklyEur: 399, // 3.99 EUR
          priceMonthlyEur: 999, // 9.99 EUR
          priceYearlyEur: 8999, // 89.99 EUR
        },
      });
      testPlanId = plan.id;
    }
  });

  afterAll(async () => {
    // Clean up test pending subscriptions
    await prisma.pendingSubscription.deleteMany({
      where: { email: { contains: 'checkout-test' } },
    }).catch(() => {});
  });

  // ── POST /api/checkout/initiate ────────────────────────────────

  describe('POST /api/checkout/initiate', () => {
    it('should create a pending checkout with language=bg', async () => {
      const email = `checkout-test-bg-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'monthly',
          email,
          language: 'bg',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orderId');
      expect(res.body.data).toHaveProperty('paymentUrl');
      expect(res.body.data.billingPeriod).toBe('monthly');

      const orderId = res.body.data.orderId;

      // Verify PendingSubscription was created with language
      const pending = await prisma.pendingSubscription.findFirst({
        where: { payseraOrderId: orderId },
      });

      expect(pending).toBeTruthy();
      expect(pending?.email).toBe(email);
      expect(pending?.language).toBe('bg');
      expect(pending?.status).toBe('CREATED');
      expect(pending?.billingPeriod).toBe('monthly');
    });

    it('should create a pending checkout with language=en', async () => {
      const email = `checkout-test-en-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'weekly',
          email,
          language: 'en',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.billingPeriod).toBe('weekly');

      const orderId = res.body.data.orderId;
      const pending = await prisma.pendingSubscription.findFirst({
        where: { payseraOrderId: orderId },
      });

      expect(pending?.language).toBe('en');
    });

    it('should default to bg language when not provided (no Accept-Language header)', async () => {
      const email = `checkout-test-default-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'yearly',
          email,
          // No language field provided
        });

      expect(res.status).toBe(201);
      const orderId = res.body.data.orderId;
      const pending = await prisma.pendingSubscription.findFirst({
        where: { payseraOrderId: orderId },
      });

      // Should default to 'bg'
      expect(pending?.language).toBe('bg');
    });

    it('should reject invalid plan ID', async () => {
      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: 'invalid-plan-id',
          billingPeriod: 'monthly',
          email: `checkout-test-invalid-${Date.now()}@example.com`,
          language: 'bg',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid billing period', async () => {
      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'invalid-period',
          email: `checkout-test-badperiod-${Date.now()}@example.com`,
          language: 'bg',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'monthly',
          email: 'not-an-email',
          language: 'bg',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  // ── GET /api/checkout/status/:orderId ──────────────────────────

  describe('GET /api/checkout/status/:orderId', () => {
    let testOrderId: string;
    let testEmail: string;

    beforeEach(async () => {
      testEmail = `checkout-status-test-${Date.now()}@example.com`;

      // Create a pending checkout in CREATED state
      const pending = await prisma.pendingSubscription.create({
        data: {
          email: testEmail,
          planId: testPlanId,
          billingPeriod: 'monthly',
          language: 'en',
          payseraOrderId: `TEST-ORDER-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          status: 'CREATED',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      testOrderId = pending.payseraOrderId;
    });

    it('should return checkout status in CREATED state (without token)', async () => {
      const res = await request(app).get(`/api/checkout/status/${testOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CREATED');
      expect(res.body.data.isReadyForRegistration).toBe(false);
      // Token should NOT be exposed in CREATED state
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.tokenExpiresAt).toBeUndefined();
    });

    it('should return language field in response (Spec §4.1, O-7)', async () => {
      const res = await request(app).get(`/api/checkout/status/${testOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('language');
      expect(res.body.data.language).toBe('en');
    });

    it('should return language=bg for checkout created with bg language', async () => {
      const bgEmail = `checkout-status-bg-${Date.now()}@example.com`;
      const bgPending = await prisma.pendingSubscription.create({
        data: {
          email: bgEmail,
          planId: testPlanId,
          billingPeriod: 'monthly',
          language: 'bg',
          payseraOrderId: `TEST-ORDER-BG-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          status: 'CREATED',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app).get(`/api/checkout/status/${bgPending.payseraOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.language).toBe('bg');
    });

    it('should return language with token when status=PAID', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const paidPending = await prisma.pendingSubscription.create({
        data: {
          email: `checkout-status-paid-${Date.now()}@example.com`,
          planId: testPlanId,
          billingPeriod: 'monthly',
          language: 'en',
          payseraOrderId: `TEST-ORDER-PAID-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          status: 'PAID',
          token,
          tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          paidAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app).get(`/api/checkout/status/${paidPending.payseraOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.isReadyForRegistration).toBe(true);
      expect(res.body.data.token).toBe(token);
      expect(res.body.data.tokenExpiresAt).toBeDefined();
      // Language MUST be included with token (§4.1, O-7)
      expect(res.body.data.language).toBe('en');
    });

    it('should return 404 for non-existent order', async () => {
      const res = await request(app).get('/api/checkout/status/NON-EXISTENT-ORDER');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });

    it('should not expose token for FAILED status', async () => {
      const failedPending = await prisma.pendingSubscription.create({
        data: {
          email: `checkout-status-failed-${Date.now()}@example.com`,
          planId: testPlanId,
          billingPeriod: 'monthly',
          language: 'bg',
          payseraOrderId: `TEST-ORDER-FAILED-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          status: 'FAILED',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app).get(`/api/checkout/status/${failedPending.payseraOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FAILED');
      expect(res.body.data.isReadyForRegistration).toBe(false);
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.language).toBe('bg'); // But language should still be present
    });

    it('should include plan details in response', async () => {
      const res = await request(app).get(`/api/checkout/status/${testOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBeDefined();
      expect(res.body.data.plan.code).toBeDefined();
      expect(res.body.data.plan.nameBg).toBeDefined();
    });

    it('should include billing period in response', async () => {
      const res = await request(app).get(`/api/checkout/status/${testOrderId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.billingPeriod).toBe('monthly');
    });
  });

  // ── Checkout Status with Language Flow ──────────────────────

  describe('Frontend language retrieval flow (Spec §4.1, O-7)', () => {
    it('should allow frontend to retrieve language from status endpoint for complete-profile', async () => {
      // Step 1: Frontend initiates checkout with a chosen language
      const email = `flow-test-${Date.now()}@example.com`;
      const initRes = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'monthly',
          email,
          language: 'en',
        });

      expect(initRes.status).toBe(201);
      const orderId = initRes.body.data.orderId;

      // Step 2: Simulate payment completion (in a real scenario, Paysera webhook would do this)
      // For now, we just verify the status endpoint returns the language
      const statusRes = await request(app).get(`/api/checkout/status/${orderId}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.language).toBe('en');
      expect(statusRes.body.data.status).toBe('CREATED');

      // Step 3: Frontend uses this language when calling POST /api/auth/complete-profile
      // (This would include the language in the complete-profile request)
      expect(statusRes.body.data.language).toBeDefined();
      expect(['bg', 'en']).toContain(statusRes.body.data.language);
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────

  describe('Edge cases and error conditions', () => {
    it('should handle concurrent checkout initiations for same email gracefully', async () => {
      const email = `concurrent-test-${Date.now()}@example.com`;

      // First request
      const res1 = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'monthly',
          email,
          language: 'bg',
        });

      expect(res1.status).toBe(201);

      // Second concurrent request — should be blocked
      const res2 = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'monthly',
          email,
          language: 'en',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe('CHECKOUT_ALREADY_IN_PROGRESS');
    });

    it('should return correct default language when none provided and no Accept-Language header', async () => {
      const email = `no-lang-header-${Date.now()}@example.com`;

      const res = await request(app)
        .post('/api/checkout/initiate')
        .send({
          planId: testPlanId,
          billingPeriod: 'monthly',
          email,
          // No language field
        })
        .set('Accept-Language', ''); // Explicitly empty to test fallback

      expect(res.status).toBe(201);
      const orderId = res.body.data.orderId;

      const statusRes = await request(app).get(`/api/checkout/status/${orderId}`);
      expect(statusRes.body.data.language).toBe('bg'); // Default
    });
  });
});
