/**
 * Integration Tests: Admin Cashback Audit Fixes (BC-ADMIN-AUDIT-FIX-004)
 *
 * Covers three defects from the admin cashback code audit:
 *
 * DEFECT A: Lock route permission divergence
 *   - Spec §3.4 says Lock requires cashback.write, but code requires SUPER_ADMIN role
 *   - FIX: Updated spec to document Lock as SUPER_ADMIN-only (payout pipeline internal use)
 *   - TEST: Regular admin with cashback.write cannot lock; SUPER_ADMIN can lock
 *
 * DEFECT B: Manual lock missing payout-eligibility check
 *   - lockEntry() doesn't verify user's subscription_status / IBAN before locking
 *   - FIX: Added payout eligibility validation (subscription + IBAN check)
 *   - TEST: Lock rejected if user has FAILED_PAYMENT or no IBAN on file
 *
 * DEFECT C: DELETE /rates/snapshot/:iso brittle matching
 *   - Exact equality match on timestamps fails if client's ISO string has ms precision
 *   - FIX: Match within ±500ms tolerance window (1-second total window)
 *   - TEST: Snapshot delete works even with ms-precision round-trip
 */

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { walletService } from '../../src/services/wallet.service';

const PASSWORD = 'AdminPass123!';

interface TestFixtures {
  superAdminToken: string;
  regularAdminToken: string;
  userId: string;
  walletId: string;
  entryId: string;
}

