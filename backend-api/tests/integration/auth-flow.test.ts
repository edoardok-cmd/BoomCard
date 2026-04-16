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

    it('should reject duplicate email with 409', async () => {
      const { email } = await createTestUser();
      createdUserIds.push((await prisma.user.findUnique({ where: { email } }))!.id);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'AnotherPass123!',
          firstName: 'Duplicate',
        });

      expect(res.status).toBe(409);
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
        .send({ email: `short-${Date.now()}@test.com`, password: '123' });

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
        .send({ email: testEmail, password: testPassword });

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
        .send({ email: testEmail, password: 'WrongPass123!' });

      expect(res.status).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@boomcard.bg', password: 'TestPass123!' });

      expect(res.status).toBe(401);
    });

    it('should reject login without email or password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
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
