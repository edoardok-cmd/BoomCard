/**
 * Integration Tests: Sticker Scan Partner-Type Access Gate (BC-ADMIN-SPEC-REAUDIT3-SCAN-PLAN-SCOPE-1)
 *
 * SPEC §1.2, §8.1: Users with CANCELLED-within-period or TRIALING subscriptions
 * must retain access at their ACTUAL PLAN level (e.g. BASIC, PREMIUM_MONTHLY),
 * not be downgraded to PREMIUM_WEEKLY. The scanning access gate uses state-aware
 * plan lookup (via findEligibleSubscription) to preserve plan privileges across
 * subscription state transitions.
 *
 * Tests:
 * 1. CANCELLED-within-period BASIC/PREMIUM user scans partner venue redeemable by their plan → ALLOWED
 * 2. CANCELLED-post-period user scans partner venue → BLOCKED (no eligible subscription)
 * 3. TRIALING user scans partner venue redeemable by their plan → ALLOWED
 * 4. ACTIVE user scans partner venue (baseline sanity test) → ALLOWED
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  createTestSubscription,
  loginTestUser,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';
import { SubscriptionStatus } from '@prisma/client';

describe('Sticker Scan Partner-Type Access Gate (CANCELLED/TRIALING)', () => {

  // Sofia coordinates for GPS tests
  const venueLatitude = 42.6977;
  const venueLongitude = 23.3219;

  /**
   * Helper: Create a partner with a specific partner type, and ensure the
   * user's plan grants access to that partner type.
   */
  async function createPartnerWithType(
    userId: string,
    partnerType: string,
    allowedPlans: string[]
  ) {
    // Get or create the partner type
    let type = await prisma.partnerType.findFirst({
      where: { name: partnerType },
    });

    if (!type) {
      type = await prisma.partnerType.create({
        data: {
          name: partnerType,
          nameBg: partnerType,
          description: `Test ${partnerType}`,
          maxDiscountRate: 10,
          isActive: true,
          sortOrder: 1,
        },
      });
    }

    // Create partner with this type
    const partner = await prisma.partner.create({
      data: {
        userId,
        businessName: `Test ${partnerType} Venue ${Date.now()}`,
        businessNameBg: `Test ${partnerType} Venue ${Date.now()}`,
        category: 'Restaurant',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        discountRate: 5,
        partnerTypeId: type.id,
      },
    });

    // Create venue and sticker
    const venue = await prisma.venue.create({
      data: {
        partnerId: partner.id,
        name: `Venue ${partner.id}`,
        nameBg: `Обект ${partner.id}`,
        address: '1 Test Street',
        city: 'Sofia',
        latitude: venueLatitude,
        longitude: venueLongitude,
        venueStatus: 'ACTIVE',
      },
    });

    const location = await prisma.stickerLocation.create({
      data: {
        venueId: venue.id,
        name: 'Main',
        nameBg: 'Основна',
        locationType: 'OTHER',
        locationNumber: '1',
        capacity: 100,
        isActive: true,
      },
    });

    const sticker = await prisma.sticker.create({
      data: {
        locationId: location.id,
        venueId: venue.id,
        stickerId: `STICKER-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        status: 'ACTIVE',
        qrCode: `https://example.com/qr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.png`,
      },
    });

    // Create config
    await prisma.venueStickerConfig.create({
      data: {
        venueId: venue.id,
        minBillAmount: 5,
        gpsRadiusMeters: 60,
      },
    });

    // Set plan access rules for this partner type
    // First, clear any existing rules
    await prisma.planTypeAccess.deleteMany({
      where: { partnerTypeId: type.id },
    });

    // Then create rules for the allowed plans
    for (const plan of allowedPlans) {
      await prisma.planTypeAccess.create({
        data: {
          partnerTypeId: type.id,
          plan: plan as any,
          canView: true,
          canRedeem: true,
        },
      });
    }

    return { partner, venue, sticker, location, partnerType: type };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: CANCELLED-within-period BASIC user scans partner redeemable by BASIC
  // ──────────────────────────────────────────────────────────────────────────

  describe('CANCELLED-within-period subscription', () => {
    let userId: string;
    let accessToken: string;
    let cardId: string;
    let stickerId: string;
    let partnerTypeId: string;
    let partnerUserId: string;
    let localVenueIds: string[] = [];

    beforeAll(async () => {
      const testData = await createTestUser();
      userId = testData.user.id;
      accessToken = testData.accessToken;

      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

      // Create a BASIC subscription in CANCELLED-within-period state
      const subscription = await createTestSubscription(userId, 'BASIC', 'ACTIVE');
      // Move to CANCELLED, but with currentPeriodEnd in the future (within period)
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          // Ensure currentPeriodEnd is > now
          currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // +10 days
        },
      });

      // Get user's card
      const card = await prisma.card.findFirst({ where: { userId } });
      cardId = card!.id;

      // Create a dedicated partner user to avoid self-scan guard
      const partnerUserData = await createTestUser();
      partnerUserId = partnerUserData.user.id;
      await prisma.user.update({ where: { id: partnerUserId }, data: { status: 'ACTIVE', role: 'PARTNER' } });

      // Create a partner with BASIC-redeemable partner type
      const { sticker, partnerType: type } = await createPartnerWithType(
        partnerUserId,
        `BasicPartner-${Date.now()}`,
        ['BASIC'] // Only BASIC plan can redeem
      );
      stickerId = sticker.stickerId;
      partnerTypeId = type.id;
      localVenueIds.push(sticker.venueId);
    });

    afterAll(async () => {
      for (const vid of localVenueIds) {
        await cleanupTestVenue(vid);
      }
      await prisma.partnerType.delete({ where: { id: partnerTypeId } }).catch(() => {});
      await cleanupTestUser(partnerUserId).catch(() => {});
      await cleanupTestUser(userId);
    });

    it('should ALLOW CANCELLED-within-period BASIC user to scan BASIC-redeemable partner and not receive "Upgrade your plan" error', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: (await prisma.sticker.findFirst({ where: { stickerId } }))?.venueId,
          payloadVersion: '1',
        });

      // Should succeed (200) — CANCELLED-within-period user retains their plan privileges
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('status');
      // Must not be blocked with the plan-downgrade error
      if (res.body.error) {
        expect(res.body.error).not.toContain('Upgrade your plan');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: CANCELLED-post-period user scans partner → BLOCKED (no eligible sub)
  // ──────────────────────────────────────────────────────────────────────────

  describe('CANCELLED-post-period subscription', () => {
    let userId: string;
    let accessToken: string;
    let cardId: string;
    let stickerId: string;
    let partnerTypeId: string;
    let partnerUserId: string;
    let localVenueIds: string[] = [];

    beforeAll(async () => {
      const testData = await createTestUser();
      userId = testData.user.id;
      accessToken = testData.accessToken;

      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

      // Create a BASIC subscription in CANCELLED-post-period state
      const subscription = await createTestSubscription(userId, 'BASIC', 'ACTIVE');
      // Move to CANCELLED with currentPeriodEnd in the past (post-period)
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          // Ensure currentPeriodEnd is < now (post-period)
          currentPeriodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // -10 days
        },
      });

      // Get user's card
      const card = await prisma.card.findFirst({ where: { userId } });
      cardId = card!.id;

      // Create a dedicated partner user to avoid self-scan guard
      const partnerUserData = await createTestUser();
      partnerUserId = partnerUserData.user.id;
      await prisma.user.update({ where: { id: partnerUserId }, data: { status: 'ACTIVE', role: 'PARTNER' } });

      // Create a partner (any type)
      const { sticker, partnerType: type } = await createPartnerWithType(
        partnerUserId,
        `RestrictedPartner-${Date.now()}`,
        ['PREMIUM_MONTHLY'] // Only PREMIUM_MONTHLY can redeem
      );
      stickerId = sticker.stickerId;
      partnerTypeId = type.id;
      localVenueIds.push(sticker.venueId);
    });

    afterAll(async () => {
      for (const vid of localVenueIds) {
        await cleanupTestVenue(vid);
      }
      await prisma.partnerType.delete({ where: { id: partnerTypeId } }).catch(() => {});
      await cleanupTestUser(partnerUserId).catch(() => {});
      await cleanupTestUser(userId);
    });

    it('should BLOCK CANCELLED-post-period user from scanning (no eligible subscription)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: (await prisma.sticker.findFirst({ where: { stickerId } }))?.venueId,
          payloadVersion: '1',
        });

      // Should fail — middleware returns 402 SUBSCRIPTION_REQUIRED for no eligible subscription
      expect(res.status).toBe(402);
      expect(res.body.error).toContain('SUBSCRIPTION_REQUIRED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: TRIALING user scans partner redeemable by TRIALING
  // ──────────────────────────────────────────────────────────────────────────

  describe('TRIALING subscription', () => {
    let userId: string;
    let accessToken: string;
    let cardId: string;
    let stickerId: string;
    let partnerTypeId: string;
    let partnerUserId: string;
    let localVenueIds: string[] = [];

    beforeAll(async () => {
      const testData = await createTestUser();
      userId = testData.user.id;
      accessToken = testData.accessToken;

      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

      // Create a TRIALING subscription (spec §1.2: mapped to "Active" for users)
      const subscription = await createTestSubscription(userId, 'PREMIUM_WEEKLY', 'TRIALING');
      // Ensure currentPeriodEnd is in the future
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 days
        },
      });

      // Get user's card
      const card = await prisma.card.findFirst({ where: { userId } });
      cardId = card!.id;

      // Create a dedicated partner user to avoid self-scan guard
      const partnerUserData = await createTestUser();
      partnerUserId = partnerUserData.user.id;
      await prisma.user.update({ where: { id: partnerUserId }, data: { status: 'ACTIVE', role: 'PARTNER' } });

      // Create a partner with PREMIUM_WEEKLY-redeemable type
      const { sticker, partnerType: type } = await createPartnerWithType(
        partnerUserId,
        `TrialPartner-${Date.now()}`,
        ['PREMIUM_WEEKLY'] // Only PREMIUM_WEEKLY can redeem
      );
      stickerId = sticker.stickerId;
      partnerTypeId = type.id;
      localVenueIds.push(sticker.venueId);
    });

    afterAll(async () => {
      for (const vid of localVenueIds) {
        await cleanupTestVenue(vid);
      }
      await prisma.partnerType.delete({ where: { id: partnerTypeId } }).catch(() => {});
      await cleanupTestUser(partnerUserId).catch(() => {});
      await cleanupTestUser(userId);
    });

    it('should ALLOW TRIALING user to scan PREMIUM_WEEKLY-redeemable partner', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: (await prisma.sticker.findFirst({ where: { stickerId } }))?.venueId,
          payloadVersion: '1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: ACTIVE subscription baseline sanity test
  // ──────────────────────────────────────────────────────────────────────────

  describe('ACTIVE subscription (baseline)', () => {
    let userId: string;
    let accessToken: string;
    let cardId: string;
    let stickerId: string;
    let partnerTypeId1: string;
    let partnerTypeId2 = '';
    let partnerUserId1: string;
    let localVenueIds: string[] = [];
    const extraUserIds: string[] = [];

    beforeAll(async () => {
      const testData = await createTestUser();
      userId = testData.user.id;
      accessToken = testData.accessToken;


      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

      // Create an ACTIVE PREMIUM_MONTHLY subscription
      await createTestSubscription(userId, 'PREMIUM_MONTHLY', 'ACTIVE');

      // Get user's card
      const card = await prisma.card.findFirst({ where: { userId } });
      cardId = card!.id;

      // Create a dedicated partner user to avoid self-scan guard
      const partnerUserData = await createTestUser();
      partnerUserId1 = partnerUserData.user.id;
      await prisma.user.update({ where: { id: partnerUserId1 }, data: { status: 'ACTIVE', role: 'PARTNER' } });

      // Create a partner with PREMIUM_MONTHLY-redeemable type
      const { sticker, partnerType: type1 } = await createPartnerWithType(
        partnerUserId1,
        `ActivePartner-${Date.now()}`,
        ['PREMIUM_MONTHLY'] // Only PREMIUM_MONTHLY can redeem
      );
      stickerId = sticker.stickerId;
      partnerTypeId1 = type1.id;
      localVenueIds.push(sticker.venueId);
    });

    afterAll(async () => {
      for (const vid of localVenueIds) {
        await cleanupTestVenue(vid);
      }
      await prisma.partnerType.delete({ where: { id: partnerTypeId1 } }).catch(() => {});
      if (partnerTypeId2) await prisma.partnerType.delete({ where: { id: partnerTypeId2 } }).catch(() => {});
      for (const uid of extraUserIds) {
        await cleanupTestUser(uid);
      }
      await cleanupTestUser(partnerUserId1).catch(() => {});
      await cleanupTestUser(userId);
    });

    it('should ALLOW ACTIVE PREMIUM_MONTHLY user to scan PREMIUM_MONTHLY-redeemable partner', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: (await prisma.sticker.findFirst({ where: { stickerId } }))?.venueId,
          payloadVersion: '1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });

    it('should BLOCK ACTIVE user from scanning partner only accessible by higher plan', async () => {
      // User has PREMIUM_MONTHLY, try to scan a BASIC-only partner.
      // A separate partner-user is needed because userId is @unique on Partner.
      const partnerUserData = await createTestUser();
      const partnerUserId = partnerUserData.user.id;
      extraUserIds.push(partnerUserId);
      await prisma.user.update({ where: { id: partnerUserId }, data: { status: 'ACTIVE', role: 'PARTNER' } });
      const { sticker: basicSticker, partnerType: type2 } = await createPartnerWithType(
        partnerUserId,
        `BasicOnlyPartner-${Date.now()}`,
        ['BASIC'] // Only BASIC can redeem
      );
      partnerTypeId2 = type2.id;
      localVenueIds.push(basicSticker.venueId);

      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId: basicSticker.stickerId,
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: basicSticker.venueId,
          payloadVersion: '1',
        });

      // PREMIUM_MONTHLY should be blocked from BASIC-only partner
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Upgrade your plan');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: createSession path uses state-aware plan lookup
  // ──────────────────────────────────────────────────────────────────────────

  describe('POST /api/stickers/session partner access gate', () => {
    let userId: string;
    let accessToken: string;
    let cardId: string;
    let stickerId: string;
    let partnerTypeId: string;
    let partnerUserId: string;
    let localVenueIds: string[] = [];

    beforeAll(async () => {
      const testData = await createTestUser();
      userId = testData.user.id;
      accessToken = testData.accessToken;

      await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

      // Create a TRIALING subscription
      const subscription = await createTestSubscription(userId, 'BASIC', 'TRIALING');
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      // Get user's card
      const card = await prisma.card.findFirst({ where: { userId } });
      cardId = card!.id;

      // Create a dedicated partner user to avoid self-scan guard
      const partnerUserData = await createTestUser();
      partnerUserId = partnerUserData.user.id;
      await prisma.user.update({ where: { id: partnerUserId }, data: { status: 'ACTIVE', role: 'PARTNER' } });

      // Create a BASIC-redeemable partner
      const { sticker, partnerType: type } = await createPartnerWithType(
        partnerUserId,
        `SessionPartner-${Date.now()}`,
        ['BASIC']
      );
      stickerId = sticker.stickerId;
      partnerTypeId = type.id;
      localVenueIds.push(sticker.venueId);
    });

    afterAll(async () => {
      for (const vid of localVenueIds) {
        await cleanupTestVenue(vid);
      }
      await prisma.partnerType.delete({ where: { id: partnerTypeId } }).catch(() => {});
      await cleanupTestUser(partnerUserId).catch(() => {});
      await cleanupTestUser(userId);
    });

    it('should ALLOW TRIALING BASIC user in createSession partner access gate', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/session')
        .send({
          stickerId,
          cardId,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: (await prisma.sticker.findFirst({ where: { stickerId } }))?.venueId,
          payloadVersion: '1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('sessionId');
      // Session should be created successfully, no plan-downgrade error
    });
  });
});