async function createTestFixtures(): Promise<TestFixtures> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Create SUPER_ADMIN
  const superAdmin = await prisma.user.create({
    data: {
      email: `super-admin-cbk-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const superAdminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: superAdmin.email,
      password: PASSWORD,
      clientType: 'web',
    });

  if (superAdminLoginRes.status !== 200) {
    throw new Error(`Super admin login failed: ${superAdminLoginRes.status}`);
  }

  // Create ADMIN (with cashback.write permission but not SUPER_ADMIN role)
  const regularAdmin = await prisma.user.create({
    data: {
      email: `admin-cbk-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Regular',
      lastName: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // Assign cashback.write permission to regular admin
  await prisma.adminPermission.create({
    data: {
      userId: regularAdmin.id,
      permission: 'cashback.write',
    },
  });

  const regularAdminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: regularAdmin.email,
      password: PASSWORD,
      clientType: 'web',
    });

  if (regularAdminLoginRes.status !== 200) {
    throw new Error(`Regular admin login failed: ${regularAdminLoginRes.status}`);
  }

  // Create a test user with active subscription
  const user = await prisma.user.create({
    data: {
      email: `user-cbk-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      iban: 'BG80BCCI00123456789012', // Valid IBAN
    },
  });

  // Create wallet
  const wallet = await walletService.getOrCreateWallet(user.id);

  // Create subscription for the user
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: 'PREMIUM_WEEKLY',
      status: 'ACTIVE',
      startDate: new Date(),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days in future
    },
  });

  // Create a CASHBACK_CREDIT transaction in CLEARED state
  const entry = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: 'CASHBACK_CREDIT',
      amount: 50,
      status: 'COMPLETED',
      cashbackStatus: 'CLEARED',
      cashbackExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      description: 'Test cashback entry',
    },
  });

  return {
    superAdminToken: superAdminLoginRes.body.token,
    regularAdminToken: regularAdminLoginRes.body.token,
    userId: user.id,
    walletId: wallet.id,
    entryId: entry.id,
  };
}

async function cleanupFixtures(userId: string) {
  // Delete all transactions
  await prisma.walletTransaction.deleteMany({ where: { wallet: { userId } } });
  // Delete subscriptions
  await prisma.subscription.deleteMany({ where: { userId } });
  // Delete wallet
  await prisma.wallet.deleteMany({ where: { userId } });
  // Delete user
  await prisma.user.delete({ where: { id: userId } });
}

describe('Admin Cashback Audit Fixes (BC-ADMIN-AUDIT-FIX-004)', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createTestFixtures();
  });

  afterAll(async () => {
    // Cleanup admin users
    const adminUsers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        email: { contains: '-cbk-' },
      },
    });
    for (const user of adminUsers) {
      await prisma.adminPermission.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    // Cleanup test user
    await cleanupFixtures(fixtures.userId).catch(() => {});
  });

  // ============================================================================
  // DEFECT A: Lock route permission divergence
  // ============================================================================

  describe('DEFECT A: Lock route permission (SUPER_ADMIN-only)', () => {
    it('should deny lock when user is ADMIN (not SUPER_ADMIN)', async () => {
      const res = await request(app)
        .post(`/api/admin/cashback/entries/${fixtures.entryId}/lock`)
        .set('Authorization', `Bearer ${fixtures.regularAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/SUPER_ADMIN/i);
    });

    it('should allow lock when user is SUPER_ADMIN', async () => {
      const res = await request(app)
        .post(`/api/admin/cashback/entries/${fixtures.entryId}/lock`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      // Should succeed (200) or fail for a different reason (not 403 permission)
      expect(res.status).not.toBe(403);
      // If it succeeds, status should be 200
      // If it fails due to eligibility check (DEFECT B), that's OK — we're testing permission here
      if (res.status === 200) {
        expect(res.body.message).toMatch(/lock/i);
      }
    });
  });

  // ============================================================================
  // DEFECT B: Manual lock missing payout-eligibility check
  // ============================================================================

  describe('DEFECT B: Manual lock with payout eligibility validation', () => {
    let eligibleEntryId: string;
    let failedPaymentUserId: string;
    let noIbanUserId: string;

    beforeAll(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const hash = await bcrypt.hash(PASSWORD, 10);

      // Create user with FAILED_PAYMENT subscription (ineligible)
      const failedPaymentUser = await prisma.user.create({
        data: {
          email: `user-failed-${suffix}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Failed',
          lastName: 'Payment',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          iban: 'BG80BCCI00123456789012', // Has IBAN
        },
      });
      failedPaymentUserId = failedPaymentUser.id;

      // Create FAILED_PAYMENT subscription
      await prisma.subscription.create({
        data: {
          userId: failedPaymentUser.id,
          plan: 'PREMIUM_WEEKLY',
          status: 'FAILED_PAYMENT',
          startDate: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() - 1000), // Expired
        },
      });

      // Create wallet and entry for failed payment user
      const failedWallet = await walletService.getOrCreateWallet(failedPaymentUser.id);
      const failedEntry = await prisma.walletTransaction.create({
        data: {
          walletId: failedWallet.id,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          status: 'COMPLETED',
          cashbackStatus: 'CLEARED',
          cashbackExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          description: 'Test entry for failed payment user',
        },
      });

      // Create user with no IBAN (ineligible)
      const noIbanUser = await prisma.user.create({
        data: {
          email: `user-no-iban-${suffix}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'No',
          lastName: 'IBAN',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          // No IBAN
        },
      });
      noIbanUserId = noIbanUser.id;

      // Create ACTIVE subscription for no-IBAN user
      await prisma.subscription.create({
        data: {
          userId: noIbanUser.id,
          plan: 'PREMIUM_WEEKLY',
          status: 'ACTIVE',
          startDate: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Create wallet and entry for no-IBAN user
      const noIbanWallet = await walletService.getOrCreateWallet(noIbanUser.id);
      const noIbanEntry = await prisma.walletTransaction.create({
        data: {
          walletId: noIbanWallet.id,
          type: 'CASHBACK_CREDIT',
          amount: 100,
          status: 'COMPLETED',
          cashbackStatus: 'CLEARED',
          cashbackExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          description: 'Test entry for no-IBAN user',
        },
      });

      // Create a valid eligible entry for successful lock test
      const eligibleWallet = await walletService.getOrCreateWallet(fixtures.userId);
      // Reset fixtures entry to a fresh CLEARED state for re-testing
      const freshEntry = await prisma.walletTransaction.create({
        data: {
          walletId: eligibleWallet.id,
          type: 'CASHBACK_CREDIT',
          amount: 75,
          status: 'COMPLETED',
          cashbackStatus: 'CLEARED',
          cashbackExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          description: 'Fresh entry for lock test',
        },
      });
      eligibleEntryId = freshEntry.id;
    });

    afterAll(async () => {
      // Cleanup users created in beforeAll
      if (failedPaymentUserId) {
        await cleanupFixtures(failedPaymentUserId).catch(() => {});
      }
      if (noIbanUserId) {
        await cleanupFixtures(noIbanUserId).catch(() => {});
      }
    });

    it('should reject lock when user has FAILED_PAYMENT subscription (ineligible)', async () => {
      const failedUser = await prisma.user.findFirst({
        where: { email: { contains: 'user-failed-' } },
      });
      if (!failedUser) throw new Error('Failed payment user not found');

      const entry = await prisma.walletTransaction.findFirst({
        where: {
          wallet: { userId: failedUser.id },
          type: 'CASHBACK_CREDIT',
        },
      });
      if (!entry) throw new Error('Entry not found');

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/lock`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/ineligible|FAILED_PAYMENT/i);
    });

    it('should reject lock when user has no IBAN on file (ineligible)', async () => {
      const noIbanUser = await prisma.user.findFirst({
        where: { email: { contains: 'user-no-iban-' } },
      });
      if (!noIbanUser) throw new Error('No-IBAN user not found');

      const entry = await prisma.walletTransaction.findFirst({
        where: {
          wallet: { userId: noIbanUser.id },
          type: 'CASHBACK_CREDIT',
        },
      });
      if (!entry) throw new Error('Entry not found');

      const res = await request(app)
        .post(`/api/admin/cashback/entries/${entry.id}/lock`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/IBAN|ineligible/i);
    });

    it('should allow lock when user is eligible (ACTIVE subscription + IBAN)', async () => {
      const res = await request(app)
        .post(`/api/admin/cashback/entries/${eligibleEntryId}/lock`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/lock/i);

      // Verify entry is now LOCKED
      const locked = await prisma.walletTransaction.findUnique({
        where: { id: eligibleEntryId },
      });
      expect(locked?.cashbackStatus).toBe('LOCKED');
      expect(locked?.status).toBe('CANCELLED');
    });
  });

  // ============================================================================
  // DEFECT C: DELETE /rates/snapshot/:iso brittle matching
  // ============================================================================

  describe('DEFECT C: Snapshot delete with tolerance window', () => {
    it('should delete snapshot when timestamp matches exactly', async () => {
      const baseDate = new Date();
      baseDate.setSeconds(0, 0); // Clear seconds and ms for clean time

      // Create a rate snapshot
      await prisma.cashbackRate.createMany({
        data: [
          {
            discountStep: 1,
            basic: 0.5,
            premium: 0.7,
            effectiveFrom: baseDate,
            createdBy: null,
          },
          {
            discountStep: 2,
            basic: 0.8,
            premium: 1.0,
            effectiveFrom: baseDate,
            createdBy: null,
          },
        ],
      });

      // Delete by exact ISO string
      const isoString = baseDate.toISOString();
      const res = await request(app)
        .delete(`/api/admin/cashback/rates/snapshot/${isoString}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Cancelled/i);
      expect(res.body.message).toMatch(/2.*rows/); // 2 rate rows deleted

      // Verify deletion
      const remaining = await prisma.cashbackRate.findMany({
        where: { effectiveFrom: baseDate },
      });
      expect(remaining.length).toBe(0);
    });

    it('should delete snapshot when ISO string has millisecond precision variance', async () => {
      const baseDate = new Date();
      const baseDateMs = baseDate.getTime();
      const futureDate = new Date(baseDateMs + 7 * 24 * 60 * 60 * 1000); // 7 days in future

      // Create a rate snapshot with stored time
      const storedTime = new Date(futureDate.getTime());
      await prisma.cashbackRate.createMany({
        data: [
          {
            discountStep: 1,
            basic: 0.5,
            premium: 0.7,
            effectiveFrom: storedTime,
            createdBy: null,
          },
          {
            discountStep: 2,
            basic: 0.8,
            premium: 1.0,
            effectiveFrom: storedTime,
            createdBy: null,
          },
        ],
      });

      // Client rounds or truncates the timestamp differently (e.g., +300ms offset)
      const clientTime = new Date(storedTime.getTime() + 300);
      const isoString = clientTime.toISOString();

      const res = await request(app)
        .delete(`/api/admin/cashback/rates/snapshot/${isoString}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Cancelled/i);

      // Verify deletion: should have deleted the snapshot despite the ±300ms offset
      const remaining = await prisma.cashbackRate.findMany({
        where: { effectiveFrom: storedTime },
      });
      expect(remaining.length).toBe(0);
    });

    it('should return 404 when no snapshot exists within tolerance window', async () => {
      // Try to delete a snapshot that doesn't exist
      const nonExistentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days in future
      const isoString = nonExistentDate.toISOString();

      const res = await request(app)
        .delete(`/api/admin/cashback/rates/snapshot/${isoString}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/No snapshot found/i);
    });

    it('should return 409 when snapshot is in the past (cannot delete active rates)', async () => {
      // Try to delete a past snapshot
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      const isoString = pastDate.toISOString();

      const res = await request(app)
        .delete(`/api/admin/cashback/rates/snapshot/${isoString}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/past|currently active/i);
    });
  });
});
