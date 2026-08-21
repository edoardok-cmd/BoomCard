/**
 * Integration Tests: Cashback Gate Enforcement (Spec §8.1 Rule #1)
 *
 * Tests that the cashback creation gate enforces identical subscription
 * status rules to the scanning gate. This prevents the defect where
 * PAST_DUE, UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, or PAUSED subscriptions
 * could earn cashback while scanning was blocked.
 *
 * Per spec §8.1 rule 1: "New cashback records are never generated while
 * scanning is blocked."
 */

import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { cashbackLifecycleService } from '../../src/services/cashbackLifecycle.service';
import { createTestUser, createTestSubscription } from '../helpers/test-utils';

/**
 * Generate a unique Stripe subscription ID for testing.
 * Prevents unique constraint violations across test runs.
 */
function generateUniqueSubscriptionId(testName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${testName}_${timestamp}_${random}`.substring(0, 255);
}

/**
 * Generate a unique sticker scan ID for testing.
 * Prevents foreign key constraint violations.
 */
function generateUniqueScanId(testName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${testName}_${timestamp}_${random}`.substring(0, 255);
}

describe('Cashback Gate Enforcement (Spec §8.1 Rule #1)', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    // Cleanup
    for (const userId of createdUserIds) {
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId } } }).catch(() => {});
      await prisma.wallet.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.stickerScan.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.receipt.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.card.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.loyaltyAccount.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  describe('ALLOW-LIST: Permitted Statuses', () => {
    test('should allow ACTIVE subscription to earn cashback', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create ACTIVE subscription
      await createTestSubscription(user.id, 'PREMIUM_WEEKLY');

      // recordPendingForRiskReview should succeed
      const result = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: 'test-scan-1',
      });

      expect(result).toBeDefined();
      expect(result?.cashbackStatus).toBe('PENDING');
    });

    test('should allow TRIALING subscription to earn cashback', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create TRIALING subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.TRIALING,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('trialing'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should succeed
      const result = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: generateUniqueScanId('scan-trialing'),
      });

      expect(result).toBeDefined();
      expect(result?.cashbackStatus).toBe('PENDING');
    });

    test('should allow CANCELLED subscription within paid period', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create CANCELLED subscription with future currentPeriodEnd
      const futureEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.CANCELLED,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('cancelled-within'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: futureEnd,
          cancelAtPeriodEnd: true,
        },
      });

      // recordPendingForRiskReview should succeed
      const result = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: generateUniqueScanId('scan-cancelled-within'),
      });

      expect(result).toBeDefined();
      expect(result?.cashbackStatus).toBe('PENDING');
    });
  });

  describe('BLOCK-LIST: Blocked Statuses (Critical Defect Coverage)', () => {
    test('should BLOCK PAST_DUE subscription (defect fix)', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create PAST_DUE subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.PAST_DUE,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('past-due'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-past-due'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK UNPAID subscription (defect fix)', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create UNPAID subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.UNPAID,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('unpaid'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-unpaid'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK INCOMPLETE subscription (defect fix)', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create INCOMPLETE subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.INCOMPLETE,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('incomplete'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-incomplete'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK INCOMPLETE_EXPIRED subscription (defect fix)', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create INCOMPLETE_EXPIRED subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.INCOMPLETE_EXPIRED,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('incomplete-expired'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-incomplete-expired'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK PAUSED subscription (defect fix)', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create PAUSED subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.PAUSED,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('paused'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-paused'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK EXPIRED subscription', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create EXPIRED subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.EXPIRED,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('expired'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-expired'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK FAILED_PAYMENT subscription', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create FAILED_PAYMENT subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.FAILED_PAYMENT,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('failed-payment'),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-failed-payment'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });

    test('should BLOCK CANCELLED subscription post-period', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Create CANCELLED subscription with past currentPeriodEnd
      const pastEnd = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await prisma.subscription.create({
        data: {
          userId: user.id,
          status: SubscriptionStatus.CANCELLED,
          plan: 'PREMIUM_WEEKLY',
          stripeSubscriptionId: generateUniqueSubscriptionId('cancelled-post'),
          currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: pastEnd,
          cancelAtPeriodEnd: true,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-cancelled-post'),
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });
  });

  describe('Idempotency & Edge Cases', () => {
    test('should be idempotent for allowed status', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      await createTestSubscription(user.id, 'PREMIUM_WEEKLY');

      // Generate a unique scan ID and use it for both calls
      const scanId = generateUniqueScanId('scan-idempotent');

      // Create first record
      const result1 = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: scanId,
      });

      // Create again with same stickerScanId (should return existing record)
      const result2 = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: scanId,
      });

      expect(result1?.id).toBe(result2?.id);
    });

    test('should handle users with no subscription', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      // Delete the default subscription (if any)
      await prisma.subscription.deleteMany({ where: { userId: user.id } });

      // recordPendingForRiskReview should throw (no subscription = blocked)
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: generateUniqueScanId('scan-no-sub'),
        })
      ).rejects.toThrow();
    });
  });
});
