/**
 * Integration + Unit tests for BC-ADMIN-SPEC-REAUDIT-SCANGATE-INACTIVE-1
 *
 * INTEGRATION TESTS (lines 21-249):
 * Tests the service-layer assertion (sticker.service.ts ~236-254) that checks
 * account status BEFORE subscription status. These tests verify the overall
 * end-to-end behavior from the user's perspective.
 *
 * UNIT TESTS (lines 254+):
 * Tests the requireActiveSubscription middleware (auth.middleware.ts ~397-499)
 * directly. These verify the middleware is correctly mounted on all USER write
 * endpoints and that it enforces the account status gate at the middleware level
 * (defense-in-depth, before reaching the service layer).
 *
 * NOTE: PENDING_VERIFICATION, PENDING_PAYMENT, SUSPENDED, ARCHIVED, and DELETED
 * users are all blocked at the authenticate middleware layer (auth.middleware.ts:189)
 * with 401 and never reach requireActiveSubscription. Tests for ARCHIVED and DELETED
 * here assert 401 (from authenticate), not 403. Only INACTIVE is handled by
 * requireActiveSubscription itself (per Spec §2 and §8.1 rule 1).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, createTestSubscription, cleanupTestUser, createTestVenue } from '../helpers/test-utils';

describe('BC-ADMIN-SPEC-REAUDIT-SCANGATE-INACTIVE-1: Account Status Check', () => {
  const createdUserIds: string[] = [];
  const createdVenueIds: string[] = [];

  afterAll(async () => {
    for (const id of createdVenueIds) {
      // Cleanup venue (if implemented in test-utils, otherwise skip)
      try {
        await prisma.stickerScan.deleteMany({ where: { sticker: { venueId: id } } });
        await prisma.stickerLocation.deleteMany({ where: { venue: { id } } });
        await prisma.sticker.deleteMany({ where: { venueId: id } });
        await prisma.venueStickerConfig.deleteMany({ where: { venueId: id } });
        await prisma.venue.delete({ where: { id } });
      } catch (e) {
        // Skip if already deleted
      }
    }

    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  /**
   * Test: INACTIVE user with ACTIVE subscription is blocked from scanning
   *
   * This verifies the service-layer assertion (and will verify the middleware
   * defense-in-depth check when the middleware is mounted on scan endpoints).
   * An INACTIVE account is rejected even if the subscription is ACTIVE.
   */
  it('should block INACTIVE user with ACTIVE subscription from scanning', async () => {
    // Create a test user with ACTIVE subscription
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    // Give them an ACTIVE subscription
    await createTestSubscription(testUser.id, 'BASIC', 'ACTIVE');

    // Create a test venue and sticker
    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    // Mark the user as INACTIVE (simulating a pause/suspension)
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'INACTIVE' },
    });

    // Attempt to create a sticker session — should be blocked by the service layer
    // (which checks user.status === 'INACTIVE')
    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        cardId: 'test-card-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // The middleware should reject with 402 (INACTIVE maps to payment/registration gate)
    // and the error message should indicate account is paused
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('ACCOUNT_INACTIVE');
  });

  /**
   * Test: ARCHIVED user is blocked from scanning
   */
  it('should block ARCHIVED user with ACTIVE subscription from scanning', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    await createTestSubscription(testUser.id, 'BASIC', 'ACTIVE');

    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    // Mark as ARCHIVED
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'ARCHIVED' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        cardId: 'test-card-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');
  });

  /**
   * Test: DELETED user is blocked from scanning
   */
  it('should block DELETED user with ACTIVE subscription from scanning', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    await createTestSubscription(testUser.id, 'BASIC', 'ACTIVE');

    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    // Mark as DELETED
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'DELETED' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        cardId: 'test-card-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');
  });

  /**
   * Test: SUSPENDED user is blocked from scanning
   */
  it('should block SUSPENDED user with ACTIVE subscription from scanning', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    await createTestSubscription(testUser.id, 'BASIC', 'ACTIVE');

    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'SUSPENDED' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        cardId: 'test-card-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // authenticate blocks SUSPENDED with 401 before requireActiveSubscription runs
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');
  });

  /**
   * Test: ACTIVE user with ACTIVE subscription can scan
   *
   * Positive control: verify that a healthy user with valid subscription
   * can successfully create a sticker session.
   */
  it('should allow ACTIVE user with ACTIVE subscription to scan', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    await createTestSubscription(testUser.id, 'BASIC', 'ACTIVE');

    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    // createTestUser() sets status ACTIVE — user passes authenticate and reaches requireActiveSubscription
    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        latitude: 42.6977,
        longitude: 23.3219,
        payloadVenueId: venue.id,
        payloadVersion: '1.0',
      });

    // Should succeed (status 200 with sessionId)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.sessionId).toBeTruthy();
  });

  /**
   * Test: INACTIVE user with NO subscription is blocked
   *
   * Verifies that account status check fires BEFORE subscription check
   * in the service layer. An INACTIVE user gets ACCOUNT_INACTIVE error,
   * NOT SUBSCRIPTION_REQUIRED.
   */
  it('should block INACTIVE user with no subscription (account status takes precedence)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    // Do NOT create a subscription

    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    // Mark as INACTIVE
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'INACTIVE' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        cardId: 'test-card-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // Account status check should fire first and reject with ACCOUNT_INACTIVE error,
    // NOT with SUBSCRIPTION_REQUIRED (which would be the result if account-status
    // check were skipped).
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('ACCOUNT_INACTIVE');
    expect(res.body.error).not.toContain('SUBSCRIPTION');
  });

  /**
   * Test: ACTIVE user with NO subscription is blocked with SUBSCRIPTION error
   *
   * Verifies that the subscription check fires when account status is OK.
   */
  it('should block ACTIVE user with no subscription (subscription gate)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    createdUserIds.push(testUser.id);

    // Do NOT create a subscription. User is ACTIVE by default.

    const { venue, sticker } = await createTestVenue(testUser.id);
    createdVenueIds.push(venue.id);

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        cardId: 'test-card-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // Should be blocked by subscription check (402 for missing subscription)
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('SUBSCRIPTION');
  });
});

