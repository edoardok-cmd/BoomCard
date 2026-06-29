/**
 * Shared test utilities for integration tests
 *
 * Provides helper functions for creating test data, authenticating,
 * and cleaning up after tests.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

// Unique suffix to avoid collisions between parallel test runs
const testId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

/**
 * Register a test user and return auth tokens + user data
 */
export async function createTestUser(overrides: {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  acceptTerms?: boolean;
} = {}) {
  const email = overrides.email || `test-${testId()}@boomcard.bg`;
  const password = overrides.password || 'TestPass123!';

  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password,
      firstName: overrides.firstName || 'Test',
      lastName: overrides.lastName || 'User',
      phone: overrides.phone || '+359888000000',
      acceptTerms: overrides.acceptTerms ?? true,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create test user: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Mark user email-verified so subsequent loginTestUser() calls pass the
  // verification gate added in f53a31b. Registration path still exercises
  // the real code; only login is short-circuited.
  await prisma.user.update({
    where: { id: res.body.data.user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date(), emailVerificationToken: null },
  });

  return {
    user: res.body.data.user,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    email,
    password,
  };
}

/**
 * Login an existing test user.
 *
 * clientType is required by the login endpoint (surface guard that blocks
 * PARTNER/ADMIN from the mobile app). Defaults to 'web' since that works
 * for all roles — tests exercising mobile-specific behavior should pass
 * 'mobile' explicitly.
 */
export async function loginTestUser(
  email: string,
  password: string,
  clientType: 'web' | 'mobile' = 'web',
) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password, clientType });

  if (res.status !== 200) {
    throw new Error(`Failed to login: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    user: res.body.data.user,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

/**
 * Create a test subscription for a user
 */
export async function createTestSubscription(
  userId: string,
  plan: 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM' | 'PREMIUM_MONTHLY' = 'BASIC',
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'INCOMPLETE_EXPIRED' | 'TRIALING' | 'UNPAID' | 'PAUSED' = 'ACTIVE'
) {
  // Get or create plan details
  let planDetails = await prisma.plan.findFirst({
    where: { planCode: plan },
  });

  if (!planDetails) {
    const isPremium = plan === 'PREMIUM' || plan === 'PREMIUM_MONTHLY';
    planDetails = await prisma.plan.create({
      data: {
        planCode: plan,
        displayName: `${plan.charAt(0)}${plan.slice(1).toLowerCase()} Plan`,
        displayNameBg: `${plan.charAt(0)}${plan.slice(1).toLowerCase()} План`,
        priceMonthlyEur: isPremium ? 1999 : plan === 'BASIC' ? 999 : 0,
        priceYearlyEur: isPremium ? 19990 : plan === 'BASIC' ? 9990 : 0,
        priceWeeklyEur: isPremium ? 599 : plan === 'BASIC' ? 299 : 199,
        cashbackRate: isPremium ? 20 : plan === 'BASIC' ? 10 : 5,
        isActive: true,
      },
    });
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      plan,
      planId: planDetails.id,
      status,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      payseraOrderId: `TEST-ORDER-${testId()}`,
      metadata: JSON.stringify({ billingPeriod: 'monthly', source: 'test' }),
    },
    include: { planDetails: true },
  });

  return subscription;
}

/**
 * Create test venue with partner and sticker
 */
export async function createTestVenue(userId: string) {
  const partner = await prisma.partner.create({
    data: {
      userId,
      businessName: `Test Venue ${testId()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(), // required by sticker-scan and auth gates (sticker.service:512, auth.service:663)
      discountRate: 5, // 5% partner discount — both basic and premium tiers yield 5% cashback
    },
  });

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: 'Test Restaurant',
      address: 'Test Address 123',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
    },
  });

  const location = await prisma.stickerLocation.create({
    data: {
      venueId: venue.id,
      name: 'Table 1',
      locationType: 'TABLE',
      locationNumber: '001',
    },
  });

  const sticker = await prisma.sticker.create({
    data: {
      venueId: venue.id,
      locationId: location.id,
      stickerId: `STK-${testId()}`,
      qrCode: `qr-${testId()}`,
      status: 'ACTIVE',
    },
  });

  await prisma.venueStickerConfig.create({
    data: {
      venueId: venue.id,
      cashbackPercent: 5.0,
      premiumBonus: 2.0,
      platinumBonus: 5.0,
      minBillAmount: 0,
      autoApproveThreshold: 10,
    },
  });

  return { partner, venue, location, sticker };
}

/**
 * Clean up a test user and all related data
 */
export async function cleanupTestUser(userId: string) {
  try {
    // Delete in dependency order
    await prisma.walletTransaction.deleteMany({ where: { wallet: { userId } } });
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.stickerScan.deleteMany({ where: { userId } });
    await prisma.receipt.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.booking.deleteMany({ where: { userId } });
    await prisma.review.deleteMany({ where: { userId } });
    await prisma.favorite.deleteMany({ where: { userId } });
    await prisma.subscription.deleteMany({ where: { userId } });
    await prisma.card.deleteMany({ where: { userId } });
    await prisma.loyaltyAccount.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch((e) => {
      if (!String(e).includes('Record to delete does not exist')) {
        console.warn(`cleanupTestUser: unexpected error deleting user ${userId}:`, e);
      }
    });
  } catch (e) {
    console.warn(`cleanupTestUser: cleanup failed for ${userId}:`, e);
  }
}

/**
 * Clean up a test venue and related data
 */
export async function cleanupTestVenue(venueId: string) {
  try {
    await prisma.stickerScan.deleteMany({ where: { venueId } });
    await prisma.venueStickerConfig.deleteMany({ where: { venueId } });
    const stickers = await prisma.sticker.findMany({ where: { venueId } });
    for (const s of stickers) {
      await prisma.sticker.delete({ where: { id: s.id } });
    }
    await prisma.stickerLocation.deleteMany({ where: { venueId } });
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (venue) {
      await prisma.venue.delete({ where: { id: venueId } });
      await prisma.partner.delete({ where: { id: venue.partnerId } }).catch((e) => {
        if (!String(e).includes('Record to delete does not exist')) {
          console.warn(`cleanupTestVenue: unexpected error deleting partner ${venue.partnerId}:`, e);
        }
      });
    }
  } catch (e) {
    console.warn(`cleanupTestVenue: cleanup failed for ${venueId}:`, e);
  }
}

/**
 * Make an authenticated request
 */
export function authRequest(token: string) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
  };
}

/**
 * Wait helper for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
