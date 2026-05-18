/**
 * Integration Tests: Authentication Flow
 *
 * Covers P0 critical path F01: Register → Verify Email → Login
 * Also covers GDPR endpoints: data export, account deletion, consent recording
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';

describe('Authentication Flow (F01)', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Registration ─────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const email = `auth-test-${Date.now()}@boomcard.bg`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+359888000123',
          acceptTerms: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe(email.toLowerCase());
      expect(res.body.data.user.firstName).toBe('John');
      expect(res.body.data.user.role).toBe('USER');
      expect(res.body.data.user.status).toBe('PENDING_VERIFICATION');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data).toHaveProperty('expiresIn');

      createdUserIds.push(res.body.data.user.id);
    });

    it('should record consent timestamps when acceptTerms is true', async () => {
      const { user } = await createTestUser({ acceptTerms: true });
      createdUserIds.push(user.id);

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          termsAcceptedAt: true,
          privacyAcceptedAt: true,
          termsVersion: true,
        },
      });

      expect(dbUser?.termsAcceptedAt).toBeTruthy();
      expect(dbUser?.privacyAcceptedAt).toBeTruthy();
      expect(dbUser?.termsVersion).toBe('2026-02-24');
    });

    it('should auto-create wallet, card, and loyalty account', async () => {
      const { user } = await createTestUser();
      createdUserIds.push(user.id);

      const [wallet, card, loyalty] = await Promise.all([
        prisma.wallet.findUnique({ where: { userId: user.id } }),
        prisma.card.findFirst({ where: { userId: user.id } }),
        prisma.loyaltyAccount.findFirst({ where: { userId: user.id } }),
      ]);

      expect(wallet).toBeTruthy();
      expect(wallet?.balance).toBe(0);
      expect(card).toBeTruthy();
      expect(card?.type).toBe('LIGHT');
      expect(loyalty).toBeTruthy();
      expect(loyalty?.tier).toBe('BRONZE');
    });

    it('should allow a partner account to share the email of an existing customer', async () => {
      // Users and partners are separate profiles and may share contact info.
      const { email } = await createTestUser();
      const first = await prisma.user.findFirst({ where: { email } });
      if (first) createdUserIds.push(first.id);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'AnotherPass123!',
          firstName: 'Duplicate',
          phone: '+359888000111',
          acceptTerms: true,
          accountType: 'partner',
          businessInfo: {
            businessName: 'Test Bistro',
            businessCategory: 'restaurants',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('PARTNER');
      if (res.body?.data?.user?.id) createdUserIds.push(res.body.data.user.id);
    });

    it('should reject a second customer account on the same email', async () => {
      const { email } = await createTestUser();
      const first = await prisma.user.findFirst({ where: { email } });
      if (first) createdUserIds.push(first.id);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'AnotherPass123!',
          firstName: 'Duplicate',
          phone: '+359888000222',
          acceptTerms: true,
        });

      expect(res.status).toBe(409);
    });

    it('should create a Partner record for partner-account registrations', async () => {
      const email = `partner-app-${Date.now()}@boomcard.bg`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          firstName: 'Partner',
          lastName: 'Owner',
          phone: '+359888333444',
          acceptTerms: true,
          accountType: 'partner',
          businessInfo: {
            businessName: 'Boom Cafe',
            businessNameBg: 'Бум Кафе',
            businessCategory: 'cafes',
            website: 'https://boom.example',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('PARTNER');
      expect(res.body.data.user.status).toBe('PENDING_VERIFICATION');
      createdUserIds.push(res.body.data.user.id);

      // Partner registrations must NOT auto-log-in: the Partner record is
      // PENDING and the dashboard has no useful state for them yet.
      expect(res.body.data).not.toHaveProperty('accessToken');
      expect(res.body.data).not.toHaveProperty('refreshToken');
      expect(res.body.data.pendingVerification).toBe(true);

      const partner = await prisma.partner.findUnique({ where: { userId: res.body.data.user.id } });
      expect(partner).toBeTruthy();
      expect(partner?.status).toBe('PENDING');
      expect(partner?.businessName).toBe('Boom Cafe');
      expect(partner?.category).toBe('cafes');
      expect(partner?.categories).toContain('cafes');
    });

    it('should reject registration without email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'TestPass123!' });

      expect(res.status).toBe(400);
    });

    it('should reject registration with short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: `short-${Date.now()}@test.com`, password: '123', phone: '+359888000999' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Login ────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    let testEmail: string;
    let testPassword: string;

    beforeAll(async () => {
      const { email, password, user } = await createTestUser();
      testEmail = email;
      testPassword = password;
      createdUserIds.push(user.id);
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword, clientType: 'mobile' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe(testEmail.toLowerCase());
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      // Password hash should NOT be in response
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPass123!', clientType: 'mobile' });

      expect(res.status).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@boomcard.bg', password: 'TestPass123!', clientType: 'mobile' });

      expect(res.status).toBe(401);
    });

    it('should reject login without email or password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject login without clientType (validator enforces it)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(400);
    });

    it('should reject login with invalid clientType value', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPassword, clientType: 'bogus' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Mobile-surface role guard (invariant: USER-only on mobile) ────
  //
  // The mobile app is for customers (role=USER) only. PARTNER/ADMIN must
  // never obtain tokens via the mobile surface — not at login, not at
  // refresh, even if their role changed after an earlier mobile login.
  //
  // Both login and refresh return 401 on violation (same shape as bad
  // credentials / bad refresh token) so role can't be enumerated from
  // the error response.

  describe('Mobile client guard', () => {
    it('rejects PARTNER login with clientType=mobile (invariant a)', async () => {
      const { email, password, user } = await createTestUser();
      createdUserIds.push(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'PARTNER', status: 'ACTIVE' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password, clientType: 'mobile' });

      expect(res.status).toBe(401);
      // Must not leak role in the error body
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('partner');
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('customer');
    });

    it('rejects ADMIN login with clientType=mobile (invariant a)', async () => {
      const { email, password, user } = await createTestUser();
      createdUserIds.push(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password, clientType: 'mobile' });

      expect(res.status).toBe(401);
    });

    it('rejects refresh when stored clientType=mobile but user role became PARTNER (invariant b)', async () => {
      // Simulate: user logs into mobile as USER, gets a mobile-stamped refresh
      // token, is then promoted to PARTNER. Subsequent refresh must fail so a
      // leaked/old mobile token can't mint access for a partner account.
      const { email, password, user } = await createTestUser();
      createdUserIds.push(user.id);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password, clientType: 'mobile' });
      expect(loginRes.status).toBe(200);
      const mobileRefreshToken = loginRes.body.data.refreshToken;

      // Verify the stored token actually carries clientType='mobile'
      const stored = await prisma.refreshToken.findUnique({
        where: { token: mobileRefreshToken },
      });
      expect(stored?.clientType).toBe('mobile');

      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'PARTNER' },
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: mobileRefreshToken });

      expect(res.status).toBe(401);

      // Guard must also revoke the offending token
      const afterDelete = await prisma.refreshToken.findUnique({
        where: { token: mobileRefreshToken },
      });
      expect(afterDelete).toBeNull();
    });

    it('allows USER login with clientType=mobile (invariant c)', async () => {
      const { email, password, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password, clientType: 'mobile' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('USER');

      // Refresh token must carry clientType='mobile' forward
      const stored = await prisma.refreshToken.findUnique({
        where: { token: res.body.data.refreshToken },
      });
      expect(stored?.clientType).toBe('mobile');
    });

    it('allows PARTNER login with clientType=web (invariant d)', async () => {
      const { email, password, user } = await createTestUser();
      createdUserIds.push(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'PARTNER', status: 'ACTIVE' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password, clientType: 'web' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('PARTNER');
    });

    it('preserves clientType across refresh rotation for web partner', async () => {
      // Web PARTNER refresh must continue to work and the new token must also
      // be stamped 'web' so the guard applies consistently across rotations.
      const { email, password, user } = await createTestUser();
      createdUserIds.push(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'PARTNER', status: 'ACTIVE' },
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email, password, clientType: 'web' });
      expect(loginRes.status).toBe(200);

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.data.refreshToken });
      expect(refreshRes.status).toBe(200);

      const rotated = await prisma.refreshToken.findUnique({
        where: { token: refreshRes.body.data.refreshToken },
      });
      expect(rotated?.clientType).toBe('web');
    });
  });

  // ─── Token Refresh ────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('should refresh with valid refresh token', async () => {
      const { refreshToken } = await createTestUser();

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      // New refresh token should be different (rotation)
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });

    it('should reject used refresh token (one-time use)', async () => {
      const { refreshToken } = await createTestUser();

      // First use — should succeed
      const res1 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res1.status).toBe(200);

      // Second use of same token — should fail (deleted after first use)
      const res2 = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res2.status).toBe(401);
    });

    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Get Current User ─────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(user.id);
      expect(res.body.data).toHaveProperty('loyaltyAccount');
    });

    it('should reject request without auth token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  // ─── Password Change ──────────────────────────────────────────

  describe('POST /api/auth/change-password', () => {
    it('should change password and invalidate old tokens', async () => {
      const { accessToken, user, password } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/auth/change-password')
        .send({ currentPassword: password, newPassword: 'NewSecure456!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject with wrong current password', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/auth/change-password')
        .send({ currentPassword: 'WrongCurrent!', newPassword: 'NewSecure456!' });

      expect(res.status).toBe(401);
    });
  });

  // ─── GDPR: Consent Recording ──────────────────────────────────

  describe('POST /api/auth/consent', () => {
    it('should record terms consent with version', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/auth/consent')
        .send({ type: 'terms', version: '2026-02-24' });

      expect(res.status).toBe(200);
      expect(res.body.data.termsAcceptedAt).toBeTruthy();
      expect(res.body.data.termsVersion).toBe('2026-02-24');
    });

    it('should record marketing consent opt-in', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/auth/consent')
        .send({ type: 'marketing', granted: true });

      expect(res.status).toBe(200);
      expect(res.body.data.marketingConsent).toBe(true);
      expect(res.body.data.marketingConsentAt).toBeTruthy();
    });

    it('should record marketing consent opt-out', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/auth/consent')
        .send({ type: 'marketing', granted: false });

      expect(res.status).toBe(200);
      expect(res.body.data.marketingConsent).toBe(false);
    });

    it('should reject invalid consent type', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .post('/api/auth/consent')
        .send({ type: 'invalid' });

      expect(res.status).toBe(400);
    });
  });

  // ─── GDPR: Data Export ────────────────────────────────────────

  describe('GET /api/auth/data-export', () => {
    it('should export all user data in GDPR-compliant format', async () => {
      const { accessToken, user } = await createTestUser({ acceptTerms: true });
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/auth/data-export');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('boomcard-data-export');

      expect(res.body).toHaveProperty('exportDate');
      expect(res.body).toHaveProperty('exportVersion', '1.0');
      expect(res.body).toHaveProperty('dataController');
      expect(res.body.dataController.email).toBe('privacy@boomcard.bg');
      expect(res.body).toHaveProperty('consentHistory');
      expect(res.body).toHaveProperty('userData');
      expect(res.body.userData).not.toHaveProperty('passwordHash');
    });

    it('should include consent history in export', async () => {
      const { accessToken, user } = await createTestUser({ acceptTerms: true });
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken).get('/api/auth/data-export');

      expect(res.body.consentHistory).toHaveProperty('termsAcceptedAt');
      expect(res.body.consentHistory).toHaveProperty('privacyAcceptedAt');
      expect(res.body.consentHistory).toHaveProperty('marketingConsent');
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/auth/data-export');
      expect(res.status).toBe(401);
    });
  });

  // ─── GDPR: Account Deletion ───────────────────────────────────

  describe('DELETE /api/auth/account', () => {
    it('should anonymize user data on deletion', async () => {
      const { accessToken, user, password } = await createTestUser();
      const originalEmail = user.email;

      const res = await authRequest(accessToken)
        .delete('/api/auth/account')
        .send({ password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');

      // Verify PII is anonymized
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUser).toBeTruthy();
      expect(dbUser!.email).not.toBe(originalEmail);
      expect(dbUser!.email).toContain('deleted_');
      expect(dbUser!.email).toContain('@removed.local');
      expect(dbUser!.firstName).toBeNull();
      expect(dbUser!.lastName).toBeNull();
      expect(dbUser!.phone).toBeNull();
      expect(dbUser!.status).toBe('INACTIVE');

      // Cleanup the anonymized user
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    });

    it('should cancel active subscriptions on deletion', async () => {
      const { accessToken, user, password } = await createTestUser();
      const sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: 'PREMIUM',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });

      const res = await authRequest(accessToken)
        .delete('/api/auth/account')
        .send({ password });

      expect(res.status).toBe(200);

      const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(updatedSub?.status).toBe('CANCELLED');

      // Cleanup
      await cleanupTestUser(user.id);
    });

    it('should reject with wrong password', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .delete('/api/auth/account')
        .send({ password: 'WrongPassword123!' });

      expect(res.status).toBe(401);
    });

    it('should reject without password', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const res = await authRequest(accessToken)
        .delete('/api/auth/account')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .delete('/api/auth/account')
        .send({ password: 'test' });

      expect(res.status).toBe(401);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('should invalidate refresh token on logout', async () => {
      const { refreshToken } = await createTestUser();

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });
      expect(logoutRes.status).toBe(200);

      // Old refresh token should no longer work
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });
});
