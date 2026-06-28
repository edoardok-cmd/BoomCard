/**
 * Integration tests for BC-ADMIN-SPEC-REAUDIT6-PAYOUTS-BGN-LEAK-1
 *
 * Tests that the GET /api/admin/payouts endpoint correctly gates raw BGN
 * scalars in both the summary and filteredSummary objects, and in nested
 * payout items, when the currency transition window is CLOSED.
 *
 * Spec: §3.7 / §8.1 rule 4 / Clash 12.1
 *
 * Issues fixed:
 * 1. HIGH — filteredSummary BGN totals (pendingTotal, processingTotal,
 *    completedTotal, failedTotal) must be omitted when window CLOSED
 * 2. HIGH — Nested wallet.availableBalance and wallet.pendingBalance must
 *    be omitted when window CLOSED; top-level payout amount/balanceBefore/
 *    balanceAfter must also be omitted
 * 3. MEDIUM — Cache staleness in 60-second eventual-consistency window
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { invalidateCurrencyDisplayCache } from '../../src/utils/currencyDisplay';

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_opts: any) => Promise.resolve(),
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

// Helper to toggle the currency window state and invalidate cache
async function setCurrencyWindowOpen(isOpen: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'currency_transition_window_open' },
    create: { key: 'currency_transition_window_open', value: isOpen ? 'true' : 'false' },
    update: { value: isOpen ? 'true' : 'false' },
  });
  // Invalidate the cache immediately so the change takes effect on the next call
  invalidateCurrencyDisplayCache();
}

describe('BC-ADMIN-SPEC-REAUDIT6-PAYOUTS-BGN-LEAK-1: Payouts currency display gating', () => {
  let adminToken: string;
  let testUserIds: string[] = [];
  let testWalletIds: string[] = [];
  let testPayoutIds: string[] = [];

  beforeAll(async () => {
    // Create admin user and get token
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-reaudit6-${Date.now()}@test.local`,
        firstName: 'Admin',
        lastName: 'Test',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
        phone: '+359000000000',
      },
    });
    adminToken = generateTestToken(adminUser.id, 'SUPER_ADMIN');
    testUserIds.push(adminUser.id);

    // Create test users with wallets and payouts in various statuses
    for (let i = 0; i < 2; i++) {
      const user = await prisma.user.create({
        data: {
          email: `user-reaudit6-${i}-${Date.now()}@test.local`,
          firstName: `User`,
          lastName: `${i}`,
          status: 'ACTIVE',
          role: 'USER',
          emailVerified: true,
          passwordHash: 'unused',
          subscriptions: {
            create: {
              plan: 'BASIC',
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
          phone: '+359000000001',
        },
      });
      testUserIds.push(user.id);

      // Create wallet
      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          balance: 1000,
          availableBalance: 1000,
          pendingBalance: 0,
          payoutIban: 'BG80BNBG96611020345678',
          payoutBeneficiaryName: `Test User ${i}`,
        },
      });
      testWalletIds.push(wallet.id);

      // Create test payouts in various statuses
      const statuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
      for (let j = 0; j < statuses.length; j++) {
        const payout = await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'WITHDRAWAL',
            amount: -100 - j * 10, // BGN amounts
            currency: 'BGN',
            status: statuses[j],
            balanceBefore: 1000 - j * 10,
            balanceAfter: 900 - j * 10,
            description: `Test payout ${j}`,
          },
        });
        testPayoutIds.push(payout.id);
      }
    }

    // Ensure window starts in known state (open)
    await setCurrencyWindowOpen(true);
  });

  afterEach(async () => {
    // Clean up window state after each test to ensure isolation
    await prisma.systemSetting.deleteMany({
      where: { key: 'currency_transition_window_open' },
    });
  });

  afterAll(async () => {
    // Clean up all test data
    await prisma.walletTransaction.deleteMany({
      where: { id: { in: testPayoutIds } },
    });
    await prisma.wallet.deleteMany({
      where: { id: { in: testWalletIds } },
    });
    for (const userId of testUserIds) {
      await prisma.userPermissionOverride.deleteMany({
        where: { userId },
      });
      await prisma.subscription.deleteMany({
        where: { userId },
      });
      await prisma.user.delete({
        where: { id: userId },
      }).catch(() => {
        // Silently ignore if user doesn't exist
      });
    }
  });

  describe('Issue 1: filteredSummary BGN totals gating', () => {
    it('should include filteredSummary {*Total} fields when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('filteredSummary');
      const fs = res.body.filteredSummary;

      // When window is OPEN, all *Total fields should be present and numeric
      if (fs.pendingCount > 0) {
        expect(fs).toHaveProperty('pendingTotal');
        expect(typeof fs.pendingTotal).toBe('number');
      }
      if (fs.processingCount > 0) {
        expect(fs).toHaveProperty('processingTotal');
        expect(typeof fs.processingTotal).toBe('number');
      }
      if (fs.completedCount > 0) {
        expect(fs).toHaveProperty('completedTotal');
        expect(typeof fs.completedTotal).toBe('number');
      }
      if (fs.failedCount > 0) {
        expect(fs).toHaveProperty('failedTotal');
        expect(typeof fs.failedTotal).toBe('number');
      }
    });

    it('should omit filteredSummary {*Total} fields when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('filteredSummary');
      const fs = res.body.filteredSummary;

      // When window is CLOSED, *Total fields must be absent (undefined serializes to omission)
      expect(fs).not.toHaveProperty('pendingTotal');
      expect(fs).not.toHaveProperty('processingTotal');
      expect(fs).not.toHaveProperty('completedTotal');
      expect(fs).not.toHaveProperty('failedTotal');

      // But counts should still be present
      expect(fs).toHaveProperty('pendingCount');
      expect(fs).toHaveProperty('processingCount');
      expect(fs).toHaveProperty('completedCount');
      expect(fs).toHaveProperty('failedCount');
    });
  });

  describe('Issue 2: Payout item amount and wallet balance gating', () => {
    it('should include amount/balanceBefore/balanceAfter in payout items when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('payouts');
      expect(Array.isArray(res.body.payouts)).toBe(true);

      const payout = res.body.payouts[0];
      expect(payout).toHaveProperty('amount');
      expect(typeof payout.amount).toBe('number');
      expect(payout).toHaveProperty('balanceBefore');
      expect(typeof payout.balanceBefore).toBe('number');
      expect(payout).toHaveProperty('balanceAfter');
      expect(typeof payout.balanceAfter).toBe('number');
    });

    it('should omit amount/balanceBefore/balanceAfter in payout items when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('payouts');
      expect(Array.isArray(res.body.payouts)).toBe(true);

      const payout = res.body.payouts[0];
      // These fields should be undefined (and thus omitted from JSON)
      expect(payout).not.toHaveProperty('amount');
      expect(payout).not.toHaveProperty('balanceBefore');
      expect(payout).not.toHaveProperty('balanceAfter');

      // But other payout fields should still be present
      expect(payout).toHaveProperty('id');
      expect(payout).toHaveProperty('status');
      expect(payout).toHaveProperty('currency');
    });

    it('should include wallet.availableBalance/pendingBalance when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('payouts');
      const payout = res.body.payouts[0];

      expect(payout).toHaveProperty('wallet');
      expect(payout.wallet).toHaveProperty('availableBalance');
      expect(typeof payout.wallet.availableBalance).toBe('number');
      expect(payout.wallet).toHaveProperty('pendingBalance');
      expect(typeof payout.wallet.pendingBalance).toBe('number');
    });

    it('should omit wallet.availableBalance/pendingBalance when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('payouts');
      const payout = res.body.payouts[0];

      expect(payout).toHaveProperty('wallet');
      // These fields should be undefined (and thus omitted from JSON)
      expect(payout.wallet).not.toHaveProperty('availableBalance');
      expect(payout.wallet).not.toHaveProperty('pendingBalance');

      // But other wallet fields should still be present
      expect(payout.wallet).toHaveProperty('id');
      expect(payout.wallet).toHaveProperty('payoutIban');
      expect(payout.wallet).toHaveProperty('payoutBeneficiaryName');
    });
  });

  describe('Issue 2: Payout summary object gating (main summary, not filtered)', () => {
    it('should include summary {*Total} fields when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('summary');
      const s = res.body.summary;

      // When window is OPEN, all *Total fields should be present
      expect(s).toHaveProperty('pendingTotal');
      expect(typeof s.pendingTotal).toBe('number');
      expect(s).toHaveProperty('processingTotal');
      expect(typeof s.processingTotal).toBe('number');
      expect(s).toHaveProperty('completedTotal');
      expect(typeof s.completedTotal).toBe('number');
      expect(s).toHaveProperty('failedTotal');
      expect(typeof s.failedTotal).toBe('number');

      // display should always be present
      expect(s).toHaveProperty('display');
    });

    it('should omit summary {*Total} fields when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('summary');
      const s = res.body.summary;

      // When window is CLOSED, *Total fields must be absent
      expect(s).not.toHaveProperty('pendingTotal');
      expect(s).not.toHaveProperty('processingTotal');
      expect(s).not.toHaveProperty('completedTotal');
      expect(s).not.toHaveProperty('failedTotal');

      // But counts should still be present
      expect(s).toHaveProperty('pendingCount');
      expect(s).toHaveProperty('processingCount');
      expect(s).toHaveProperty('completedCount');
      expect(s).toHaveProperty('failedCount');

      // display should always be present
      expect(s).toHaveProperty('display');
    });
  });

  describe('Issue 3: Mutation endpoints BGN gating (PATCH /:id/hold, /release, /complete, /reset-stuck)', () => {
    let testPayoutId: string;

    beforeEach(async () => {
      // Create a fresh payout for mutation tests
      const user = await prisma.user.create({
        data: {
          email: `user-mutation-${Date.now()}@test.local`,
          firstName: 'Mutation',
          lastName: 'Test',
          status: 'ACTIVE',
          role: 'USER',
          emailVerified: true,
          passwordHash: 'unused',
          subscriptions: {
            create: {
              plan: 'BASIC',
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
          phone: '+359000000002',
        },
      });

      const wallet = await prisma.wallet.create({
        data: {
          userId: user.id,
          balance: 5000,
          availableBalance: 5000,
          pendingBalance: 0,
          payoutIban: 'BG80BNBG96611020345678',
          payoutBeneficiaryName: 'Test User Mutation',
        },
      });

      const payout = await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: -500,
          currency: 'BGN',
          status: 'PENDING',
          balanceBefore: 5000,
          balanceAfter: 4500,
          description: 'Test payout for mutation',
        },
      });

      testPayoutId = payout.id;
    });

    it('PATCH /:id/hold should include amount/balances when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/hold`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test hold' })
        .expect(200);

      expect(res.body).toHaveProperty('amount');
      expect(typeof res.body.amount).toBe('number');
      expect(res.body).toHaveProperty('balanceBefore');
      expect(typeof res.body.balanceBefore).toBe('number');
      expect(res.body).toHaveProperty('balanceAfter');
      expect(typeof res.body.balanceAfter).toBe('number');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).toHaveProperty('availableBalance');
      expect(typeof res.body.wallet.availableBalance).toBe('number');
    });

    it('PATCH /:id/hold should omit amount/balances when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/hold`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test hold' })
        .expect(200);

      expect(res.body).not.toHaveProperty('amount');
      expect(res.body).not.toHaveProperty('balanceBefore');
      expect(res.body).not.toHaveProperty('balanceAfter');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).not.toHaveProperty('availableBalance');
      expect(res.body.wallet).not.toHaveProperty('pendingBalance');

      // But status and other fields should still be present
      expect(res.body).toHaveProperty('status');
      expect(res.body.status).toBe('RISK_HOLD');
      expect(res.body).toHaveProperty('id');
    });

    it('PATCH /:id/release should include amount/balances when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      // First, put payout in RISK_HOLD state
      await prisma.walletTransaction.update({
        where: { id: testPayoutId },
        data: { status: 'RISK_HOLD', metadata: JSON.stringify({ manualHold: true }) },
      });

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/release`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('amount');
      expect(typeof res.body.amount).toBe('number');
      expect(res.body).toHaveProperty('balanceBefore');
      expect(typeof res.body.balanceBefore).toBe('number');
      expect(res.body).toHaveProperty('balanceAfter');
      expect(typeof res.body.balanceAfter).toBe('number');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).toHaveProperty('availableBalance');
      expect(typeof res.body.wallet.availableBalance).toBe('number');
    });

    it('PATCH /:id/release should omit amount/balances when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      // First, put payout in RISK_HOLD state
      await prisma.walletTransaction.update({
        where: { id: testPayoutId },
        data: { status: 'RISK_HOLD', metadata: JSON.stringify({ manualHold: true }) },
      });

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/release`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('amount');
      expect(res.body).not.toHaveProperty('balanceBefore');
      expect(res.body).not.toHaveProperty('balanceAfter');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).not.toHaveProperty('availableBalance');
      expect(res.body.wallet).not.toHaveProperty('pendingBalance');

      // But status and other fields should still be present
      expect(res.body).toHaveProperty('status');
      expect(res.body.status).toBe('PENDING');
      expect(res.body).toHaveProperty('id');
    });

    it('PATCH /:id/complete should include amount/balances when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      // First, put payout in PROCESSING state
      await prisma.walletTransaction.update({
        where: { id: testPayoutId },
        data: { status: 'PROCESSING' },
      });

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('amount');
      expect(typeof res.body.amount).toBe('number');
      expect(res.body).toHaveProperty('balanceBefore');
      expect(typeof res.body.balanceBefore).toBe('number');
      expect(res.body).toHaveProperty('balanceAfter');
      expect(typeof res.body.balanceAfter).toBe('number');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).toHaveProperty('availableBalance');
      expect(typeof res.body.wallet.availableBalance).toBe('number');
    });

    it('PATCH /:id/complete should omit amount/balances when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      // First, put payout in PROCESSING state
      await prisma.walletTransaction.update({
        where: { id: testPayoutId },
        data: { status: 'PROCESSING' },
      });

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('amount');
      expect(res.body).not.toHaveProperty('balanceBefore');
      expect(res.body).not.toHaveProperty('balanceAfter');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).not.toHaveProperty('availableBalance');
      expect(res.body.wallet).not.toHaveProperty('pendingBalance');

      // But status and other fields should still be present
      expect(res.body).toHaveProperty('status');
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body).toHaveProperty('id');
    });

    it('PATCH /:id/reset-stuck should include amount/balances when window is OPEN', async () => {
      await setCurrencyWindowOpen(true);

      // First, put payout in PROCESSING state (simulating stuck state)
      const olderDate = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
      await prisma.walletTransaction.update({
        where: { id: testPayoutId },
        data: {
          status: 'PROCESSING',
          metadata: JSON.stringify({ processingStartedAt: olderDate }),
        },
      });

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/reset-stuck`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('amount');
      expect(typeof res.body.amount).toBe('number');
      expect(res.body).toHaveProperty('balanceBefore');
      expect(typeof res.body.balanceBefore).toBe('number');
      expect(res.body).toHaveProperty('balanceAfter');
      expect(typeof res.body.balanceAfter).toBe('number');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).toHaveProperty('availableBalance');
      expect(typeof res.body.wallet.availableBalance).toBe('number');
    });

    it('PATCH /:id/reset-stuck should omit amount/balances when window is CLOSED', async () => {
      await setCurrencyWindowOpen(false);

      // First, put payout in PROCESSING state (simulating stuck state)
      const olderDate = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
      await prisma.walletTransaction.update({
        where: { id: testPayoutId },
        data: {
          status: 'PROCESSING',
          metadata: JSON.stringify({ processingStartedAt: olderDate }),
        },
      });

      const res = await request(app)
        .patch(`/api/admin/payouts/${testPayoutId}/reset-stuck`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).not.toHaveProperty('amount');
      expect(res.body).not.toHaveProperty('balanceBefore');
      expect(res.body).not.toHaveProperty('balanceAfter');
      expect(res.body).toHaveProperty('wallet');
      expect(res.body.wallet).not.toHaveProperty('availableBalance');
      expect(res.body.wallet).not.toHaveProperty('pendingBalance');

      // But status and other fields should still be present
      expect(res.body).toHaveProperty('status');
      expect(res.body.status).toBe('PENDING');
      expect(res.body).toHaveProperty('id');
    });
  });
});
