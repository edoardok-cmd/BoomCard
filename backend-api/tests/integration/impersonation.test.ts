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
import { genTestPhone } from '../helpers/test-utils';

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
      phone: genTestPhone(),
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // impersonate.partner (and impersonate.user) are OVERRIDE-ONLY permission
  // keys (src/services/permission.service.ts OVERRIDE_ONLY_KEYS) — granted
  // per-admin via UserPermissionOverride only, never via a role template. A
  // plain role: 'ADMIN' user has NO permissions until explicitly granted
  // (SUPER_ADMIN alone bypasses requirePermission() — see
  // resolveUserPermissions()/requirePermission() in
  // src/middleware/auth.middleware.ts). Every test below that impersonates a
  // PARTNER through `fx.adminId`'s token needs this grant, or POST
  // /auth/impersonate always 403s regardless of route/business-logic
  // correctness (BC-QA-042).
  const impersonatePartnerPermission = await prisma.permission.findUnique({
    where: { key: 'impersonate.partner' },
  });
  if (!impersonatePartnerPermission) {
    throw new Error('impersonate.partner permission not found — run seed-permissions first');
  }
  await prisma.userPermissionOverride.create({
    data: {
      userId: admin.id,
      permissionId: impersonatePartnerPermission.id,
      allow: true,
    },
  });
  // Deliberately NOT granting impersonate.user to this fixture admin: per
  // AuthService.impersonate (BC-ADMIN-RBAC-ROLES-019), gating is derived from
  // the RESOLVED target's role, not which body field the client sent
  // (targetPartnerUserId is accepted as a generic alias for targetUserId).
  // There is no separate "target type mismatch" validation — an admin
  // without impersonate.user simply 403s when the resolved target is a USER.
  // See the "rejects impersonation of a non-PARTNER user" test below, fixed
  // to assert that actual (403) behaviour instead of a 400 that this code
  // path has never produced (BC-QA-042).

  const partner = await prisma.user.create({
    data: {
      email: partnerEmail,
      passwordHash: partnerHash,
      firstName: 'Imp',
      lastName: 'Partner',
      phone: genTestPhone(),
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
      phone: genTestPhone(),
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
      phone: genTestPhone(),
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

// impersonateRateLimiter (src/middleware/security.middleware.ts) allows only
// 10 impersonate calls per 15 minutes, keyed per-admin-userId, with no
// NODE_ENV==='test' skip (unlike several other limiters in that file).
// fx.adminId is shared across this whole file and is used for POST
// /auth/impersonate in >10 tests, so tests further down the file exhaust its
// bucket and get 429 instead of exercising the behaviour under test — a
// self-starvation pattern structurally identical to the
// contact-form-help-ticket.test.ts contactRateLimiter finding (BC-QA-042
// category 5). Silently adding a test-env skip to the route's rate limiter
// would be a production behaviour change and needs a real decision, so
// instead (mirroring the pattern the file's own
// "scopes the revocation to the caller" test already uses) mint a FRESH
// admin — with its own rate-limit bucket — for tests that don't specifically
// need fx.adminId's identity.
async function createFreshImpersonatingAdmin(tag: string): Promise<{ id: string; email: string }> {
  const email = `imp-admin-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      firstName: 'Imp',
      lastName: 'FreshAdmin',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });
  const impersonatePartnerPermission = await prisma.permission.findUnique({
    where: { key: 'impersonate.partner' },
  });
  if (!impersonatePartnerPermission) {
    throw new Error('impersonate.partner permission not found — run seed-permissions first');
  }
  await prisma.userPermissionOverride.create({
    data: {
      userId: admin.id,
      permissionId: impersonatePartnerPermission.id,
      allow: true,
    },
  });
  return { id: admin.id, email };
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

    it('rejects impersonation of a non-PARTNER user when the caller lacks impersonate.user', async () => {
      // AuthService.impersonate accepts targetPartnerUserId as a generic
      // alias for targetUserId and derives the REQUIRED permission from the
      // resolved target's actual role (PARTNER → impersonate.partner, USER →
      // impersonate.user) — it has no separate "target type mismatch" 400
      // validation. fx.adminId only holds impersonate.partner (see
      // createFixtures), so resolving a USER target here correctly 403s as
      // a permission denial, not a 400 (BC-QA-042 — the test previously
      // expected a 400 this code path has never produced).
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const res = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.regularUserId });

      expect(res.status).toBe(403);
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

    it('rejects refresh when acting admin is archived', async () => {
      // Part 4 impersonation invariants: refreshToken must re-validate the acting
      // admin status. If the admin is decommissioned, refresh must fail (401) without
      // carrying impersonation forward.
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);
      const impRefreshToken = impRes.body.data.refreshToken;

      // Archive the admin account
      await prisma.user.update({
        where: { id: fx.adminId },
        data: { status: 'ARCHIVED' },
      });

      // Attempt refresh — must fail because the acting admin is no longer ACTIVE
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: impRefreshToken });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.error).toContain('Impersonation session ended');

      // Verify the refresh token was revoked
      const stored = await prisma.refreshToken.findUnique({
        where: { token: impRefreshToken },
      });
      expect(stored).toBeNull();

      // Restore admin for other tests
      await prisma.user.update({
        where: { id: fx.adminId },
        data: { status: 'ACTIVE' },
      });
    });

    it('rejects refresh when acting admin is suspended', async () => {
      const { accessToken } = await loginWeb(fx.adminEmail, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);
      const impRefreshToken = impRes.body.data.refreshToken;

      // Suspend the admin account
      await prisma.user.update({
        where: { id: fx.adminId },
        data: { status: 'SUSPENDED' },
      });

      // Refresh must fail
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: impRefreshToken });

      expect(refreshRes.status).toBe(401);

      // Restore admin for other tests
      await prisma.user.update({
        where: { id: fx.adminId },
        data: { status: 'ACTIVE' },
      });
    });

    it('rejects refresh when acting admin is downgraded from ADMIN to USER role', async () => {
      // Fresh admin (own impersonateRateLimiter bucket) — fx.adminId's is
      // exhausted by this point in the file (BC-QA-042, see
      // createFreshImpersonatingAdmin's doc comment).
      const downgradeAdmin = await createFreshImpersonatingAdmin('downgrade');
      createdUserIds.push(downgradeAdmin.id);
      const { accessToken } = await loginWeb(downgradeAdmin.email, ADMIN_PASSWORD);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId });
      expect(impRes.status).toBe(200);
      const impRefreshToken = impRes.body.data.refreshToken;

      // Downgrade admin to USER role (this stamps rolesUpdatedAt)
      await prisma.user.update({
        where: { id: downgradeAdmin.id },
        data: { role: 'USER' },
      });

      // Refresh must fail
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: impRefreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('/auth/switch-account refuses impersonation tokens', () => {
    it('returns 400 when called with an impersonation session', async () => {
      // Fresh admin — see the downgrade test above (BC-QA-042).
      const switchAdmin = await createFreshImpersonatingAdmin('switch');
      createdUserIds.push(switchAdmin.id);
      const { accessToken } = await loginWeb(switchAdmin.email, ADMIN_PASSWORD);

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
      // Fresh admin — see createFreshImpersonatingAdmin's doc comment
      // (BC-QA-042).
      const auditAdmin = await createFreshImpersonatingAdmin('audit');
      createdUserIds.push(auditAdmin.id);
      const { accessToken } = await loginWeb(auditAdmin.email, ADMIN_PASSWORD);

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
          actorUserId: auditAdmin.id,
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
          actorUserId: auditAdmin.id,
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
          phone: genTestPhone(),
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
      // Fresh admin — see createFreshImpersonatingAdmin's doc comment
      // (BC-QA-042).
      const revokeAdmin = await createFreshImpersonatingAdmin('revoke');
      createdUserIds.push(revokeAdmin.id);
      const { accessToken, refreshToken: adminRefresh } = await loginWeb(
        revokeAdmin.email,
        ADMIN_PASSWORD,
      );

      const before = await prisma.refreshToken.findMany({
        where: { userId: revokeAdmin.id },
        select: { token: true },
      });
      expect(before.some((r) => r.token === adminRefresh)).toBe(true);

      const impRes = await request(app)
        .post('/api/auth/impersonate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetPartnerUserId: fx.partnerUserId, refreshToken: adminRefresh });
      expect(impRes.status).toBe(200);

      const after = await prisma.refreshToken.findMany({
        where: { userId: revokeAdmin.id, token: adminRefresh },
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

      // Bystander doesn't need impersonate.partner (it never calls
      // /impersonate itself); caller does — use createFreshImpersonatingAdmin
      // so it actually has the grant (the inline-created admins here
      // previously had NO permission override at all, so `caller`'s own
      // impersonate call always 403'd before this test could exercise the
      // actual scoping behaviour under test — BC-QA-042).
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
          phone: genTestPhone(),
        },
        }),
        createFreshImpersonatingAdmin('caller'),
      ]);
      createdUserIds.push(bystander.id, caller.id);

      const { refreshToken: bystanderRefresh } = await loginWeb(bystanderEmail, ADMIN_PASSWORD);
      const { accessToken: callerAccess } = await loginWeb(caller.email, ADMIN_PASSWORD);

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
      // Fresh admin — see createFreshImpersonatingAdmin's doc comment
      // (BC-QA-042).
      const auditFailAdmin = await createFreshImpersonatingAdmin('audit-fail-start');
      createdUserIds.push(auditFailAdmin.id);
      const { accessToken, refreshToken: adminRefresh } = await loginWeb(auditFailAdmin.email, ADMIN_PASSWORD);

      // Verify admin refresh token exists before the call
      const tokensBefore = await prisma.refreshToken.findMany({
        where: { userId: auditFailAdmin.id, token: adminRefresh },
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
          where: { userId: auditFailAdmin.id, token: adminRefresh },
        });
        expect(tokensAfter).toHaveLength(1);
        expect(tokensAfter[0].token).toBe(adminRefresh);

        // CRITICAL: Verify no audit log was written
        const auditLogs = await prisma.auditLog.findMany({
          where: {
            actorUserId: auditFailAdmin.id,
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
      // Fresh admin — see createFreshImpersonatingAdmin's doc comment
      // (BC-QA-042).
      const stopFailAdmin = await createFreshImpersonatingAdmin('audit-fail-stop');
      createdUserIds.push(stopFailAdmin.id);
      const { accessToken } = await loginWeb(stopFailAdmin.email, ADMIN_PASSWORD);

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
            actorUserId: stopFailAdmin.id,
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
