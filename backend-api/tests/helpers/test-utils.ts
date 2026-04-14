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
      acceptTerms: overrides.acceptTerms ?? true,
    });

  if (res.status !== 201) {
    throw new Error(`Failed to create test user: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    user: res.body.data.user,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    email,
    password,
  };
}

/**
 * Login an existing test user
 */
export async function loginTestUser(email: string, password: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

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
  plan: 'LIGHT' | 'BASIC' | 'PREMIUM' = 'BASIC',
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'INCOMPLETE_EXPIRED' | 'TRIALING' | 'UNPAID' | 'PAUSED' = 'ACTIVE'
) {
  // Get or create plan details
  let planDetails = await prisma.plan.findFirst({
    where: { planCode: plan },
  });

  if (!planDetails) {
    planDetails = await prisma.plan.create({
      data: {
        planCode: plan,
        displayName: `${plan.charAt(0)}${plan.slice(1).toLowerCase()} Plan`,
        displayNameBg: `${plan.charAt(0)}${plan.slice(1).toLowerCase()} План`,
        priceMonthlyEur: plan === 'PREMIUM' ? 1999 : plan === 'BASIC' ? 999 : 0,
        priceYearlyEur: plan === 'PREMIUM' ? 19990 : plan === 'BASIC' ? 9990 : 0,
        priceWeeklyEur: plan === 'PREMIUM' ? 599 : plan === 'BASIC' ? 299 : 199,
        cashbackRate: plan === 'PREMIUM' ? 20 : plan === 'BASIC' ? 10 : 5,
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
      tier: 'BASIC',
      status: 'ACTIVE',
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
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  } catch {
    // Ignore cleanup errors in tests
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
      await prisma.partner.delete({ where: { id: venue.partnerId } }).catch(() => {});
    }
  } catch {
    // Ignore cleanup errors
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