/**
 * Middleware-specific unit tests for requireActiveSubscription
 *
 * These tests directly invoke the middleware to verify it:
 * 1. Blocks INACTIVE account status (the only non-ACTIVE status that can reach
 *    this middleware — ARCHIVED, DELETED, SUSPENDED, and PENDING_* are all blocked
 *    earlier by the authenticate middleware with 401)
 * 2. Allows ACTIVE users to proceed to the next middleware
 */
describe('requireActiveSubscription middleware (unit tests)', () => {
  it('should block INACTIVE user and call next(error) with 402', async () => {
    // Create a test user and set to INACTIVE
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'INACTIVE' },
    });

    // Call the middleware directly by requesting a protected endpoint
    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // Middleware should reject with 402 (requireActiveSubscription is now mounted)
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('ACCOUNT_INACTIVE');

    // Cleanup
    await cleanupTestUser(testUser.id);
  });

  it('should block ARCHIVED user with 401 (blocked by authenticate, not requireActiveSubscription)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'ARCHIVED' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // authenticate middleware rejects ARCHIVED with 401 before requireActiveSubscription runs
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('should block DELETED user with 401 (blocked by authenticate, not requireActiveSubscription)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'DELETED' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // authenticate middleware rejects DELETED with 401 before requireActiveSubscription runs
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('should block SUSPENDED user with 401 (blocked by authenticate, not requireActiveSubscription)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'SUSPENDED' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // authenticate middleware rejects SUSPENDED with 401 before requireActiveSubscription runs
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('should block PENDING_VERIFICATION user with 401 (blocked by authenticate)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    // Override the ACTIVE status set by createTestUser() — simulate unverified registration
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'PENDING_VERIFICATION' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // authenticate blocks PENDING_VERIFICATION with 401
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('should block PENDING_PAYMENT user with 401 (blocked by authenticate)', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    // Override the ACTIVE status set by createTestUser() — simulate awaiting initial payment
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'PENDING_PAYMENT' },
    });

    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        latitude: 42.6977,
        longitude: 23.3219,
      });

    // authenticate blocks PENDING_PAYMENT with 401 before requireActiveSubscription runs
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('should allow ACTIVE user to proceed past the middleware', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await createTestSubscription(testUser.id, 'BASIC', 'ACTIVE');

    const { venue, sticker } = await createTestVenue(testUser.id);

    // ACTIVE user with ACTIVE subscription should pass middleware and reach service layer
    const res = await request(app)
      .post('/api/stickers/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: sticker.stickerId,
        latitude: 42.6977,
        longitude: 23.3219,
        payloadVenueId: venue.id,
        payloadVersion: '1.0',
      });

    // Middleware passes, reaches service layer which validates subscription
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.sessionId).toBeTruthy();

    // Cleanup — delete StickerScan rows first (FK: StickerScan_stickerId_fkey)
    await prisma.stickerScan.deleteMany({ where: { sticker: { venueId: venue.id } } });
    await prisma.stickerLocation.deleteMany({ where: { venue: { id: venue.id } } });
    await prisma.sticker.deleteMany({ where: { venueId: venue.id } });
    await prisma.venueStickerConfig.deleteMany({ where: { venueId: venue.id } });
    await prisma.venue.delete({ where: { id: venue.id } });
    await cleanupTestUser(testUser.id);
  });

  it('middleware should be mounted on POST /api/stickers/scan endpoint', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'INACTIVE' },
    });

    const res = await request(app)
      .post('/api/stickers/scan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stickerId: 'test-sticker-id',
        billAmount: 100,
      });

    // Middleware on /scan should also block INACTIVE users
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('ACCOUNT_INACTIVE');

    await cleanupTestUser(testUser.id);
  });

  it('middleware should be mounted on POST /api/stickers/scan/:scanId/receipt endpoint', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'INACTIVE' },
    });

    const res = await request(app)
      .post('/api/stickers/scan/test-scan-id/receipt')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    // Middleware on /receipt should also block INACTIVE users (before upload handling)
    expect(res.status).toBe(402);
    expect(res.body.error).toContain('ACCOUNT_INACTIVE');

    await cleanupTestUser(testUser.id);
  });

  it('authenticate blocks PENDING_VERIFICATION user on POST /api/stickers/scan', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'PENDING_VERIFICATION' },
    });

    const res = await request(app)
      .post('/api/stickers/scan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stickerId: 'test-sticker-id', billAmount: 100 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('authenticate blocks PENDING_PAYMENT user on POST /api/stickers/scan', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'PENDING_PAYMENT' },
    });

    const res = await request(app)
      .post('/api/stickers/scan')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stickerId: 'test-sticker-id', billAmount: 100 });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('authenticate blocks PENDING_VERIFICATION user on POST /api/stickers/scan/:scanId/receipt', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'PENDING_VERIFICATION' },
    });

    const res = await request(app)
      .post('/api/stickers/scan/test-scan-id/receipt')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });

  it('authenticate blocks PENDING_PAYMENT user on POST /api/stickers/scan/:scanId/receipt', async () => {
    const { user: testUser, accessToken } = await createTestUser();
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: 'PENDING_PAYMENT' },
    });

    const res = await request(app)
      .post('/api/stickers/scan/test-scan-id/receipt')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account not accessible.');

    await cleanupTestUser(testUser.id);
  });
});
