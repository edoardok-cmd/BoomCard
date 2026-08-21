/**
 * Integration tests for GET /api/admin/cashback/payout-thresholds
 * (ex-BC-ADMIN-SPEC-REAUDIT4-PAYOUT-THRESH-BGN-LEAK-1)
 *
 * HISTORY — this file used to carry TWO invariant classes:
 *
 *   1. The dual-currency (BGN+EUR) display class: raw-BGN gating by the
 *      `currency_transition_window_open` flag plus the `display:{bgn,eur}`
 *      wrapper. That feature was fully removed 2026-08-10 (BC-QA-031) — the
 *      transition window closed, the flag and `currencyDisplay.ts` are gone,
 *      and the endpoint now returns EUR-only scalars under `data`. Those
 *      assertions no longer describe anything and were removed with the
 *      feature.
 *
 *   2. The RBAC class (`cashback.read` permission gating) and the
 *      cashback/finance response-parity structural check. These are UNRELATED
 *      to currency, and this file is the ONLY coverage of them for this
 *      endpoint — so they are retained here, in this renamed file.
 *
 * Spec: §3.7 (per-plan payout thresholds).
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { genTestPhone } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }

  const payload = {
    id: userId,
    email: `test-${userId}@test.local`,
    role,
  };

  const token = jwt.sign(payload, jwtSecret, {
    expiresIn: '15m',
  });

  return token;
}

describe('BC-ADMIN-SPEC-REAUDIT4 — Cashback payout-thresholds access control + response parity', () => {
  let adminToken: string;
  let testUserIds: string[] = []; // Track test users for cleanup

  beforeAll(async () => {
    // Create admin user and get token
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-reaudit4-${Date.now()}@test.local`,
        firstName: 'Admin',
        lastName: 'Test',
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash: 'unused',
        phone: genTestPhone(),
      },
    });
    adminToken = generateTestToken(adminUser.id, 'SUPER_ADMIN');
    testUserIds.push(adminUser.id); // Track for cleanup
  });

  afterEach(async () => {
    // Clean up test users and their permission overrides
    // Remove any users created during tests (except the main adminUser)
    const usersToDelete = testUserIds.slice(1); // Skip the first user (adminUser)
    for (const userId of usersToDelete) {
      // Delete associated userPermissionOverrides first (foreign key constraint)
      await prisma.userPermissionOverride.deleteMany({
        where: { userId },
      });
      // Then delete the user
      await prisma.user.delete({
        where: { id: userId },
      }).catch(() => {
        // Silently ignore if user doesn't exist (test may have failed before creation)
      });
    }
    // Reset the temporary users list after cleanup
    testUserIds = testUserIds.slice(0, 1);
  });

  afterAll(async () => {
    // BC-QA-045-FOLLOWUP-3: the afterEach above deliberately skips index 0
    // (`testUserIds.slice(1)`) because `adminUser` is a fixture shared
    // across every test in this file, not a per-test one — but the file had
    // NO afterAll at all, so that shared SUPER_ADMIN row was never deleted.
    // Left behind, it is exactly the class of leaked non-archived
    // SUPER_ADMIN fixture that defeats sa-guard-races.test.ts DEFECT 3's
    // "exactly 1 existing SUPER_ADMIN" bootstrap precondition in any later
    // suite that counts them (see BC-QA-045-FOLLOWUP-3 task description).
    const adminUserId = testUserIds[0];
    if (adminUserId) {
      await prisma.userPermissionOverride.deleteMany({ where: { userId: adminUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminUserId } }).catch(() => {
        // Non-fatal if already gone.
      });
    }
    await prisma.$disconnect();
  });

  describe('GET /api/admin/cashback/payout-thresholds', () => {
    it('should require cashback.read permission', async () => {
      // Try without auth
      const res = await request(app)
        .get('/api/admin/cashback/payout-thresholds');

      expect(res.status).toBe(401);
    });

    it('should return 403 for authenticated user without cashback.read permission', async () => {
      // Create a regular ADMIN user and manually deny them cashback.read permission via override
      const restrictedAdminUser = await prisma.user.create({
        data: {
          email: `admin-no-cashback-${Date.now()}@test.local`,
          firstName: 'RestrictedAdmin',
          lastName: 'Test',
          status: 'ACTIVE',
          role: 'ADMIN',
          emailVerified: true,
          passwordHash: 'unused',
          phone: genTestPhone(),
        },
      });
      // Track this user for cleanup in afterEach
      testUserIds.push(restrictedAdminUser.id);

      // Get or create the permission and then deny it for this user
      const permission = await prisma.permission.findUnique({
        where: { key: 'cashback.read' },
      });

      if (permission) {
        // Deny the permission for this specific user
        await prisma.userPermissionOverride.create({
          data: {
            userId: restrictedAdminUser.id,
            permissionId: permission.id,
            allow: false,
          },
        });
      }

      const restrictedToken = generateTestToken(restrictedAdminUser.id, 'ADMIN');

      // Try with token but denied permission
      const res = await request(app)
        .get('/api/admin/cashback/payout-thresholds')
        .set('Authorization', `Bearer ${restrictedToken}`);

      expect(res.status).toBe(403);
      // 403 response may have error message but not success field if middleware returns early
      if (res.body.success !== undefined) {
        expect(res.body.success).toBe(false);
      }
    });

    it('should maintain consistency with finance payout-thresholds response structure', async () => {
      const cashbackRes = await request(app)
        .get('/api/admin/cashback/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      const financeRes = await request(app)
        .get('/api/admin/finance/payout-thresholds')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(cashbackRes.status).toBe(200);
      expect(financeRes.status).toBe(200);

      // Both should have the same envelope. BC-QA-031 removed the `display`
      // dual-currency sibling — `data` now carries EUR-only scalars directly.
      expect(cashbackRes.body).toHaveProperty('success');
      expect(cashbackRes.body).toHaveProperty('data');
      expect(cashbackRes.body).not.toHaveProperty('display');

      expect(financeRes.body).toHaveProperty('success');
      expect(financeRes.body).toHaveProperty('data');
      expect(financeRes.body).not.toHaveProperty('display');

      // Both should have same plan keys in data
      expect(Object.keys(cashbackRes.body.data).sort()).toEqual(
        Object.keys(financeRes.body.data).sort()
      );

      // Threshold values must match between the two surfaces, and every one of
      // them must be a plain EUR number (spec §3.7 + BC-QA-031 EUR-only).
      const plans = ['BASIC', 'PREMIUM_WEEKLY', 'PREMIUM', 'PREMIUM_MONTHLY'];
      for (const plan of plans) {
        expect(typeof cashbackRes.body.data[plan]).toBe('number');
        expect(cashbackRes.body.data[plan]).toBeGreaterThan(0);
        expect(cashbackRes.body.data[plan]).toBe(financeRes.body.data[plan]);
      }

      // Backward-compat alias: PREMIUM_MONTHLY mirrors the spec key PREMIUM.
      expect(cashbackRes.body.data.PREMIUM_MONTHLY).toBe(cashbackRes.body.data.PREMIUM);
    });
  });
});
