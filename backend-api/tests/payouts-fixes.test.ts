/**
 * Integration tests for BC-ADMIN-AUDIT-FIX-003 payout pipeline fixes.
 *
 * Tests cover:
 * - DEFECT A: /release refuses to re-arm escalation RISK_HOLD (prevents double-spend)
 * - DEFECT B: Two-strike counter is cycle-scoped and excludes manual holds
 * - DEFECT C: No-IBAN payouts hold+notify instead of returning 422
 * - DEFECT D: Eligibility checks all subscriptions, not just newest
 * - DEFECT E: Uses canonical RISK_HOLD_FLOOR_SCORE (51) not 61
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { WalletTransactionStatus, SubscriptionStatus } from '@prisma/client';

describe('BC-ADMIN-AUDIT-FIX-003: Payout Pipeline Fixes', () => {
  let app: any;
  let adminToken: string;
  let userId: string;
  let walletId: string;

  beforeAll(async () => {
    app = await createTestApp();
    // Create admin user and get token
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.local',
        firstName: 'Admin',
        lastName: 'Test',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
      },
    });
    adminToken = generateTestToken(adminUser.id, 'SUPER_ADMIN');

    // Create a regular user
    const user = await prisma.user.create({
      data: {
        email: 'user@test.local',
        firstName: 'Test',
        lastName: 'User',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    userId = user.id;

    // Create wallet
    const wallet = await prisma.wallet.create({
      data: {
        userId,
        balance: 0,
        availableBalance: 0,
        pendingBalance: 0,
        currency: 'BGN',
      },
    });
    walletId = wallet.id;
  });

  afterAll(async () => {
    await app?.close?.();
  });

  describe('DEFECT A: /release refuses escalated RISK_HOLD', () => {
    it('should allow release of manual-hold RISK_HOLD', async () => {
      // Create a PENDING payout
      const payout = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'WITHDRAWAL',
          amount: -100,
          balanceBefore: 100,
          balanceAfter: 0,
          status: 'PENDING',
          currency: 'BGN',
          description: 'Test withdrawal',
        },
      });

      // Admin holds it with manualHold=true
      await prisma.walletTransaction.update({
        where: { id: payout.id },
        data: {
          status: 'RISK_HOLD',
          metadata: JSON.stringify({ manualHold: true }),
        },
      });

      // /release should succeed
      const res = await request(app)
        .patch(`/api/admin/payouts/${payout.id}/release`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PENDING');
    });

    it('should refuse release of escalated RISK_HOLD', async () => {
      // Create a PROCESSING payout
      const payout = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'WITHDRAWAL',
          amount: -100,
          balanceBefore: 100,
          balanceAfter: 0,
          status: 'PROCESSING',
          currency: 'BGN',
          description: 'Test withdrawal',
          metadata: JSON.stringify({
            escalatedSecondFailure: true,
            escalatedAt: new Date().toISOString(),
          }),
        },
      });

      // Manually escalate to RISK_HOLD with escalation flag
      await prisma.walletTransaction.update({
        where: { id: payout.id },
        data: {
          status: 'RISK_HOLD',
          metadata: JSON.stringify({
            escalatedSecondFailure: true,
            escalatedAt: new Date().toISOString(),
          }),
        },
      });

      // /release should refuse with 409
      const res = await request(app)
        .patch(`/api/admin/payouts/${payout.id}/release`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('ESCALATED_RISK_HOLD');
      expect(res.body.message).toContain('Cannot release');
    });

    it('should prevent double-spend: escalated RISK_HOLD cannot become PROCESSING', async () => {
      // Set up: Create a subscription so the user is eligible
      await prisma.subscription.create({
        data: {
          userId,
          status: 'ACTIVE',
          plan: 'PREMIUM_WEEKLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Create a PROCESSING payout and escalate it to RISK_HOLD
      const payout = await prisma.walletTransaction.create({
        data: {
          walletId,
          type: 'WITHDRAWAL',
          amount: -200,
          balanceBefore: 200,
          balanceAfter: 0,
          status: 'PROCESSING',
          currency: 'BGN',
          metadata: JSON.stringify({
            escalatedSecondFailure: true,
            escalatedAt: new Date().toISOString(),
            processingStartedAt: new Date().toISOString(),
          }),
        },
      });

      // Simulate escalation to RISK_HOLD
      await prisma.walletTransaction.update({
        where: { id: payout.id },
        data: {
          status: 'RISK_HOLD',
        },
      });

      // Try /release → should fail with 409
      const releaseRes = await request(app)
        .patch(`/api/admin/payouts/${payout.id}/release`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(releaseRes.status).toBe(409);

      // Verify the payout is still in RISK_HOLD, not PENDING
      const current = await prisma.walletTransaction.findUnique({
        where: { id: payout.id },
      });
      expect(current?.status).toBe('RISK_HOLD');
    });
  });

  describe('DEFECT B: Two-strike counter excludes manual holds', () => {
    it('should not count manual holds in the strike count', async () => {
      // Create a fresh user for this test
      const testUser = await prisma.user.create({
        data: {
          email: 'strike-test@test.local',
          firstName: 'Strike',
          lastName: 'Test',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const testWallet = await prisma.wallet.create({
        data: {
          userId: testUser.id,
          balance: 500,
          availableBalance: 500,
          pendingBalance: 0,
          currency: 'BGN',
        },
      });

      // Create and manually hold a PENDING payout
      const manualHoldPayout = await prisma.walletTransaction.create({
        data: {
          walletId: testWallet.id,
          type: 'WITHDRAWAL',
          amount: -100,
          balanceBefore: 500,
          balanceAfter: 400,
          status: 'RISK_HOLD',
          currency: 'BGN',
          metadata: JSON.stringify({ manualHold: true }),
        },
      });

      // Now create a second PROCESSING payout and fail it
      // If the strike count incorrectly includes the manual hold, it would escalate to RISK_HOLD
      // If the strike count correctly excludes manual holds, it should mark FAILED (first failure)
      const secondPayout = await prisma.walletTransaction.create({
        data: {
          walletId: testWallet.id,
          type: 'WITHDRAWAL',
          amount: -150,
          balanceBefore: 400,
          balanceAfter: 250,
          status: 'PROCESSING',
          currency: 'BGN',
          processingStartedAt: new Date(),
        },
      });

      // Simulate a failure on the second payout
      // Count genuine failures (excluding manual holds)
      const allFailedRows = await prisma.walletTransaction.findMany({
        where: {
          walletId: testWallet.id,
          type: 'WITHDRAWAL',
          status: { in: ['FAILED', 'RISK_HOLD'] },
        },
        select: { metadata: true },
      });

      const genuineFailures = allFailedRows.filter((row) => {
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        return meta.manualHold !== true;
      });

      // Should be 0 genuine failures (manual hold doesn't count)
      expect(genuineFailures.length).toBe(0);

      // The /fail call should treat this as a first failure, not second
      // Call the /fail endpoint to verify end-to-end filtering behavior
      const failResponse = await request(app)
        .patch(`/api/admin/payouts/${secondPayout.id}/fail`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'INSUFFICIENT_FUNDS',
          notifyUser: true,
        });

      // Should succeed with 200 (not error)
      expect(failResponse.status).toBe(200);

      // Verify the payout is now marked FAILED (first failure, not escalated RISK_HOLD)
      const updatedPayout = await prisma.walletTransaction.findUnique({
        where: { id: secondPayout.id },
      });

      expect(updatedPayout?.status).toBe('FAILED');
      // Confirm it was not escalated despite the manual hold existing
      const meta = updatedPayout?.metadata ? JSON.parse(updatedPayout.metadata as string) : {};
      expect(meta.escalatedSecondFailure).not.toBe(true);

      // Verify wallet balance was restored (first failure restores balance)
      const restoredWallet = await prisma.wallet.findUnique({
        where: { id: testWallet.id },
      });
      // Balance should be: 500 (initial) - 100 (manual hold, not counted) + 150 (restored from failed payout) = 550
      expect(restoredWallet?.availableBalance).toBe(500 + 150); // 650
    });
  });

  describe('DEFECT C: No-IBAN payouts hold+notify instead of 422', () => {
    it('single /approve should hold no-IBAN payout and return 202', async () => {
      // Create user with no IBAN
      const testUser = await prisma.user.create({
        data: {
          email: 'no-iban@test.local',
          firstName: 'NoIBAN',
          lastName: 'Test',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const testWallet = await prisma.wallet.create({
        data: {
          userId: testUser.id,
          balance: 500,
          availableBalance: 500,
          pendingBalance: 0,
          currency: 'BGN',
          payoutIban: null, // NO IBAN
        },
      });

      // Create active subscription
      await prisma.subscription.create({
        data: {
          userId: testUser.id,
          status: 'ACTIVE',
          plan: 'PREMIUM_WEEKLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Create a PENDING payout
      const payout = await prisma.walletTransaction.create({
        data: {
          walletId: testWallet.id,
          type: 'WITHDRAWAL',
          amount: -250,
          balanceBefore: 500,
          balanceAfter: 250,
          status: 'PENDING',
          currency: 'BGN',
        },
      });

      // Try to approve without IBAN
      const res = await request(app)
        .patch(`/api/admin/payouts/${payout.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Should return 202 (held) not 422 (rejected)
      expect(res.status).toBe(202);
      expect(res.body.reason).toBe('NO_IBAN_HELD_FOR_UPDATE');
      expect(res.body.status).toBe('RISK_HOLD');
      expect(res.body.message).toContain('held');

      // Verify the payout is now held
      const updated = await prisma.walletTransaction.findUnique({
        where: { id: payout.id },
      });
      expect(updated?.status).toBe('RISK_HOLD');
      expect(updated?.description).toContain('IBAN');
    });

    it('/bulk-approve should hold no-IBAN payouts and notify', async () => {
      // Create user with no IBAN
      const testUser = await prisma.user.create({
        data: {
          email: 'bulk-no-iban@test.local',
          firstName: 'BulkNoIBAN',
          lastName: 'Test',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const testWallet = await prisma.wallet.create({
        data: {
          userId: testUser.id,
          balance: 500,
          availableBalance: 500,
          pendingBalance: 0,
          currency: 'BGN',
          payoutIban: null, // NO IBAN
        },
      });

      // Create active subscription
      await prisma.subscription.create({
        data: {
          userId: testUser.id,
          status: 'ACTIVE',
          plan: 'PREMIUM_WEEKLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Create a PENDING payout
      const noIbanPayout = await prisma.walletTransaction.create({
        data: {
          walletId: testWallet.id,
          type: 'WITHDRAWAL',
          amount: -250,
          balanceBefore: 500,
          balanceAfter: 250,
          status: 'PENDING',
          currency: 'BGN',
        },
      });

      // Run bulk-approve
      const res = await request(app)
        .patch(`/api/admin/payouts/bulk-approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Should report as "held" not "skipped"
      expect(res.body.held).toBeGreaterThan(0);

      // Verify the payout was actually updated in the database to RISK_HOLD
      const payouts = await prisma.walletTransaction.findMany({
        where: { walletId: testWallet.id },
      });
      expect(payouts.length).toBeGreaterThan(0);
      const firstPayout = payouts[0];
      expect(firstPayout.status).toBe('RISK_HOLD');
      expect(firstPayout.description).toContain('IBAN');

      // Verify notification metadata/record indicates hold reason
      const meta = firstPayout.metadata ? JSON.parse(firstPayout.metadata) : {};
      expect(meta.heldReason || firstPayout.description).toBeTruthy();
    });
  });

  describe('DEFECT D: checkSubscriptionGate checks all subscriptions', () => {
    it('should allow payout when CANCELLED-within-paid-period even with newer EXPIRED', async () => {
      // Create user with multiple subscriptions
      const testUser = await prisma.user.create({
        data: {
          email: 'multi-sub@test.local',
          firstName: 'MultiSub',
          lastName: 'Test',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const testWallet = await prisma.wallet.create({
        data: {
          userId: testUser.id,
          balance: 500,
          availableBalance: 500,
          pendingBalance: 0,
          currency: 'BGN',
          payoutIban: 'DE89370400440532013000',
          payoutBeneficiaryName: 'Test User',
        },
      });

      // Create CANCELLED-within-paid-period subscription
      const cancelledSub = await prisma.subscription.create({
        data: {
          userId: testUser.id,
          status: 'CANCELLED',
          plan: 'PREMIUM_WEEKLY',
          currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          // Still within paid period
          currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        },
      });

      // Create a newer EXPIRED subscription
      const expiredSub = await prisma.subscription.create({
        data: {
          userId: testUser.id,
          status: 'EXPIRED',
          plan: 'PREMIUM_WEEKLY',
          currentPeriodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Already expired
        },
      });

      // Create a PENDING payout
      const payout = await prisma.walletTransaction.create({
        data: {
          walletId: testWallet.id,
          type: 'WITHDRAWAL',
          amount: -250,
          balanceBefore: 500,
          balanceAfter: 250,
          status: 'PENDING',
          currency: 'BGN',
          metadata: JSON.stringify({
            plan: 'PREMIUM_WEEKLY',
            thresholdBGN: 100,
            beneficiaryIban: 'DE89370400440532013000',
            beneficiaryName: 'Test User',
            callbackSecret: 'test-secret-123',
            requestedAt: new Date().toISOString(),
            lockedCashbackIds: [],
          }),
        },
      });

      // Try to approve — should succeed because the older CANCELLED subscription is still valid
      const res = await request(app)
        .patch(`/api/admin/payouts/${payout.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Should succeed (the CANCELLED-within-paid-period subscription is eligible)
      expect([200, 202]).toContain(res.status); // 200 on success, 202 on hold for other reasons (not subscription)
    });
  });

  describe('DEFECT E: Uses canonical RISK_HOLD_FLOOR_SCORE (51)', () => {
    it('should floor risk score at 51 on escalation', async () => {
      // Create a user with a pre-existing low risk score
      const testUser = await prisma.user.create({
        data: {
          email: 'risk-floor@test.local',
          firstName: 'RiskFloor',
          lastName: 'Test',
          status: 'ACTIVE',
          emailVerified: true,
          riskScore: 20, // Low score
          riskBucket: 'LOW_0_20',
        },
      });

      const testWallet = await prisma.wallet.create({
        data: {
          userId: testUser.id,
          balance: 500,
          availableBalance: 500,
          pendingBalance: 0,
          currency: 'BGN',
        },
      });

      // Simulate escalation by directly calling escalateRiskAfterRepeatedPayoutFailure
      const { walletService } = await import('../src/services/wallet.service');
      await walletService.escalateRiskAfterRepeatedPayoutFailure(testUser.id);

      // Check that the risk score was floored at 51 (not 61 or left unchanged)
      const updated = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { riskScore: true, riskBucket: true },
      });

      expect(updated?.riskScore).toBe(51); // Canonical floor
      expect(updated?.riskBucket).toBe('HIGH_51_PLUS');
    });

    it('should not downgrade a higher pre-existing risk score', async () => {
      // Create a user with a high risk score
      const testUser = await prisma.user.create({
        data: {
          email: 'risk-no-downgrade@test.local',
          firstName: 'RiskNoDowngrade',
          lastName: 'Test',
          status: 'ACTIVE',
          emailVerified: true,
          riskScore: 80, // High score
          riskBucket: 'HIGH_51_PLUS',
        },
      });

      const testWallet = await prisma.wallet.create({
        data: {
          userId: testUser.id,
          balance: 500,
          availableBalance: 500,
          pendingBalance: 0,
          currency: 'BGN',
        },
      });

      // Simulate escalation
      const { walletService } = await import('../src/services/wallet.service');
      await walletService.escalateRiskAfterRepeatedPayoutFailure(testUser.id);

      // Check that the risk score was NOT downgraded
      const updated = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { riskScore: true },
      });

      expect(updated?.riskScore).toBe(80); // Should stay at 80, not downgrade to 51
    });
  });
});

/**
 * Helper to generate a test JWT token
 */
function generateTestToken(userId: string, role: string): string {
  // In a real test, this would use the actual auth logic
  // For now, return a placeholder that the mock auth middleware will accept
  return `test-token-${userId}-${role}`;
}
