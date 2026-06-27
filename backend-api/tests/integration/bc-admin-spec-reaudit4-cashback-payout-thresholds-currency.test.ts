/**
 * Integration tests for BC-ADMIN-SPEC-REAUDIT4-PAYOUT-THRESH-BGN-LEAK-1
 *
 * Tests that the GET /api/admin/cashback/payout-thresholds endpoint
 * correctly gates raw BGN scalars by the currency transition window state
 * and provides dual-currency display, matching the spec requirement
 * (§3.7 / §8.1 rule 4 / Clash 12.1).
 *
 * Context: The endpoint was previously missing currency gating and EUR display;
 * while the sibling GET /api/admin/finance/payout-thresholds was fixed in
 * BC-ADMIN-SPEC-REAUDIT3, this cashback endpoint was missed.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }

  const payload = {
    id: userId,
    email: `test-${userId}@test.local`,
    role,
  };

  const token = jwt.sign(payload, jwtSecret, {
    expiresIn: '15m',
  });

  return token;
}

// Helper to toggle the currency window state
async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
}

describe('BC-ADMIN-SPEC-REAUDIT4-PAYOUT-THRESH-BGN-LEAK-1: Cashback payout-thresholds currency display', () => {
  let adminToken: string;

  beforeAll(async () => {
    // Create admin user and get token
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-reaudit4-${Date.now()}@test.local`,
        firstName: 'Admin',
        lastName: 'Test',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    adminToken = generateTestToken(adminUser.id, 'SUPER_ADMIN');
  });

  describe('GET /api/admin/cashback/payout-thresholds', () => {
    it('should include raw BGN scalars AND display object when window is open', async () => {
      await setCurrencyWindowOpen(true);
      const res = await request(app)
        .get('/api/admin/cashback/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify raw BGN scalars are present when window is open
      expect(res.body.data).toBeDefined();
      expect(res.body.data.BASIC).toBeDefined();
      expect(typeof res.body.data.BASIC).toBe('number');
      expect(res.body.data.BASIC).toBeGreaterThan(0);

      expect(res.body.data.PREMIUM_WEEKLY).toBeDefined();
      expect(typeof res.body.data.PREMIUM_WEEKLY).toBe('number');
      expect(res.body.data.PREMIUM_WEEKLY).toBeGreaterThan(0);

      expect(res.body.data.PREMIUM).toBeDefined();
      expect(typeof res.body.data.PREMIUM).toBe('number');
      expect(res.body.data.PREMIUM).toBeGreaterThan(0);

      // Verify backward-compat alias
      expect(res.body.data.PREMIUM_MONTHLY).toBeDefined();
      expect(res.body.data.PREMIUM_MONTHLY).toEqual(res.body.data.PREMIUM);

      // Verify display object has dual-currency pairs
      expect(res.body.display).toBeDefined();
      expect(res.body.display.BASIC).toBeDefined();
      expect(res.body.display.BASIC).toHaveProperty('bgn');
      expect(res.body.display.BASIC).toHaveProperty('eur');
      expect(res.body.display.BASIC).toHaveProperty('windowOpen');
      expect(res.body.display.BASIC.bgn).toBe(res.body.data.BASIC);
      expect(res.body.display.BASIC.eur).toBeGreaterThan(0);
      expect(res.body.display.BASIC.windowOpen).toBe(true);

      expect(res.body.display.PREMIUM_WEEKLY).toBeDefined();
      expect(res.body.display.PREMIUM_WEEKLY.bgn).toBe(res.body.data.PREMIUM_WEEKLY);
      expect(res.body.display.PREMIUM_WEEKLY.eur).toBeGreaterThan(0);
      expect(res.body.display.PREMIUM_WEEKLY.windowOpen).toBe(true);

      expect(res.body.display.PREMIUM).toBeDefined();
      expect(res.body.display.PREMIUM.bgn).toBe(res.body.data.PREMIUM);
      expect(res.body.display.PREMIUM.eur).toBeGreaterThan(0);
      expect(res.body.display.PREMIUM.windowOpen).toBe(true);

      // Verify backward-compat alias display
      expect(res.body.display.PREMIUM_MONTHLY).toBeDefined();
      expect(res.body.display.PREMIUM_MONTHLY).toEqual(res.body.display.PREMIUM);
    });

    it('should omit raw BGN scalars AND nullify bgn in display when window is closed', async () => {
      await setCurrencyWindowOpen(false);
      const res = await request(app)
        .get('/api/admin/cashback/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify raw BGN scalars are omitted when window is closed
      expect(res.body.data).toBeDefined();
      expect(res.body.data.BASIC).toBeUndefined();
      expect(res.body.data.PREMIUM_WEEKLY).toBeUndefined();
      expect(res.body.data.PREMIUM).toBeUndefined();
      expect(res.body.data.PREMIUM_MONTHLY).toBeUndefined();

      // Verify display object has EUR-only pairs (bgn=null)
      expect(res.body.display).toBeDefined();

      expect(res.body.display.BASIC).toBeDefined();
      expect(res.body.display.BASIC).toHaveProperty('bgn');
      expect(res.body.display.BASIC).toHaveProperty('eur');
      expect(res.body.display.BASIC).toHaveProperty('windowOpen');
      expect(res.body.display.BASIC.bgn).toBeNull();
      expect(res.body.display.BASIC.eur).toBeGreaterThan(0);
      expect(res.body.display.BASIC.windowOpen).toBe(false);

      expect(res.body.display.PREMIUM_WEEKLY).toBeDefined();
      expect(res.body.display.PREMIUM_WEEKLY.bgn).toBeNull();
      expect(res.body.display.PREMIUM_WEEKLY.eur).toBeGreaterThan(0);
      expect(res.body.display.PREMIUM_WEEKLY.windowOpen).toBe(false);

      expect(res.body.display.PREMIUM).toBeDefined();
      expect(res.body.display.PREMIUM.bgn).toBeNull();
      expect(res.body.display.PREMIUM.eur).toBeGreaterThan(0);
      expect(res.body.display.PREMIUM.windowOpen).toBe(false);

      // Verify backward-compat alias display
      expect(res.body.display.PREMIUM_MONTHLY).toBeDefined();
      expect(res.body.display.PREMIUM_MONTHLY).toEqual(res.body.display.PREMIUM);
    });

    it('should require cashback.read permission', async () => {
      // Try without auth
      const res = await request(app)
        .get('/api/admin/cashback/payout-thresholds');

      expect(res.status).toBe(401);
    });

    it('should maintain consistency with finance payout-thresholds response structure', async () => {
      await setCurrencyWindowOpen(true);

      const cashbackRes = await request(app)
        .get('/api/admin/cashback/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      const financeRes = await request(app)
        .get('/api/admin/finance/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(cashbackRes.status).toBe(200);
      expect(financeRes.status).toBe(200);

      // Both should have the same structure
      expect(cashbackRes.body).toHaveProperty('success');
      expect(cashbackRes.body).toHaveProperty('data');
      expect(cashbackRes.body).toHaveProperty('display');

      expect(financeRes.body).toHaveProperty('success');
      expect(financeRes.body).toHaveProperty('data');
      expect(financeRes.body).toHaveProperty('display');

      // Both should have same plan keys in data
      expect(Object.keys(cashbackRes.body.data).sort()).toEqual(
        Object.keys(financeRes.body.data).sort()
      );

      // Both should have same plan keys in display
      expect(Object.keys(cashbackRes.body.display).sort()).toEqual(
        Object.keys(financeRes.body.display).sort()
      );

      // Threshold values and display pairs should match
      const plans = ['BASIC', 'PREMIUM_WEEKLY', 'PREMIUM', 'PREMIUM_MONTHLY'];
      for (const plan of plans) {
        expect(cashbackRes.body.data[plan]).toBe(financeRes.body.data[plan]);
        expect(cashbackRes.body.display[plan]).toEqual(financeRes.body.display[plan]);
      }
    });
  });
});
