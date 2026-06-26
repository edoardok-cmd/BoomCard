/**
 * Integration Tests: Admin Impersonation
 *
 * Covers the admin-initiated partner impersonation feature:
 *
 *   - /auth/impersonate stamps imp/impBy/impByRole/impAg on the token
 *   - /auth/stop-impersonate restores the admin session
 *   - imp claims survive a refresh-token rotation (regression)
 *   - nested impersonation, mobile, self-impersonation all rejected
 *   - switch-account refuses impersonation tokens
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { cleanupTestUser } from '../helpers/test-utils';

const ADMIN_PASSWORD = 'AdminPass123!';
const PARTNER_PASSWORD = 'PartnerPass123!';
const USER_PASSWORD = 'UserPass123!';

interface Fixtures {
  adminId: string;
  adminEmail: string;
  partnerUserId: string;
  partnerEmail: string;
  regularUserId: string;
  regularUserEmail: string;
  suspendedPartnerUserId: string;
  suspendedPartnerEmail: string;
}

async function createFixtures(): Promise<Fixtures> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const adminEmail = `imp-admin-${suffix}@boomcard.bg`;
  const partnerEmail = `imp-partner-${suffix}@boomcard.bg`;
  const regularUserEmail = `imp-user-${suffix}@boomcard.bg`;
  const suspendedPartnerEmail = `imp-susp-${suffix}@boomcard.bg`;

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const partnerHash = await bcrypt.hash(PARTNER_PASSWORD, 10);
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: adminHash,
      firstName: 'Imp',
      lastName: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const partner = await prisma.user.create({
    data: {
      email: partnerEmail,
      passwordHash: partnerHash,
      firstName: 'Imp',
      lastName: 'Partner',
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  await prisma.partner.create({
    data: {
      userId: partner.id,
      businessName: 'Imp Partner Bistro',
      category: 'Restaurant',
      status: 'ACTIVE',
      email: partnerEmail,
    },
  });

  const regular = await prisma.user.create({
    data: {
      email: regularUserEmail,
      passwordHash: userHash,
      firstName: 'Imp',
      lastName: 'User',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const suspended = await prisma.user.create({
    data: {
      email: suspendedPartnerEmail,
      passwordHash: partnerHash,
      firstName: 'Susp',
      lastName: 'Partner',
      role: 'PARTNER',
      status: 'SUSPENDED',
      emailVerified: true,
    },
  });
  await prisma.partner.create({
    data: {
      userId: suspended.id,
      businessName: 'Suspended Bistro',
      category: 'Restaurant',
      status: 'SUSPENDED',
      email: suspendedPartnerEmail,
    },
  });

  return {
    adminId: admin.id,
    adminEmail,
    partnerUserId: partner.id,
    partnerEmail,
    regularUserId: regular.id,
    regularUserEmail,
    suspendedPartnerUserId: suspended.id,
    suspendedPartnerEmail,
  };
}

async function loginWeb(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password, clientType: 'web' });
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { accessToken: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };
}

describe('Admin Impersonation', () => {
  let fx: Fixtures;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    fx = await createFixtures();
    createdUserIds.push(fx.adminId, fx.partnerUserId, fx.regularUserId, fx.suspendedPartnerUserId);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  describe('POST /api/auth/impersonate', () => {
    it('mints a token stamped with imp/impBy/impByRole and no ag', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(fx.partnerUserId);
      expect(res.body.data.user.role).toBe('PARTNER');
      expect(res.body.data.impersonation.adminId).toBe(fx.adminId);
      expect(res.body.data.impersonation.adminRole).toBe('ADMIN');

      const decoded = jwt.decode(res.body.data.accessToken) as any;
      expect(decoded.id).toBe(fx.partnerUserId);
      expect(decoded.role).toBe('PARTNER');
      expect(decoded.imp).toBe(true);
      expect(decoded.impBy).toBe(fx.adminId);
      expect(decoded.impByRole).toBe('ADMIN');
      // Impersonation tokens must not carry an ag claim — prevents pivoting
      // via /switch-account on a leaked impersonation token.
      expect(decoded.ag).toBeUndefined();
    });

    it('rejects a non-admin caller with 403', async () => {
      const { accessToken } = await loginWeb(fx.regularUserEmail, USER_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });

      expect(res.status).toBe(403);
    });

    it('rejects self-impersonation with 400', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.adminId });

      expect(res.status).toBe(400);
    });

    it('rejects impersonation of a non-PARTNER user with 400', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.regularUserId });

      expect(res.status).toBe(400);
    });

    it('rejects impersonation of a SUSPENDED partner with 403', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.suspendedPartnerUserId });

      expect(res.status).toBe(403);
    });

    it('rejects impersonation of a non-existent user with 404', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(404);
    });

    it('rejects nested impersonation with 400', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const first = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(first.status).toBe(200);

      const impToken = first.body.data.accessToken;
      // Authorize runs before the nested-imp guard, and an imp token has
      // role=PARTNER. The authorize('ADMIN', 'SUPER_ADMIN') gate must block
      // the second impersonate attempt on role alone — that's the 403 here.
      const second = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${impToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });

      expect(second.status).toBe(403);
    });
  });

  describe('POST /api/auth/stop-impersonate', () => {
    it('restores an admin session from the impBy claim', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);

      const stopRes = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${impRes.body.data.accessToken}`)
        .send({ refreshToken: impRes.body.data.refreshToken });

      expect(stopRes.status).toBe(200);
      expect(stopRes.body.data.user.id).toBe(fx.adminId);
      expect(stopRes.body.data.user.role).toBe('ADMIN');

      const decoded = jwt.decode(stopRes.body.data.accessToken) as any;
      expect(decoded.id).toBe(fx.adminId);
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.imp).toBeUndefined();
      expect(decoded.impBy).toBeUndefined();
    });

    it('rejects stop-impersonate on a non-impersonation session with 400', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Impersonation claims survive refresh (regression)', () => {
    it('carries imp/impBy/impByRole forward across /auth/refresh', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: impRes.body.data.refreshToken });

      expect(refreshRes.status).toBe(200);
      const rotated = jwt.decode(refreshRes.body.data.accessToken) as any;
      expect(rotated.id).toBe(fx.partnerUserId);
      expect(rotated.imp).toBe(true);
      expect(rotated.impBy).toBe(fx.adminId);
      expect(rotated.impByRole).toBe('ADMIN');

      // Stop-impersonate on the rotated token must still work — proving the
      // admin isn't stranded after the first refresh.
      const stopRes = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`)
        .send({ refreshToken: refreshRes.body.data.refreshToken });
      expect(stopRes.status).toBe(200);
      expect(stopRes.body.data.user.id).toBe(fx.adminId);
    });
  });

  describe('/auth/switch-account refuses impersonation tokens', () => {
    it('returns 400 when called with an impersonation session', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);

      const switchRes = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${impRes.body.data.accessToken}`)
        .send({ targetAccountId: fx.adminId });

      expect(switchRes.status).toBe(400);
    });
  });

  describe('Audit logging for impersonation events', () => {
    it('writes audit logs for both start and stop events', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);

      const stopRes = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${impRes.body.data.accessToken}`)
        .send({ refreshToken: impRes.body.data.refreshToken });
      expect(stopRes.status).toBe(200);

      // Verify START audit log
      const startAudit = await prisma.auditLog.findFirst({
        where: {
          actorUserId: fx.adminId,
          action: 'admin.impersonate.start',
          objectId: fx.partnerUserId,
        },
      });
      expect(startAudit).toBeDefined();
      if (startAudit) {
        expect(startAudit.objectType).toBe('partner');
        expect(startAudit.after).toMatchObject({
          targetRole: 'PARTNER',
          targetEmail: fx.partnerEmail,
        });
      }

      // Verify STOP audit log has matching objectType to START record
      const stopAudit = await prisma.auditLog.findFirst({
        where: {
          actorUserId: fx.adminId,
          action: 'admin.impersonate.stop',
          objectId: fx.partnerUserId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(stopAudit).toBeDefined();
      if (stopAudit) {
        // STOP record must have same objectType as START record for correlation
        expect(stopAudit.objectType).toBe('partner');
        expect(stopAudit.after).toMatchObject({
          adminRole: 'ADMIN',
        });
      }
    });

    it('writes audit logs with USER objectType when impersonating an end-user (SUPER_ADMIN)', async () => {
      // Create a SUPER_ADMIN with permission to impersonate users
      const superAdminEmail = `imp-super-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
      const superAdminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

      const superAdmin = await prisma.user.create({
        data: {
          email: superAdminEmail,
          passwordHash: superAdminHash,
          firstName: 'Super',
          lastName: 'Admin',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });
      createdUserIds.push(superAdmin.id);

      const { accessToken } = await loginWeb(superAdminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetUserId: fx.regularUserId });
      expect(impRes.status).toBe(200);

      // Verify START audit log has USER objectType
      const startAudit = await prisma.auditLog.findFirst({
        where: {
          actorUserId: superAdmin.id,
          action: 'admin.impersonate.start',
          objectId: fx.regularUserId,
        },
      });
      expect(startAudit).toBeDefined();
      if (startAudit) {
        expect(startAudit.objectType).toBe('user');
        expect(startAudit.after).toMatchObject({
          targetRole: 'USER',
        });
      }

      // Stop the impersonation and verify STOP audit log also has USER objectType
      const stopRes = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${impRes.body.data.accessToken}`)
        .send({ refreshToken: impRes.body.data.refreshToken });
      expect(stopRes.status).toBe(200);

      // Verify STOP audit log has matching USER objectType
      const stopAudit = await prisma.auditLog.findFirst({
        where: {
          actorUserId: superAdmin.id,
          action: 'admin.impersonate.stop',
          objectId: fx.regularUserId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(stopAudit).toBeDefined();
      if (stopAudit) {
        expect(stopAudit.objectType).toBe('user');
        expect(stopAudit.after).toMatchObject({
          adminRole: 'SUPER_ADMIN',
        });
      }
    });
  });

  describe('Admin pre-impersonation refresh token revocation', () => {
    it('revokes the admin refresh token when supplied in the impersonate body', async () => {
      const { accessToken, refreshToken: adminRefresh } = await loginWeb(
        fx.adminEmail,
        ADMIN_PASSWORD,
      );

      const before = await prisma.refreshToken.findMany({
        where: { userId: fx.adminId },
        select: { token: true },
      });
      expect(before.some((r) => r.token === adminRefresh)).toBe(true);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId, refreshToken: adminRefresh });
      expect(impRes.status).toBe(200);

      const after = await prisma.refreshToken.findMany({
        where: { userId: fx.adminId, token: adminRefresh },
      });
      expect(after.length).toBe(0);

      // Replaying the revoked admin refresh token must fail — proves a leaked
      // copy can't silently resurrect the admin session alongside the imp one.
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: adminRefresh });
      expect(refreshRes.status).toBe(401);
    });

    it('scopes the revocation to the caller — a refresh token belonging to another admin is not deleted', async () => {
      // Admin C (fresh rate-limit bucket) starts impersonation and forges the
      // body.refreshToken to name admin B's row. The userId clause in the
      // service's WHERE (userId = caller.id) must prevent the delete so B's
      // session survives. Uses a fresh caller admin because fx.adminId has
      // already exhausted its impersonation rate-limit bucket in earlier
      // tests in this file.
      const mkEmail = (tag: string) =>
        `imp-admin-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

      const bystanderEmail = mkEmail('bystander');
      const callerEmail = mkEmail('caller');

      const [bystander, caller] = await Promise.all([
        prisma.user.create({
          data: {
            email: bystanderEmail,
            passwordHash: hash,
            firstName: 'Imp',
            lastName: 'AdminB',
            role: 'ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
          },
        }),
        prisma.user.create({
          data: {
            email: callerEmail,
            passwordHash: hash,
            firstName: 'Imp',
            lastName: 'AdminC',
            role: 'ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
          },
        }),
      ]);
      createdUserIds.push(bystander.id, caller.id);

      const { refreshToken: bystanderRefresh } = await loginWeb(bystanderEmail, ADMIN_PASSWORD);
      const { accessToken: callerAccess } = await loginWeb(callerEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${callerAccess}`)
        .send({ targetPartnerUserId: fx.partnerUserId, refreshToken: bystanderRefresh });
      expect(impRes.status).toBe(200);

      // The bystander's refresh token must still be usable — the userId scope
      // clause prevented the caller from deleting a row they don't own.
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: bystanderRefresh });
      expect(refreshRes.status).toBe(200);
    });
  });

  describe('Audit write failure handling', () => {
    it('rolls back impersonate start if audit write fails — no token revoked, no impersonation artifact', async () => {
      const { accessToken, refreshToken: adminRefresh } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      // Verify admin refresh token exists before the call
      const tokensBefore = await prisma.refreshToken.findMany({
        where: { userId: fx.adminId, token: adminRefresh },
      });
      expect(tokensBefore).toHaveLength(1);

      // Mock the auditLog.create to throw an error
      const originalCreate = prisma.auditLog.create;
      let auditCreateCalled = false;
      prisma.auditLog.create = jest.fn(async () => {
        auditCreateCalled = true;
        throw new Error('Simulated audit write failure');
      });

      try {
        const res = await request(app)
          .post('/api/auth/impersonate')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ targetPartnerUserId: fx.partnerUserId, refreshToken: adminRefresh });

        // Impersonation should fail with 500 when audit write fails
        expect(res.status).toBe(500);
        // Verify that audit write was actually attempted
        expect(auditCreateCalled).toBe(true);

        // CRITICAL: Verify rollback — admin's refresh token was NOT revoked
        const tokensAfter = await prisma.refreshToken.findMany({
          where: { userId: fx.adminId, token: adminRefresh },
        });
        expect(tokensAfter).toHaveLength(1);
        expect(tokensAfter[0].token).toBe(adminRefresh);

        // CRITICAL: Verify no audit log was written
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            actorUserId: fx.adminId,
            action: 'admin.impersonate.start',
            objectId: fx.partnerUserId,
          },
        });
        expect(auditLogs).toHaveLength(0);

        // Verify admin's refresh token still works (session not broken)
        const refreshRes = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: adminRefresh });
        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.data.accessToken).toBeDefined();
      } finally {
        // Restore original function
        prisma.auditLog.create = originalCreate;
      }
    });

    it('rolls back stop-impersonate if audit write fails — no token deleted, impersonation session survives', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      // First, successfully start an impersonation
      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);

      const impRefreshToken = impRes.body.data.refreshToken;

      // Verify impersonation refresh token exists
      const tokensBefore = await prisma.refreshToken.findMany({
        where: { userId: fx.partnerUserId, token: impRefreshToken },
      });
      expect(tokensBefore).toHaveLength(1);

      // Now mock auditLog.create to throw on the next call (for stop-impersonate)
      const originalCreate = prisma.auditLog.create;
      let auditCreateCallCount = 0;
      prisma.auditLog.create = jest.fn(async () => {
        auditCreateCallCount++;
        throw new Error('Simulated audit write failure on stop');
      });

      try {
        const stopRes = await request(app)
          .post('/api/auth/stop-impersonate')
          .set('Authorization', `Bearer ${impRes.body.data.accessToken}`)
          .send({ refreshToken: impRefreshToken });

        // Stop-impersonate should fail with 500 when audit write fails
        expect(stopRes.status).toBe(500);
        // Verify that audit write was actually attempted
        expect(auditCreateCallCount).toBeGreaterThan(0);

        // CRITICAL: Verify rollback — impersonation refresh token was NOT deleted
        const tokensAfter = await prisma.refreshToken.findMany({
          where: { userId: fx.partnerUserId, token: impRefreshToken },
        });
        expect(tokensAfter).toHaveLength(1);
        expect(tokensAfter[0].token).toBe(impRefreshToken);

        // CRITICAL: Verify no audit log was written
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            actorUserId: fx.adminId,
            action: 'admin.impersonate.stop',
            objectId: fx.partnerUserId,
          },
        });
        expect(auditLogs).toHaveLength(0);

        // Verify impersonation session still works — can still call authenticated endpoints
        // as the impersonated partner (proving the token wasn't revoked)
        const getRes = await request(app)
          .get('/api/partners/my-profile')
          .set('Authorization', `Bearer ${impRes.body.data.accessToken}`);
        expect(getRes.status).not.toBe(401);
        expect(getRes.status).not.toBe(403);
      } finally {
        // Restore original function
        prisma.auditLog.create = originalCreate;
      }
    });
  });

});
