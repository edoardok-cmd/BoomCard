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

/**
 * Create test fixtures (Venue, Card, Sticker) required for StickerScan records.
 */
async function createStickerScanFixtures(userId: string) {
  // Create a test partner (required for venue)
  const partner = await prisma.partner.create({
    data: {
      userId,
      businessName: `Test Partner ${Date.now()}-${Math.random()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      discountRate: 5,
    },
  });

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: `Test Venue ${Date.now()}-${Math.random()}`,
      address: 'Test Address',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
    },
  });

  // Create a sticker location (required for sticker)
  const stickerLocation = await prisma.stickerLocation.create({
    data: {
      venueId: venue.id,
      name: 'Test Location',
      locationType: 'TABLE',
      locationNumber: '001',
    },
  });

  const card = await prisma.card.create({
    data: {
      userId,
      cardNumber: `TEST_${Date.now()}_${Math.random()}`,
      type: 'PREMIUM_WEEKLY',
      status: 'ACTIVE',
      qrCode: `QR_CARD_${Date.now()}_${Math.random()}`,
    },
  });

  const sticker = await prisma.sticker.create({
    data: {
      venueId: venue.id,
      locationId: stickerLocation.id,
      stickerId: `STICKER_${Date.now()}_${Math.random()}`,
      qrCode: `QR_${Date.now()}_${Math.random()}`,
    },
  });

  return { venue, card, sticker };
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-active');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should succeed
      const result = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-trialing');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should succeed
      const result = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-cancelled-within');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should succeed
      const result = await cashbackLifecycleService.recordPendingForRiskReview({
        userId: user.id,
        amount: 10,
        stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-past-due');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-unpaid');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-incomplete');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-incomplete-expired');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-paused');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-expired');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-failed-payment');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record with randomized ID
      const scanId = generateUniqueScanId('scan-cancelled-post');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
        })
      ).rejects.toThrow('Cannot create cashback: account scanning is blocked');
    });
  });

  describe('Idempotency & Edge Cases', () => {
    test('should be idempotent for allowed status', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      await createTestSubscription(user.id, 'PREMIUM_WEEKLY');

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Generate a unique scan ID and use it for both calls
      const scanId = generateUniqueScanId('scan-idempotent');

      // Create StickerScan record
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

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

      // Create test fixtures (venue, card, sticker)
      const { venue, card, sticker } = await createStickerScanFixtures(user.id);

      // Create StickerScan record
      const scanId = generateUniqueScanId('scan-no-sub');
      await prisma.stickerScan.create({
        data: {
          id: scanId,
          userId: user.id,
          stickerId: sticker.id,
          venueId: venue.id,
          cardId: card.id,
          billAmount: 10,
        },
      });

      // recordPendingForRiskReview should throw (no subscription = blocked)
      await expect(
        cashbackLifecycleService.recordPendingForRiskReview({
          userId: user.id,
          amount: 10,
          stickerScanId: scanId,
        })
      ).rejects.toThrow();
    });
  });
});
