/**
 * Integration Tests: Account Switching
 *
 * Covers the sibling-account switcher added in commit-chain following
 * e02b503. Focus areas (see audit in tasks/todo.md):
 *
 *   #1  refresh-token deletion must be scoped to the caller's userId so a
 *       body-supplied token string can't nuke another user's session
 *   #3  password change on a sibling must invalidate any peer refresh
 *       token whose accountGroup claim still lists the rotated account
 *   #5  the ct (clientType) claim on the JWT must survive refresh/switch
 *   #14 SUSPENDED siblings must not appear in the switcher list
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { cleanupTestUser } from '../helpers/test-utils';

const SHARED_PASSWORD = 'SiblingPass123!';

async function createWebSiblings() {
  const email = `sibling-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);

  const partner = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Partner',
      lastName: 'Sibling',
      phone: '+359000000000',
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  await prisma.partner.create({
    data: {
      userId: partner.id,
      businessName: 'Sibling Bistro',
      category: 'Restaurant',
      status: 'ACTIVE',
      email,
      verifiedAt: new Date(),
    },
  });

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Admin',
      lastName: 'Sibling',
      phone: '+359000000001',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  return { email, partnerId: partner.id, adminId: admin.id };
}

describe('Account Switching (web)', () => {
  const createdUserIds: string[] = [];
  let email: string;
  let partnerId: string;
  let adminId: string;

  beforeAll(async () => {
    const ctx = await createWebSiblings();
    email = ctx.email;
    partnerId = ctx.partnerId;
    adminId = ctx.adminId;
    createdUserIds.push(partnerId, adminId);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  describe('login surface + switchable accounts', () => {
    it('returns both siblings and stamps ag + ct on the access token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: SHARED_PASSWORD, clientType: 'web' });

      expect(res.status).toBe(200);
      const { accessToken, switchableAccounts } = res.body.data;

      expect(Array.isArray(switchableAccounts)).toBe(true);
      expect(switchableAccounts).toHaveLength(2);
      expect(switchableAccounts.map((a: any) => a.id).sort()).toEqual(
        [partnerId, adminId].sort(),
      );

      const decoded = jwt.decode(accessToken) as any;
      expect(Array.isArray(decoded.ag)).toBe(true);
      expect(decoded.ag.sort()).toEqual([partnerId, adminId].sort());
      expect(decoded.ct).toBe('web');
    });

    it('does not expose siblings to a mobile-surface login (mobile=USER-only)', async () => {
      // Web-only siblings should never leak to the mobile client, regardless
      // of role overlap. Mobile login must fail entirely here because neither
      // sibling has role=USER.
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: SHARED_PASSWORD, clientType: 'mobile' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/switch-account', () => {
    async function loginWeb() {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: SHARED_PASSWORD, clientType: 'web' });
      return {
        accessToken: res.body.data.accessToken as string,
        refreshToken: res.body.data.refreshToken as string,
        user: res.body.data.user,
      };
    }

    it('rotates to a target that is in the ag claim', async () => {
      const { accessToken, refreshToken, user } = await loginWeb();
      const target = user.id === partnerId ? adminId : partnerId;

      const res = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetAccountId: target, refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(target);

      const nextAccess = res.body.data.accessToken;
      const decoded = jwt.decode(nextAccess) as any;
      expect(decoded.id).toBe(target);
      expect(decoded.ct).toBe('web');
      // Group must carry forward so the user can switch back without re-auth.
      expect(decoded.ag.sort()).toEqual([partnerId, adminId].sort());
    });

    it('rejects a targetAccountId not in the ag claim (403)', async () => {
      const { accessToken, refreshToken } = await loginWeb();

      const res = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          targetAccountId: '00000000-0000-0000-0000-000000000000',
          refreshToken,
        });

      expect(res.status).toBe(403);
    });

    it('#1 does not delete refresh tokens belonging to other users', async () => {
      // Simulate griefing: attacker knows/guesses another user's refresh
      // token string and passes it in the request body hoping it gets
      // deleted. The server must only delete tokens that belong to the
      // authenticated caller.
      const victim = await prisma.user.create({
        data: {
          email: `victim-${Date.now()}@boomcard.bg`,
          passwordHash: await bcrypt.hash('VictimPass123!', 10),
          role: 'USER',
          status: 'ACTIVE',
          phone: '+359000000002',
          firstName: 'Test',
          lastName: 'User',
        },
      });
      createdUserIds.push(victim.id);

      const victimToken = await prisma.refreshToken.create({
        data: {
          token: `victim-refresh-${Date.now()}`,
          userId: victim.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const { accessToken } = await loginWeb();
      const target = adminId;

      const res = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ targetAccountId: target, refreshToken: victimToken.token });

      expect(res.status).toBe(200);

      // Victim's token must still exist
      const stillThere = await prisma.refreshToken.findUnique({
        where: { id: victimToken.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it('#14 filters SUSPENDED siblings out of the switcher list', async () => {
      const suspendedEmail = `suspended-${Date.now()}@boomcard.bg`;
      const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);

      const live = await prisma.user.create({
        data: {
          email: suspendedEmail,
          passwordHash,
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
          phone: '+359000000003',
          firstName: 'Test',
          lastName: 'User',
        },
      });
      await prisma.partner.create({
        data: {
          userId: live.id,
          businessName: 'Live Partner',
          category: 'Retail',
          status: 'ACTIVE',
          email: suspendedEmail,
          verifiedAt: new Date(),
        },
      });

      const suspended = await prisma.user.create({
        data: {
          email: suspendedEmail,
          passwordHash,
          role: 'ADMIN',
          status: 'SUSPENDED',
          phone: '+359000000004',
          firstName: 'Test',
          lastName: 'User',
        },
      });
      createdUserIds.push(live.id, suspended.id);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: suspendedEmail, password: SHARED_PASSWORD, clientType: 'web' });

      // Login should succeed on the live sibling; suspended one is hidden.
      expect(loginRes.status).toBe(200);
      const accounts = loginRes.body.data.switchableAccounts ?? [];
      const ids = accounts.map((a: any) => a.id);
      expect(ids).not.toContain(suspended.id);
    });
  });

  describe('#3 password rotation invalidates sibling sessions', () => {
    it("deletes peer refresh tokens whose ag claim still lists the rotated user", async () => {
      // Login as PARTNER → refresh token's accountGroup contains adminId.
      const peerLogin = await request(app)
        .post('/api/auth/login')
        .send({ email, password: SHARED_PASSWORD, clientType: 'web' });
      expect(peerLogin.status).toBe(200);

      // This login may land on either sibling; pick the refresh token
      // whose userId != adminId (so the test asserts sibling revocation).
      const peerRefresh = peerLogin.body.data.refreshToken;
      const stored = await prisma.refreshToken.findUnique({ where: { token: peerRefresh } });
      expect(stored).toBeTruthy();
      expect(stored!.accountGroup).toContain(adminId);

      // Login as the other sibling (the one whose password we'll rotate) so
      // we have an access token scoped to that user.
      const targetId = stored!.userId === adminId ? partnerId : adminId;
      // To make the assertion below meaningful, we rotate the *other* sibling's
      // password — not the user whose refresh token we're holding.
      const rotateTargetId = stored!.userId === adminId ? partnerId : adminId;

      // Obtain an access token for rotateTargetId by logging in again and
      // filtering — simpler: directly change the password via service-level
      // bypass by calling change-password after a targeted login. But login
      // auto-picks a sibling; use a direct prisma update + refresh-token
      // deletion simulation so we exercise the service function.
      const { AuthService } = await import('../../src/services/auth.service');
      await AuthService.changePassword(rotateTargetId, SHARED_PASSWORD, 'RotatedPass456!');

      // After rotation, any refresh token whose accountGroup mentions
      // rotateTargetId must be gone — this is the sibling-revocation fix.
      const afterRotation = await prisma.refreshToken.findUnique({
        where: { token: peerRefresh },
      });
      expect(afterRotation).toBeNull();

      // And a refresh attempt with the stale token must now 401.
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: peerRefresh });
      expect(refreshRes.status).toBe(401);

      // Reset the password so other tests keep working.
      await AuthService.changePassword(rotateTargetId, 'RotatedPass456!', SHARED_PASSWORD);

      // targetId is referenced to keep the variable meaningful even when
      // the test path collapses (both siblings rotate the same direction
      // depending on which one the login picked).
      expect(targetId).toBeDefined();
    });
  });

  describe('#5 ct claim preserved across refresh', () => {
    it('stamps ct=web on the rotated refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password: SHARED_PASSWORD, clientType: 'web' });
      expect(loginRes.status).toBe(200);

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.data.refreshToken });
      expect(refreshRes.status).toBe(200);

      const decoded = jwt.decode(refreshRes.body.data.accessToken) as any;
      expect(decoded.ct).toBe('web');
    });
  });

  describe('#3b access-token pivot window', () => {
    // Refresh-token revocation closes the long-lived tail, but access tokens
    // are not individually revocable. Sibling A's already-minted access token
    // (ag=[A,B], ct=web) stays valid for up to the 15-min TTL; without a
    // freshness check, A could pivot to B after B rotated its password.
    //
    // switchAccount compares target.passwordChangedAt AND caller.passwordChangedAt
    // against the caller's iat and refuses the pivot when either rotation
    // happened after the token was minted. The 1-second grace matches the
    // service cushion.

    async function mintPivotSiblings(tag: string) {
      const email = `pivot-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
      const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
      const pPartner = await prisma.user.create({
        data: { email, passwordHash, role: 'PARTNER', status: 'ACTIVE', emailVerified: true, firstName: 'Pivot', lastName: 'Partner', phone: '+359000000005' },
      });
      await prisma.partner.create({
        data: { userId: pPartner.id, businessName: `Pivot ${tag}`, category: 'Restaurant', status: 'ACTIVE', email, verifiedAt: new Date() },
      });
      const pAdmin = await prisma.user.create({
        data: { email, passwordHash, role: 'ADMIN', status: 'ACTIVE', firstName: 'Pivot', lastName: 'Admin', phone: '+359000000006' },
      });
      createdUserIds.push(pPartner.id, pAdmin.id);
      return { email, pPartnerId: pPartner.id, pAdminId: pAdmin.id };
    }

    it('refuses pivot when target passwordChangedAt > caller iat', async () => {
      const { email: pivotEmail, pPartnerId, pAdminId } = await mintPivotSiblings('tgt');

      // A's session: log in, capture the access token (ag carries both ids).
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: pivotEmail, password: SHARED_PASSWORD, clientType: 'web' });
      expect(loginRes.status).toBe(200);
      const attackerAccess = loginRes.body.data.accessToken as string;
      const attackerUserId = loginRes.body.data.user.id as string;
      const targetId = attackerUserId === pPartnerId ? pAdminId : pPartnerId;

      // Deterministic: skip real setTimeout + changePassword and stamp
      // passwordChangedAt directly to iat + 2s so we're comfortably past
      // the 1s clock-skew grace.
      const decoded = jwt.decode(attackerAccess) as any;
      expect(typeof decoded.iat).toBe('number');
      await prisma.user.update({
        where: { id: targetId },
        data: { passwordChangedAt: new Date((decoded.iat + 2) * 1000) },
      });

      const switchRes = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${attackerAccess}`)
        .send({ targetAccountId: targetId });

      expect(switchRes.status).toBe(401);
      expect(String(switchRes.body?.error || switchRes.body?.message || ''))
        .toMatch(/target account credentials have changed/i);
    }, 15000);

    it('refuses pivot when CALLER passwordChangedAt > caller iat (symmetry)', async () => {
      // Incident-response scenario: admin rotates the caller's OWN password
      // because the caller's session is suspected compromised. The leaked
      // access token must not be usable to hop to a sibling within the TTL.
      const { email: symEmail, pPartnerId, pAdminId } = await mintPivotSiblings('sym');

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: symEmail, password: SHARED_PASSWORD, clientType: 'web' });
      expect(loginRes.status).toBe(200);
      const attackerAccess = loginRes.body.data.accessToken as string;
      const attackerUserId = loginRes.body.data.user.id as string;
      const targetId = attackerUserId === pPartnerId ? pAdminId : pPartnerId;

      // Rotate the CALLER's passwordChangedAt (not target's) past the grace.
      const decoded = jwt.decode(attackerAccess) as any;
      await prisma.user.update({
        where: { id: attackerUserId },
        data: { passwordChangedAt: new Date((decoded.iat + 2) * 1000) },
      });

      const switchRes = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${attackerAccess}`)
        .send({ targetAccountId: targetId });

      expect(switchRes.status).toBe(401);
      expect(String(switchRes.body?.error || switchRes.body?.message || ''))
        .toMatch(/your credentials have changed/i);
    }, 15000);
  });

  describe('resolveClientType inference', () => {
    // Pre-deploy tokens have no `ct` claim; the route falls back to
    // Origin/Referer. Tokens used without either header (curl, Expo native
    // app) must classify as 'mobile', which in turn forbids pivoting to a
    // non-USER target. Regression guard: if the Origin fallback ever flips
    // to 'web' by accident, a leaked non-browser token could pivot into a
    // partner/admin session.
    it('classifies as mobile when ct claim and Origin/Referer are all absent', async () => {
      const email = `no-origin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
      const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
      const noOrigPartner = await prisma.user.create({
        data: { email, passwordHash, role: 'PARTNER', status: 'ACTIVE', emailVerified: true, phone: '+359000000007', firstName: 'Test', lastName: 'User' },
      });
      await prisma.partner.create({
        data: { userId: noOrigPartner.id, businessName: 'No-Origin Partner', category: 'Retail', status: 'ACTIVE', email, verifiedAt: new Date() },
      });
      const noOrigAdmin = await prisma.user.create({
        data: { email, passwordHash, role: 'ADMIN', status: 'ACTIVE', phone: '+359000000008', firstName: 'Test', lastName: 'User' },
      });
      createdUserIds.push(noOrigPartner.id, noOrigAdmin.id);

      // Hand-craft a pre-deploy style access token: has ag but no ct claim.
      const preDeployToken = jwt.sign(
        {
          id: noOrigPartner.id,
          email,
          role: 'PARTNER',
          ag: [noOrigPartner.id, noOrigAdmin.id],
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' },
      );

      // No Origin / Referer header → resolveClientType falls back to 'mobile'
      // → service refuses to pivot to a non-USER target.
      const res = await request(app)
        .post('/api/auth/switch-account')
        .set('Authorization', `Bearer ${preDeployToken}`)
        .send({ targetAccountId: noOrigAdmin.id });

      expect(res.status).toBe(403);
      expect(String(res.body?.error || res.body?.message || ''))
        .toMatch(/cannot switch.*mobile/i);
    });
  });

  describe('#7 switch-account rate limiter', () => {
    // The new switchAccountRateLimiter is userId-keyed (30/15min). In dev the
    // limiter short-circuits via `skip`, so this test only asserts the 429
    // shape when forced. CI runs with NODE_ENV=test (not 'development'), so
    // the limiter is live there.
    it('issues 429 after the configured burst (when limiter is active)', async () => {
      if (process.env.NODE_ENV === 'development') {
        return; // limiter skipped in dev — no 429 to assert
      }

      const burstEmail = `burst-${Date.now()}@boomcard.bg`;
      const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
      const a = await prisma.user.create({
        data: { email: burstEmail, passwordHash, role: 'PARTNER', status: 'ACTIVE', emailVerified: true, phone: '+359000000009', firstName: 'Test', lastName: 'User' },
      });
      await prisma.partner.create({
        data: { userId: a.id, businessName: 'Burst A', category: 'Retail', status: 'ACTIVE', email: burstEmail, verifiedAt: new Date() },
      });
      const b = await prisma.user.create({
        data: { email: burstEmail, passwordHash, role: 'ADMIN', status: 'ACTIVE', phone: '+359000000010', firstName: 'Test', lastName: 'User' },
      });
      createdUserIds.push(a.id, b.id);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: burstEmail, password: SHARED_PASSWORD, clientType: 'web' });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.data.accessToken as string;
      const current = loginRes.body.data.user.id as string;
      const target = current === a.id ? b.id : a.id;

      // Drive the limiter over its 30/15min ceiling. Sequential so we see the
      // first 429 deterministically; the limiter only cares about count.
      let saw429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await request(app)
          .post('/api/auth/switch-account')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ targetAccountId: target });
        if (res.status === 429) {
          saw429 = true;
          break;
        }
      }
      expect(saw429).toBe(true);
    }, 30000);
  });

  describe('#13 concurrent two-tab switches', () => {
    // Two tabs race a /switch-account with the same refresh token string.
    // Outcome should be: both succeed to mint fresh token pairs, AND the
    // old refresh row is purged (deleteMany by (token, userId) is a no-op
    // for whichever tab arrives second but never corrupts state).
    it('both calls succeed and the old refresh token is gone', async () => {
      const raceEmail = `race-${Date.now()}@boomcard.bg`;
      const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
      const pA = await prisma.user.create({
        data: { email: raceEmail, passwordHash, role: 'PARTNER', status: 'ACTIVE', emailVerified: true, phone: '+359000000011', firstName: 'Test', lastName: 'User' },
      });
      await prisma.partner.create({
        data: { userId: pA.id, businessName: 'Race Partner', category: 'Retail', status: 'ACTIVE', email: raceEmail, verifiedAt: new Date() },
      });
      const aA = await prisma.user.create({
        data: { email: raceEmail, passwordHash, role: 'ADMIN', status: 'ACTIVE', phone: '+359000000012', firstName: 'Test', lastName: 'User' },
      });
      createdUserIds.push(pA.id, aA.id);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: raceEmail, password: SHARED_PASSWORD, clientType: 'web' });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.data.accessToken as string;
      const refreshToken = loginRes.body.data.refreshToken as string;
      const current = loginRes.body.data.user.id as string;
      const target = current === pA.id ? aA.id : pA.id;

      const [r1, r2] = await Promise.all([
        request(app)
          .post('/api/auth/switch-account')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ targetAccountId: target, refreshToken }),
        request(app)
          .post('/api/auth/switch-account')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ targetAccountId: target, refreshToken }),
      ]);

      // Both should land at 200 (switchAccount doesn't care if refresh row
      // was already deleted — scoped deleteMany is a safe no-op).
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      // The original refresh row is gone; neither tab should be able to
      // reuse it after the race.
      const stale = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
      expect(stale).toBeNull();
    }, 15000);
  });
});
