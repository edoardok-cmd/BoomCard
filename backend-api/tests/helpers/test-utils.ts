/**
 * Shared test utilities for integration tests
 *
 * Provides helper functions for creating test data, authenticating,
 * and cleaning up after tests.
 */

import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

// Unique suffix to avoid collisions between parallel test runs
const testId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

// BC-QA-032: monotonic in-process counter backing the default test phone
// number below. testId() alone is NOT safe for that purpose — two calls in
// the same millisecond (common in a tight test loop) can produce a
// timestamp whose last digits are identical, and the base36 random suffix
// frequently contributes zero digits, so testId()'s digit-only tail can
// repeat. A simple incrementing counter can't.
let testPhoneCounter = 0;

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
  // BC-QA-032: phone is now unique per (phone, role) at the DB level
  // (prisma/migrations/20260810160000_add_user_phone_role_unique). This
  // default used to be a single fixed number shared by every caller that
  // didn't pass an explicit `phone` override — harmless before the
  // constraint existed, but it would now make the SECOND such call in any
  // test run collide on AUTH_PHONE_ALREADY_REGISTERED. Default to a
  // per-call unique number instead, mirroring how `email` above is already
  // defaulted uniquely. PHONE_REGEX (auth.validator.ts) requires exactly
  // `+359` followed by 9 digits: seed with the process start time (stable,
  // distinguishes parallel test-worker processes) and append the
  // monotonic counter (distinguishes successive calls within one process,
  // including same-millisecond calls). BC-QA-032 round 2: a naive
  // concatenate-then-`.slice(-9)` of these three components always drops
  // `process.pid` entirely (Date.now() alone is 13 digits, already over the
  // 9-digit budget), which defeated the whole point of including it — two
  // different jest worker processes could produce byte-identical phone
  // numbers for their first call in the same millisecond. Hash the full seed
  // instead so every component (pid, timestamp, counter) actually influences
  // every output digit, then take 9 decimal digits from the hash.
  const phoneSeed = `${process.pid}-${Date.now()}-${++testPhoneCounter}`;
  const phoneHash = crypto.createHash('sha256').update(phoneSeed).digest('hex');
  const phoneDigits = BigInt(`0x${phoneHash.slice(0, 13)}`).toString().padStart(9, '0').slice(-9);
  const phone = overrides.phone || `+359${phoneDigits}`;

  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      password,
      firstName: overrides.firstName || 'Test',
      lastName: overrides.lastName || 'User',
      phone,
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
    data: { emailVerified: true, emailVerifiedAt: new Date(), emailVerificationToken: null, status: 'ACTIVE' },
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
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'INCOMPLETE' | 'INCOMPLETE_EXPIRED' | 'TRIALING' | 'UNPAID' | 'PAUSED' | 'EXPIRED' | 'FAILED_PAYMENT' = 'ACTIVE'
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
