/**
 * Integration tests for BC-QA-017 — Unguarded JSON.parse of plans.features 500s
 * /api/dashboard/me and /api/subscriptions/current
 *
 * Tests cover:
 * - safeParseJsonArray utility handles malformed JSON gracefully
 * - getPlanBenefits returns empty array for malformed features
 * - getCardBenefits returns empty array for malformed features/featuresBg
 * - GET /api/plans endpoints tolerate malformed features
 * - GET /api/dashboard/me does NOT 500 when plan has malformed features
 * - GET /api/subscriptions/current does NOT 500 when plan has malformed features
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { safeParseJsonArray } from '../src/utils/json';

describe('BC-QA-017: Malformed JSON in plan features', () => {
  describe('safeParseJsonArray utility', () => {
    it('should return empty array for null', () => {
      expect(safeParseJsonArray(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(safeParseJsonArray(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(safeParseJsonArray('')).toEqual([]);
    });

    it('should return empty array for non-JSON string', () => {
      expect(safeParseJsonArray('not valid json')).toEqual([]);
    });

    it('should return empty array for semicolon-delimited data (re-audit test case)', () => {
      expect(safeParseJsonArray('feature1;feature2;feature3')).toEqual([]);
    });

    it('should return empty array for truncated JSON', () => {
      expect(safeParseJsonArray('["feature1", "feature2"')).toEqual([]);
    });

    it('should return empty array for JSON object (not array)', () => {
      expect(safeParseJsonArray('{"key":"value"}')).toEqual([]);
    });

    it('should parse valid JSON array', () => {
      expect(safeParseJsonArray('["feature1","feature2","feature3"]')).toEqual([
        'feature1',
        'feature2',
        'feature3',
      ]);
    });

    it('should parse valid JSON array with mixed types', () => {
      const result = safeParseJsonArray('[1, "text", true]');
      expect(result).toEqual([1, 'text', true]);
    });
  });

  describe('getPlanBenefits with malformed data', () => {
    let app: any;
    let userId: string;
    let planWithMalformedFeatures: any;

    beforeAll(async () => {
      app = await createTestApp();

      // Create a test user
      const user = await prisma.user.create({
        data: {
          email: `test-qa-017-${Date.now()}@test.local`,
          firstName: 'QA017',
          lastName: 'Test',
          phone: '+359000000000',
          passwordHash: 'hashed_password',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });
      userId = user.id;

      // Create or update a plan with malformed features for testing
      // Note: In production, we're fixing the code to handle this gracefully,
      // but we want to verify it doesn't crash if the data exists
      planWithMalformedFeatures = await prisma.plan.upsert({
        where: { planCode: 'MALFORMED_TEST' },
        create: {
          planCode: 'MALFORMED_TEST',
          displayName: 'Malformed Test Plan',
          displayNameBg: 'Malformed Test Plan',
          priceMonthlyEur: 9900,
          priceWeeklyEur: 2500,
          priceYearlyEur: 95000,
          cashbackRate: 5,
          stickerBonus: 10,
          features: 'feature1;feature2;feature3', // Semicolon-delimited (malformed)
          featuresBg: 'не_валидна;структура', // Malformed Bulgarian features
          cardType: 'PREMIUM_WEEKLY',
          isActive: true,
          displayOrder: 999,
        },
        update: {
          features: 'feature1;feature2;feature3',
          featuresBg: 'не_валидна;структура',
        },
      });
    });

    afterAll(async () => {
      // Clean up test data
      if (userId) {
        await prisma.user.deleteMany({
          where: { email: { startsWith: 'test-qa-017-' } },
        });
      }
      if (planWithMalformedFeatures) {
        await prisma.plan.update({
          where: { id: planWithMalformedFeatures.id },
          data: { isActive: false },
        });
      }
      await app.close();
    });

    it('should return empty features array when plan features are malformed', async () => {
      const { subscriptionService } = require('../src/services/subscription.service');
      const result = await subscriptionService.getPlanBenefits('MALFORMED_TEST');

      expect(result).toBeDefined();
      expect(result.features).toEqual([]);
      expect(Array.isArray(result.features)).toBe(true);
    });

    it('should return cashback and monthly fee even with malformed features', async () => {
      const { subscriptionService } = require('../src/services/subscription.service');
      const result = await subscriptionService.getPlanBenefits('MALFORMED_TEST');

      expect(result.cashbackRate).toBe(5);
      expect(result.monthlyFee).toBe(99); // priceMonthlyEur / 100
    });
  });

  describe('getCardBenefits with malformed data', () => {
    let app: any;

    beforeAll(async () => {
      app = await createTestApp();

      // Update the test plan with malformed features
      await prisma.plan.updateMany({
        where: { planCode: 'MALFORMED_TEST' },
        data: {
          features: 'malformed;json;data',
          featuresBg: 'невалидни;данни',
        },
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('should return empty features arrays when card plan has malformed data', async () => {
      const { cardService } = require('../src/services/card.service');
      const result = await cardService.getCardBenefits('MALFORMED_TEST');

      expect(result).toBeDefined();
      expect(result.features).toEqual([]);
      expect(result.featuresBg).toEqual([]);
      expect(Array.isArray(result.features)).toBe(true);
      expect(Array.isArray(result.featuresBg)).toBe(true);
    });

    it('should return cashback and bonuses even with malformed features', async () => {
      const { cardService } = require('../src/services/card.service');
      const result = await cardService.getCardBenefits('MALFORMED_TEST');

      expect(result.cashbackRate).toBe(5);
      expect(result.bonusCashback).toBe(10);
    });
  });

  describe('GET /api/plans endpoints with malformed features', () => {
    let app: any;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/plans should tolerate malformed features', async () => {
      const res = await request(app).get('/api/plans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Verify that malformed plan features are empty arrays, not errors
      const plans = res.body.data;
      plans.forEach((plan: any) => {
        expect(Array.isArray(plan.features)).toBe(true);
        expect(Array.isArray(plan.featuresBg)).toBe(true);
      });
    });

    it('GET /api/plans/:id should tolerate malformed features', async () => {
      const plan = await prisma.plan.findFirst({
        where: { planCode: 'MALFORMED_TEST' },
      });

      if (!plan) {
        // Skip if test plan doesn't exist
        return;
      }

      const res = await request(app).get(`/api/plans/${plan.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.features)).toBe(true);
      expect(Array.isArray(res.body.data.featuresBg)).toBe(true);
      // Malformed features should become empty arrays
      expect(res.body.data.features).toEqual([]);
      expect(res.body.data.featuresBg).toEqual([]);
    });

    it('GET /api/plans/code/:planCode should tolerate malformed features', async () => {
      const res = await request(app).get('/api/plans/code/MALFORMED_TEST');

      if (res.status === 404) {
        // Plan might not exist; skip
        return;
      }

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.features)).toBe(true);
      expect(Array.isArray(res.body.data.featuresBg)).toBe(true);
    });
  });

  describe('Authenticated endpoints should not 500 with malformed plan features', () => {
    let app: any;
    let user: any;
    let token: string;
    let subscription: any;

    beforeAll(async () => {
      app = await createTestApp();

      // Create test user
      user = await prisma.user.create({
        data: {
          email: `qa-017-auth-${Date.now()}@test.local`,
          firstName: 'Auth',
          lastName: 'Test',
          phone: '+359111111111',
          passwordHash: 'hashed_password',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Create subscription to malformed plan
      subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'MALFORMED_TEST',
          status: 'ACTIVE',
          stripePriceId: 'price_test_malformed',
          stripeCustomerId: 'cust_test_malformed',
          stripeSubscriptionId: 'sub_test_malformed',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          autoRenewal: true,
        },
      });

      // Create card
      await prisma.card.create({
        data: {
          userId: user.id,
          cardNumber: '1234567890123456',
          type: 'MALFORMED_TEST',
          status: 'ACTIVE',
          qrCode: 'data:image/png;base64,test',
        },
      });

      // Generate test token
      token = generateTestToken(user.id, 'USER');
    });

    afterAll(async () => {
      // Clean up
      if (subscription) {
        await prisma.subscription.deleteMany({
          where: { userId: user.id },
        });
      }
      if (user) {
        await prisma.card.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
      await app.close();
    });

    it('GET /api/dashboard/me should NOT 500 with malformed plan features', async () => {
      const res = await request(app)
        .get('/api/dashboard/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Verify subscription benefits are present with empty features
      if (res.body.data.subscription) {
        expect(res.body.data.subscription.benefits).toBeDefined();
        expect(Array.isArray(res.body.data.subscription.benefits.features)).toBe(true);
      }
    });

    it('GET /api/subscriptions/current should NOT 500 with malformed plan features', async () => {
      const res = await request(app)
        .get('/api/subscriptions/current')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Subscription should be found even if features are malformed
      if (res.body.data.plan) {
        expect(Array.isArray(res.body.data.benefits.features)).toBe(true);
      }
    });
  });
});

// Helper function to generate test tokens
function generateTestToken(userId: string, role: string = 'USER'): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn: '1h' }
  );
}
