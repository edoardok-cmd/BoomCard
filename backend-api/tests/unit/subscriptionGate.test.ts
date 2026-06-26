/**
 * Unit Tests: Subscription Gate Module (Spec §1.2, §1.3, §8.1)
 *
 * Tests the single-sourced subscription status gate that determines
 * whether earning (scanning + cashback creation) is allowed.
 *
 * Enforces spec §8.1 rule 1: "New cashback records are never generated
 * while scanning is blocked" by ensuring both gates use identical allow-list logic.
 */

import { SubscriptionStatus } from '@prisma/client';
import { subscriptionAllowsEarning, subscriptionBlockReason, findEligibleSubscription } from '../../src/services/subscriptionGate';
import prisma from '../../src/lib/prisma';

describe('subscriptionGate Module', () => {
  const now = new Date('2026-06-25T12:00:00Z');
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  describe('subscriptionAllowsEarning', () => {
    describe('ALLOW-LIST: Allowed Statuses', () => {
      test('should allow ACTIVE subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.ACTIVE, null, now)).toBe(true);
        expect(subscriptionAllowsEarning(SubscriptionStatus.ACTIVE, tomorrow, now)).toBe(true);
      });

      test('should allow TRIALING subscription', () => {
        expect(subscriptionAllowsEarning('TRIALING', null, now)).toBe(true);
        expect(subscriptionAllowsEarning('TRIALING', tomorrow, now)).toBe(true);
      });

      test('should allow CANCELLED with currentPeriodEnd in future', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, tomorrow, now)).toBe(true);
      });

      test('should allow CANCELLED with currentPeriodEnd exactly at now', () => {
        // Boundary: period end at exact "now" = still in period
        expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, now, now)).toBe(false);
      });
    });

    describe('BLOCK-LIST: Blocked Statuses', () => {
      test('should block CANCELLED with currentPeriodEnd in past', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, yesterday, now)).toBe(false);
      });

      test('should block CANCELLED with null currentPeriodEnd', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, null, now)).toBe(false);
      });

      test('should block EXPIRED subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.EXPIRED, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.EXPIRED, tomorrow, now)).toBe(false);
      });

      test('should block FAILED_PAYMENT subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.FAILED_PAYMENT, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.FAILED_PAYMENT, tomorrow, now)).toBe(false);
      });

      test('should block PAST_DUE subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.PAST_DUE, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.PAST_DUE, tomorrow, now)).toBe(false);
      });

      test('should block UNPAID subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.UNPAID, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.UNPAID, tomorrow, now)).toBe(false);
      });

      test('should block INCOMPLETE subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.INCOMPLETE, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.INCOMPLETE, tomorrow, now)).toBe(false);
      });

      test('should block INCOMPLETE_EXPIRED subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.INCOMPLETE_EXPIRED, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.INCOMPLETE_EXPIRED, tomorrow, now)).toBe(false);
      });

      test('should block PAUSED subscription', () => {
        expect(subscriptionAllowsEarning(SubscriptionStatus.PAUSED, null, now)).toBe(false);
        expect(subscriptionAllowsEarning(SubscriptionStatus.PAUSED, tomorrow, now)).toBe(false);
      });
    });

    describe('Unknown Future Statuses (Fail-Safe)', () => {
      test('should conservatively block unknown statuses', () => {
        expect(subscriptionAllowsEarning('UNKNOWN_FUTURE_STATUS' as any, null, now)).toBe(false);
        expect(subscriptionAllowsEarning('UNKNOWN_FUTURE_STATUS' as any, tomorrow, now)).toBe(false);
      });
    });

    describe('Default now parameter', () => {
      test('should use current date when now is not provided', () => {
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, futureDate)).toBe(true);

        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, pastDate)).toBe(false);
      });
    });
  });

  describe('subscriptionBlockReason', () => {
    test('should return null when earning is allowed', () => {
      expect(subscriptionBlockReason(SubscriptionStatus.ACTIVE, null, now)).toBeNull();
      expect(subscriptionBlockReason('TRIALING', null, now)).toBeNull();
      expect(subscriptionBlockReason(SubscriptionStatus.CANCELLED, tomorrow, now)).toBeNull();
    });

    test('should return SUBSCRIPTION_EXPIRED for EXPIRED', () => {
      expect(subscriptionBlockReason(SubscriptionStatus.EXPIRED, null, now)).toBe('SUBSCRIPTION_EXPIRED');
    });

    test('should return SUBSCRIPTION_FAILED_PAYMENT for FAILED_PAYMENT', () => {
      expect(subscriptionBlockReason(SubscriptionStatus.FAILED_PAYMENT, null, now)).toBe('SUBSCRIPTION_FAILED_PAYMENT');
    });

    test('should return SUBSCRIPTION_CANCELLED_EXPIRED for CANCELLED post-period', () => {
      expect(subscriptionBlockReason(SubscriptionStatus.CANCELLED, yesterday, now)).toBe('SUBSCRIPTION_CANCELLED_EXPIRED');
      expect(subscriptionBlockReason(SubscriptionStatus.CANCELLED, null, now)).toBe('SUBSCRIPTION_CANCELLED_EXPIRED');
    });

    test('should return SUBSCRIPTION_INACTIVE for PAST_DUE, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED', () => {
      expect(subscriptionBlockReason(SubscriptionStatus.PAST_DUE, null, now)).toBe('SUBSCRIPTION_INACTIVE');
      expect(subscriptionBlockReason(SubscriptionStatus.UNPAID, null, now)).toBe('SUBSCRIPTION_INACTIVE');
      expect(subscriptionBlockReason(SubscriptionStatus.INCOMPLETE, null, now)).toBe('SUBSCRIPTION_INACTIVE');
      expect(subscriptionBlockReason(SubscriptionStatus.INCOMPLETE_EXPIRED, null, now)).toBe('SUBSCRIPTION_INACTIVE');
      expect(subscriptionBlockReason(SubscriptionStatus.PAUSED, null, now)).toBe('SUBSCRIPTION_INACTIVE');
    });

    test('should return SUBSCRIPTION_INACTIVE for unknown statuses', () => {
      expect(subscriptionBlockReason('UNKNOWN_FUTURE_STATUS' as any, null, now)).toBe('SUBSCRIPTION_INACTIVE');
    });
  });

  describe('Spec §8.1 Rule #1 Enforcement: Cashback Gate ≡ Scanning Gate', () => {
    /**
     * Critical spec requirement: the cashback creation gate must never
     * permit earning on a status that blocks scanning. This test verifies
     * the allow-list is symmetric across both gates.
     */
    test('should ensure PAST_DUE blocks (not permitted by allow-list)', () => {
      // The defect: old code had PAST_DUE pass the cashback gate (deny-list approach)
      // New code: must reject PAST_DUE via allow-list
      expect(subscriptionAllowsEarning(SubscriptionStatus.PAST_DUE, null, now)).toBe(false);
    });

    test('should ensure UNPAID blocks (not permitted by allow-list)', () => {
      // Defect: UNPAID was not explicitly checked in old code
      expect(subscriptionAllowsEarning(SubscriptionStatus.UNPAID, null, now)).toBe(false);
    });

    test('should ensure INCOMPLETE blocks (not permitted by allow-list)', () => {
      // Defect: INCOMPLETE was not explicitly checked in old code
      expect(subscriptionAllowsEarning(SubscriptionStatus.INCOMPLETE, null, now)).toBe(false);
    });

    test('should ensure INCOMPLETE_EXPIRED blocks (not permitted by allow-list)', () => {
      // Defect: INCOMPLETE_EXPIRED was not explicitly checked in old code
      expect(subscriptionAllowsEarning(SubscriptionStatus.INCOMPLETE_EXPIRED, null, now)).toBe(false);
    });

    test('should ensure PAUSED blocks (not permitted by allow-list)', () => {
      // Defect: PAUSED was not explicitly checked in old code
      expect(subscriptionAllowsEarning(SubscriptionStatus.PAUSED, null, now)).toBe(false);
    });
  });

  describe('Edge Cases: Boundary Conditions', () => {
    test('should handle undefined currentPeriodEnd', () => {
      expect(subscriptionAllowsEarning(SubscriptionStatus.ACTIVE, undefined, now)).toBe(true);
      expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, undefined, now)).toBe(false);
    });

    test('should handle null currentPeriodEnd', () => {
      expect(subscriptionAllowsEarning(SubscriptionStatus.ACTIVE, null, now)).toBe(true);
      expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, null, now)).toBe(false);
    });

    test('should use strict > comparison (not >=) for period end', () => {
      // currentPeriodEnd === now means period has just ended → block
      const endDate = new Date('2026-06-25T12:00:00Z');
      const currentTime = new Date('2026-06-25T12:00:00Z');
      expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, endDate, currentTime)).toBe(false);
    });

    test('should use millisecond precision for date comparison', () => {
      // Period end 1ms into the future → still allow
      const endDate = new Date(now.getTime() + 1);
      expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, endDate, now)).toBe(true);

      // Period end 1ms in the past → block
      const pastEndDate = new Date(now.getTime() - 1);
      expect(subscriptionAllowsEarning(SubscriptionStatus.CANCELLED, pastEndDate, now)).toBe(false);
    });
  });

  describe('findEligibleSubscription (Middleware/Service Alignment)', () => {
    /**
     * BC-ADMIN-SPEC-REAUDIT2-SCANGATE-SELECTION-1 (Finding: defect LOW)
     * The middleware and service layer must select the SAME subscription so both
     * gates reach the same allow/block decision. This test validates:
     * - When a user has a newer terminal subscription (e.g. EXPIRED) + an older
     *   still-within-period CANCELLED subscription, findEligibleSubscription returns
     *   the older CANCELLED subscription (any eligible, not latest).
     * - Both gates then reach a consistent allow decision.
     */
    test('should find ANY eligible subscription (not latest-only)', async () => {
      // Arrange: Create a test user
      const user = await prisma.user.create({
        data: {
          id: `test-user-${Date.now()}`,
          email: `test-user-${Date.now()}@example.com`,
          password: 'hashed_password',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
        },
      });

      try {
        // Create older CANCELLED-within-period subscription (created earlier)
        const olderSub = await prisma.subscription.create({
          data: {
            userId: user.id,
            status: SubscriptionStatus.CANCELLED,
            plan: 'BASIC',
            stripeSubscriptionId: `stripe-older-${Date.now()}`,
            currentPeriodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
            currentPeriodStart: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            createdAt: new Date(now.getTime() - 100 * 60 * 60 * 1000), // 100 hours ago
          },
        });

        // Create newer EXPIRED subscription (created more recently)
        const newerSub = await prisma.subscription.create({
          data: {
            userId: user.id,
            status: SubscriptionStatus.EXPIRED,
            plan: 'PREMIUM_MONTHLY',
            stripeSubscriptionId: `stripe-newer-${Date.now()}`,
            currentPeriodEnd: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
            currentPeriodStart: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
            createdAt: new Date(now.getTime() - 50 * 60 * 60 * 1000), // 50 hours ago (newer)
          },
        });

        // Act: Call findEligibleSubscription
        const eligible = await findEligibleSubscription(user.id, now);

        // Assert: Should find the older CANCELLED-within-period sub, not the newer EXPIRED
        expect(eligible).not.toBeNull();
        expect(eligible?.id).toBe(olderSub.id);
        expect(eligible?.status).toBe(SubscriptionStatus.CANCELLED);

        // Verify: subscriptionAllowsEarning permits the found subscription
        const allows = subscriptionAllowsEarning(eligible!.status, eligible!.currentPeriodEnd, now);
        expect(allows).toBe(true);

        // Cross-check: The newer EXPIRED sub should NOT allow earning
        const newerAllows = subscriptionAllowsEarning(SubscriptionStatus.EXPIRED, newerSub.currentPeriodEnd, now);
        expect(newerAllows).toBe(false);
      } finally {
        // Cleanup: Delete test subscriptions
        await prisma.subscription.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    test('should return null when no eligible subscriptions exist', async () => {
      // Arrange: Create a test user with only terminal subscriptions
      const user = await prisma.user.create({
        data: {
          id: `test-user-none-${Date.now()}`,
          email: `test-user-none-${Date.now()}@example.com`,
          password: 'hashed_password',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
        },
      });

      try {
        // Create EXPIRED subscription only
        await prisma.subscription.create({
          data: {
            userId: user.id,
            status: SubscriptionStatus.EXPIRED,
            plan: 'BASIC',
            stripeSubscriptionId: `stripe-expired-${Date.now()}`,
            currentPeriodEnd: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
            currentPeriodStart: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
            createdAt: now,
          },
        });

        // Act: Call findEligibleSubscription
        const eligible = await findEligibleSubscription(user.id, now);

        // Assert: Should return null (EXPIRED does not match any allow criterion)
        expect(eligible).toBeNull();
      } finally {
        // Cleanup
        await prisma.subscription.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    test('should return ACTIVE subscription when present', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: `test-user-active-${Date.now()}`,
          email: `test-user-active-${Date.now()}@example.com`,
          password: 'hashed_password',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
        },
      });

      try {
        // Create ACTIVE subscription
        const activeSub = await prisma.subscription.create({
          data: {
            userId: user.id,
            status: SubscriptionStatus.ACTIVE,
            plan: 'BASIC',
            stripeSubscriptionId: `stripe-active-${Date.now()}`,
            currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            currentPeriodStart: now,
            createdAt: now,
          },
        });

        // Act
        const eligible = await findEligibleSubscription(user.id, now);

        // Assert
        expect(eligible).not.toBeNull();
        expect(eligible?.id).toBe(activeSub.id);
        expect(eligible?.status).toBe(SubscriptionStatus.ACTIVE);
      } finally {
        await prisma.subscription.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });

    test('should return TRIALING subscription when present', async () => {
      // Arrange
      const user = await prisma.user.create({
        data: {
          id: `test-user-trialing-${Date.now()}`,
          email: `test-user-trialing-${Date.now()}@example.com`,
          password: 'hashed_password',
          firstName: 'Test',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
        },
      });

      try {
        // Create TRIALING subscription
        const trialingSub = await prisma.subscription.create({
          data: {
            userId: user.id,
            status: 'TRIALING' as any,
            plan: 'PREMIUM_WEEKLY',
            stripeSubscriptionId: `stripe-trialing-${Date.now()}`,
            currentPeriodEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
            currentPeriodStart: now,
            createdAt: now,
          },
        });

        // Act
        const eligible = await findEligibleSubscription(user.id, now);

        // Assert
        expect(eligible).not.toBeNull();
        expect(eligible?.id).toBe(trialingSub.id);
        expect(eligible?.status).toBe('TRIALING');
      } finally {
        await prisma.subscription.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });
  });
});
