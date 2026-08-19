/**
 * Integration Tests: Authentication Flow
 *
 * Covers P0 critical path F01: Register → Verify Email → Login
 * Also covers GDPR endpoints: data export, account deletion, consent recording
 */

import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser, authRequest } from '../helpers/test-utils';
import { bgnToEur } from '../../src/utils/currency';
import { AuthService } from '../../src/services/auth.service';
import { genTestPhone } from '../helpers/test-utils';

describe('Authentication Flow (F01)', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
    // BC-QA-042's currency_transition_window_open restore hook was removed by
    // BC-QA-031: the 3 dual-currency data-export tests it protected are gone,
    // along with the SystemSetting row itself, so there is no global state left
    // for this file to leak into the next one in the batch.
  });

  // ─── Registration ─────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const email = `auth-test-${Date.now()}@boomcard.bg`;
      // BC-QA-036: was a hardcoded literal (`+359888000123`) that permanently
      // collided with a stale leftover row under the new
      // @@unique([phone, role]) constraint, causing a 409 on every run.
      // Use the same collision-resistant per-call pattern the rest of this
      // file's register tests already use (see the BC-QA-032 tests below).
      const phone = `+359888${Date.now().toString().slice(-6)}`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe',
          phone,
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
      // Terms and Privacy are two INDEPENDENT consents (spec §2.3,
      // AuthService.register) — each timestamp is gated on its own request
      // flag, not both driven by acceptTerms. createTestUser()
      // (tests/helpers/test-utils.ts) has no acceptPrivacy override and
      // never sends it, so privacyAcceptedAt was always null through that
      // helper — register directly here so both consents are actually
      // exercised (BC-QA-042).
      const email = `consent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'TestPass123!',
          firstName: 'Test',
          lastName: 'User',
          phone: genTestPhone(),
          acceptTerms: true,
          acceptPrivacy: true,
        });
      expect(res.status).toBe(201);
      const userId = res.body.data.user.id;
      createdUserIds.push(userId);

      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
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
      expect(card?.type).toBe('PREMIUM_WEEKLY');
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
          // lastName is required unconditionally by registerValidation
          // (auth.validator.ts) — the payload was still missing it even
          // after this round's other required-field fixes (BC-QA-042
          // review round 1, HIGH).
          lastName: 'Partner',
          phone: genTestPhone(),
          acceptTerms: true,
          // acceptPrivacy, businessInfo.participationLevel, and
          // businessInfo.{latitude,longitude} are all now required for
          // accountType:'partner' registrations (AuthService.register /
          // BC-PARTNER-FU1) — the test's payload predates those additions
          // and was 400ing before ever reaching the assertions under test
          // (BC-QA-042).
          acceptPrivacy: true,
          accountType: 'partner',
          businessInfo: {
            businessName: 'Test Bistro',
            businessCategory: 'restaurants',
            participationLevel: 'basic',
            latitude: 42.6977,
            longitude: 23.3219,
            address: '1 Vitosha Blvd',
            city: 'Sofia',
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
          // BC-QA-029: lastName is required by registerValidation (auth.validator.ts)
          // — without it the request 400s at the validator before ever reaching
          // AuthService.register, which was masking this test (pre-existing gap,
          // unrelated to this task's `code` additions).
          lastName: 'User',
          phone: genTestPhone(),
          acceptTerms: true,
        });

      expect(res.status).toBe(409);
      // BC-QA-029 — stable `code` alongside the unchanged raw `error` message so
      // partner-dashboard's BC-QA-004 error-code map can localize this. Follows
      // the existing AppError(message, status, { code }) convention (see the
      // TWO_FACTOR_REQUIRED code below), so it lands under `details.code`
      // *and*, since the round-1 review fix, at the top-level `code` field
      // that errorMessages.ts's getLocalizedErrorMessage() actually reads
      // (error.middleware.ts mirrors AppError.details.code to the top level).
      expect(res.body.error).toBe('An account with this email already exists');
      expect(res.body.details?.code).toBe('AUTH_EMAIL_ALREADY_REGISTERED');
      expect(res.body.code).toBe('AUTH_EMAIL_ALREADY_REGISTERED');
    });

    it('should reject a second customer account on the same phone number (BC-QA-032)', async () => {
      const phone = `+359888${Date.now().toString().slice(-6)}`;
      const first = await request(app)
        .post('/api/auth/register')
        .send({
          email: `phone-dup-a-${Date.now()}@boomcard.bg`,
          password: 'SecurePass123!',
          firstName: 'First',
          lastName: 'User',
          phone,
          acceptTerms: true,
        });
      expect(first.status).toBe(201);
      if (first.body?.data?.user?.id) createdUserIds.push(first.body.data.user.id);

      const second = await request(app)
        .post('/api/auth/register')
        .send({
          email: `phone-dup-b-${Date.now()}@boomcard.bg`,
          password: 'AnotherPass123!',
          firstName: 'Second',
          lastName: 'User',
          phone,
          acceptTerms: true,
        });

      // BC-QA-032 — mirrors the (email, role) uniqueness pattern above:
      // the DB enforces @@unique([phone, role]), and the service layer's
      // pre-check (auth.service.ts) surfaces it as a 409 with the stable
      // AUTH_PHONE_ALREADY_REGISTERED code the BC-QA-004 frontend mapping
      // table already expects, mirroring both the `details.code` and
      // top-level `code` shape of the email-duplicate error above.
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('An account with this phone number already exists');
      expect(second.body.details?.code).toBe('AUTH_PHONE_ALREADY_REGISTERED');
      expect(second.body.code).toBe('AUTH_PHONE_ALREADY_REGISTERED');
    });

    it('should allow the SAME phone number to register under a different role (BC-QA-032)', async () => {
      // Proves the constraint is the composite @@unique([phone, role]), not
      // a bare unique on phone: a USER and a PARTNER account may legally
      // share one phone number, same as they may share one email.
      const phone = `+359888${(Date.now() + 1).toString().slice(-6)}`;

      const userRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: `phone-role-user-${Date.now()}@boomcard.bg`,
          password: 'SecurePass123!',
          firstName: 'Role',
          lastName: 'User',
          phone,
          acceptTerms: true,
        });
      expect(userRes.status).toBe(201);
      if (userRes.body?.data?.user?.id) createdUserIds.push(userRes.body.data.user.id);

      const partnerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: `phone-role-partner-${Date.now()}@boomcard.bg`,
          firstName: 'Role',
          lastName: 'Partner',
          phone,
          acceptTerms: true,
          acceptPrivacy: true,
          accountType: 'partner',
          businessInfo: {
            businessName: 'Boom Cross-Role Bistro',
            businessCategory: 'restaurants',
            participationLevel: 'basic',
            latitude: 42.6977,
            longitude: 23.3219,
            address: '1 Vitosha Blvd',
            city: 'Sofia',
          },
        });
      expect(partnerRes.status).toBe(201);
      if (partnerRes.body?.data?.user?.id) createdUserIds.push(partnerRes.body.data.user.id);
    });

    it('should reject a second partner application on the same phone with AUTH_PHONE_ALREADY_REGISTERED (BC-QA-032)', async () => {
      const phone = `+359888${(Date.now() + 2).toString().slice(-6)}`;
      const partnerPayload = {
        firstName: 'Partner',
        lastName: 'PhoneDup',
        phone,
        acceptTerms: true,
        acceptPrivacy: true,
        accountType: 'partner' as const,
        businessInfo: {
          businessName: 'Boom Phone-Dup Bistro',
          businessCategory: 'restaurants',
          participationLevel: 'basic',
          latitude: 42.6977,
          longitude: 23.3219,
          address: '1 Vitosha Blvd',
          city: 'Sofia',
        },
      };

      const first = await request(app)
        .post('/api/auth/register')
        .send({ ...partnerPayload, email: `phone-partner-dup-a-${Date.now()}@boomcard.bg` });
      expect(first.status).toBe(201);
      if (first.body?.data?.user?.id) createdUserIds.push(first.body.data.user.id);

      const second = await request(app)
        .post('/api/auth/register')
        .send({ ...partnerPayload, email: `phone-partner-dup-b-${Date.now()}@boomcard.bg` });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('A partner account with this phone number already exists');
      expect(second.body.details?.code).toBe('AUTH_PHONE_ALREADY_REGISTERED');
    });

    it('should reject a second partner application on the same email with AUTH_PARTNER_ACCOUNT_EXISTS', async () => {
      const email = `partner-dup-${Date.now()}@boomcard.bg`;
      const partnerPayload = {
        email,
        firstName: 'Partner',
        lastName: 'Dup',
        phone: genTestPhone(),
        acceptTerms: true,
        acceptPrivacy: true,
        accountType: 'partner',
        businessInfo: {
          businessName: 'Boom Bistro',
          businessCategory: 'restaurants',
          participationLevel: 'basic',
          latitude: 42.6977,
          longitude: 23.3219,
          address: '1 Vitosha Blvd',
          city: 'Sofia',
        },
      };

      const first = await request(app).post('/api/auth/register').send(partnerPayload);
      expect(first.status).toBe(201);
      if (first.body?.data?.user?.id) createdUserIds.push(first.body.data.user.id);

      const second = await request(app).post('/api/auth/register').send(partnerPayload);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('A partner account with this email already exists');
      expect(second.body.details?.code).toBe('AUTH_PARTNER_ACCOUNT_EXISTS');
      // BC-QA-033 — also assert the top-level `code` mirror (error.middleware.ts)
      // that BC-QA-004's frontend getLocalizedErrorMessage() actually reads.
      expect(second.body.code).toBe('AUTH_PARTNER_ACCOUNT_EXISTS');
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
          phone: genTestPhone(),
          acceptTerms: true,
          // See the "share the email of an existing customer" test above
          // for why these fields are required (BC-QA-042).
          acceptPrivacy: true,
          accountType: 'partner',
          businessInfo: {
            businessName: 'Boom Cafe',
            businessNameBg: 'Бум Кафе',
            businessCategory: 'cafes',
            website: 'https://boom.example',
            participationLevel: 'basic',
            latitude: 42.6977,
            longitude: 23.3219,
            address: '1 Vitosha Blvd',
            city: 'Sofia',
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
        .send({ email: `short-${Date.now()}@test.com`, password: '123', phone: genTestPhone() });

      expect(res.status).toBe(400);
    });
  });

  // ─── Complete profile (anonymous checkout post-payment) ────────

  describe('POST /api/auth/complete-profile', () => {
    let completeProfilePlanId: string;

    beforeAll(async () => {
      const existingPlan = await prisma.plan.findFirst({ where: { planCode: 'BASIC' } });
      if (existingPlan) {
        completeProfilePlanId = existingPlan.id;
      } else {
        const plan = await prisma.plan.create({
          data: {
            planCode: 'BASIC',
            displayName: 'Test Complete Profile Plan',
            displayNameBg: 'Тестов план',
            isActive: true,
            hasWeeklyOption: true,
            hasMonthlyOption: true,
            hasYearlyOption: true,
            priceWeeklyEur: 399,
            priceMonthlyEur: 999,
            priceYearlyEur: 8999,
            cashbackRate: 0.05,
          },
        });
        completeProfilePlanId = plan.id;
      }
    });

    async function createPaidPendingSubscription(emailPrefix: string, emailOverride?: string) {
      const token = crypto.randomBytes(32).toString('hex');
      const pending = await prisma.pendingSubscription.create({
        data: {
          email: emailOverride || `${emailPrefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@boomcard.bg`,
          planId: completeProfilePlanId,
          billingPeriod: 'monthly',
          language: 'en',
          payseraOrderId: `TEST-ORDER-CP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          status: 'PAID',
          token,
          tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          paidAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return { token, pending };
    }

    it(
      'should allow two omitted-phone completions to both succeed with distinct placeholder phones (BC-QA-032 fix-pinning)',
      async () => {
        const { token: tokenA } = await createPaidPendingSubscription('complete-profile-a');
        const { token: tokenB } = await createPaidPendingSubscription('complete-profile-b');

        const resA = await request(app)
          .post('/api/auth/complete-profile')
          .send({ token: tokenA, password: 'SecurePass123!', firstName: 'Alpha', lastName: 'Omitted', lang: 'en' });
        expect(resA.status).toBe(201);
        const userAId = resA.body?.data?.user?.id;
        expect(userAId).toBeTruthy();
        if (userAId) createdUserIds.push(userAId);

        const resB = await request(app)
          .post('/api/auth/complete-profile')
          .send({ token: tokenB, password: 'SecurePass123!', firstName: 'Beta', lastName: 'Omitted', lang: 'en' });
        // The regression this guards against: a shared '' placeholder for both
        // omitted-phone users collides on the new @@unique([phone, role])
        // constraint and would return 409/500 here instead of 201.
        expect(resB.status).toBe(201);
        const userBId = resB.body?.data?.user?.id;
        expect(userBId).toBeTruthy();
        if (userBId) createdUserIds.push(userBId);

        const [userA, userB] = await Promise.all([
          prisma.user.findUnique({ where: { id: userAId }, select: { phone: true, role: true } }),
          prisma.user.findUnique({ where: { id: userBId }, select: { phone: true, role: true } }),
        ]);
        expect(userA?.role).toBe('USER');
        expect(userB?.role).toBe('USER');
        expect(userA?.phone).toBeTruthy();
        expect(userB?.phone).toBeTruthy();
        expect(userA?.phone).not.toBe(userB?.phone);
        expect(userA?.phone).toMatch(/^unset-/);
        expect(userB?.phone).toMatch(/^unset-/);
      },
    );

    it(
      'should reject completion with AUTH_COMPLETE_PROFILE_EMAIL_EXISTS when the email already has a USER account (BC-QA-033)',
      async () => {
        // Arrange: a full USER account already exists for this email...
        const { email: existingEmail, user: existingUser } = await createTestUser();
        createdUserIds.push(existingUser.id);

        // ...and a separately-paid PendingSubscription is completing with the
        // SAME email (e.g. the customer paid again, or a race with another
        // signup using the same address).
        const { token } = await createPaidPendingSubscription('complete-profile-dup', existingEmail);

        const res = await request(app)
          .post('/api/auth/complete-profile')
          .send({ token, password: 'SecurePass123!', firstName: 'Dup', lastName: 'Email', lang: 'en' });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        // BC-QA-029 renamed this from 'USER_ALREADY_EXISTS' to match BC-QA-004's
        // frontend error-code map key; BC-QA-033 adds the first regression test
        // for this HTTP-level code path (auth.routes.ts's complete-profile
        // transaction catch — see the `_userAlreadyExists` branch).
        expect(res.body.code).toBe('AUTH_COMPLETE_PROFILE_EMAIL_EXISTS');
        expect(res.body.message).toContain('already exists');
      },
    );
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
      // BC-QA-029 — same code for every "wrong credentials" branch (see the
      // non-existent-email case below), so error shape can't be used to
      // enumerate which part of the check failed.
      expect(res.body.details?.code).toBe('AUTH_INVALID_CREDENTIALS');
      // BC-QA-033 — also assert the top-level `code` mirror (error.middleware.ts)
      // that BC-QA-004's frontend getLocalizedErrorMessage() actually reads.
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@boomcard.bg', password: 'TestPass123!', clientType: 'mobile' });

      expect(res.status).toBe(401);
      expect(res.body.details?.code).toBe('AUTH_INVALID_CREDENTIALS');
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
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
      // AuthService.login 403s role:'PARTNER' logins with no matching
      // Partner row ("Partner account configuration is incomplete") — the
      // test only flipped the User.role, never created the Partner record,
      // so login itself was rejected before the mobile-client-guard code
      // under test ever ran (BC-QA-042).
      await prisma.partner.create({
        data: { userId: user.id, businessName: 'Mobile Guard Test Partner', category: 'Restaurant', status: 'ACTIVE', email, verifiedAt: new Date() },
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
      // See the "rejects PARTNER login with clientType=mobile" note above
      // (BC-QA-042) — a role:'PARTNER' User needs a matching Partner row.
      await prisma.partner.create({
        data: { userId: user.id, businessName: 'Mobile Guard Test Partner', category: 'Restaurant', status: 'ACTIVE', email, verifiedAt: new Date() },
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
      // See the "rejects PARTNER login with clientType=mobile" note above
      // (BC-QA-042) — a role:'PARTNER' User needs a matching Partner row.
      await prisma.partner.create({
        data: { userId: user.id, businessName: 'Mobile Guard Test Partner', category: 'Restaurant', status: 'ACTIVE', email, verifiedAt: new Date() },
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

  describe('POST /api/auth/reset-password — AUTH_PASSWORD_POLICY (BC-QA-033)', () => {
    it('rejects a weak newPassword with the top-level AUTH_PASSWORD_POLICY code', async () => {
      // The password-policy check runs before any OTP/email lookup (see
      // auth.routes.ts), so a syntactically-present but unverified
      // email/otp is enough to reach it — no DB fixture required.
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'nobody@boomcard.bg', otp: '123456', newPassword: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
      expect(res.body.message).toMatch(/password/i);
      expect(res.body.code).toBe('AUTH_PASSWORD_POLICY');
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

    it('receipts[].totalAmount is a plain numeric EUR-only scalar, converted from BGN storage', async () => {
      const { accessToken, user } = await createTestUser({ acceptTerms: true });
      createdUserIds.push(user.id);
      // totalAmount is stored BGN-denominated (BC-QA-031); the export must
      // return the converted EUR figure, not the raw BGN scalar — this is the
      // exact CRITICAL regression class the Step-4 review caught, so this
      // assertion is the mechanical guard against it recurring.
      const receipt = await prisma.receipt.create({
        data: { userId: user.id, totalAmount: 42.5, status: 'APPROVED' as any, cashbackAmount: 4.25 },
      });
      try {
        const res = await authRequest(accessToken).get('/api/auth/data-export');
        expect(res.status).toBe(200);
        const rec = (res.body.userData.receipts as any[]).find((r: any) => r.id === receipt.id);
        expect(rec).toBeDefined();
        expect(rec.totalAmount).toBe(bgnToEur(42.5));
        expect(rec.totalAmount).not.toBe(42.5);
      } finally {
        await prisma.receipt.delete({ where: { id: receipt.id } }).catch(() => {});
      }
    });

    it('receipts[].totalAmount is null when source is null', async () => {
      const { accessToken, user } = await createTestUser({ acceptTerms: true });
      createdUserIds.push(user.id);
      const receipt = await prisma.receipt.create({
        data: { userId: user.id, totalAmount: null, status: 'PENDING' as any, cashbackAmount: 0 },
      });
      try {
        const res = await authRequest(accessToken).get('/api/auth/data-export');
        expect(res.status).toBe(200);
        const rec = (res.body.userData.receipts as any[]).find((r: any) => r.id === receipt.id);
        expect(rec).toBeDefined();
        expect(rec.totalAmount).toBeNull();
      } finally {
        await prisma.receipt.delete({ where: { id: receipt.id } }).catch(() => {});
      }
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
      expect(dbUser!.status).toBe('DELETED');

      // Cleanup the anonymized user
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    });

    it('should cancel active subscriptions on deletion', async () => {
      const { accessToken, user, password } = await createTestUser();
      const sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          // SubscriptionPlan enum has no 'PREMIUM' value (only
          // PREMIUM_WEEKLY | BASIC | PREMIUM_MONTHLY) — BC-QA-042.
          plan: 'PREMIUM_MONTHLY',
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

  // ─── BC-QA-029: stable error codes ────────────────────────────
  //
  // AuthService.verifyEmail's AppError codes are asserted directly against
  // the service (statusCode/details.code shape) AND, separately, against the
  // real POST /api/auth/verify-email HTTP response below — that route catches
  // the AppError itself and rebuilds the JSON by hand (see auth.routes.ts), so
  // it needs its own assertion that it forwards `code` rather than relying on
  // error.middleware.ts (which this route bypasses entirely). The GET route
  // is a redirect with no JSON body and cannot carry a `code` at all (see the
  // comment at its catch block in auth.routes.ts) — not covered here.
  describe('AuthService.verifyEmail error codes', () => {
    it('throws AUTH_REGISTRATION_TOKEN_INVALID for a token matching no user', async () => {
      await expect(AuthService.verifyEmail('not-a-real-token')).rejects.toMatchObject({
        statusCode: 400,
        details: { code: 'AUTH_REGISTRATION_TOKEN_INVALID' },
      });
    });

    it('throws AUTH_REGISTRATION_TOKEN_EXPIRED for an expired token', async () => {
      const email = `verify-expired-${Date.now()}@boomcard.bg`;
      const token = `expired-token-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          firstName: 'Verify',
          lastName: 'Expired',
          phone: `+35988${Date.now().toString().slice(-7)}`,
          role: 'PARTNER',
          status: 'PENDING_VERIFICATION',
          emailVerified: false,
          emailVerificationToken: token,
          emailVerificationExpiry: new Date(Date.now() - 60 * 1000),
        },
        select: { id: true },
      });
      createdUserIds.push(user.id);

      await expect(AuthService.verifyEmail(token)).rejects.toMatchObject({
        statusCode: 400,
        details: { code: 'AUTH_REGISTRATION_TOKEN_EXPIRED' },
      });
    });
  });

  describe('POST /api/auth/verify-email — forwards `code` in the real HTTP response', () => {
    it('returns AUTH_REGISTRATION_TOKEN_INVALID in the JSON body for an unknown token', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'not-a-real-token' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      // This route catches AuthService.verifyEmail's AppError locally and
      // rebuilds the JSON body by hand (it never reaches error.middleware.ts),
      // so this is a regression test for the round-1 review fix that made the
      // catch block forward err.details.code explicitly.
      expect(res.body.code).toBe('AUTH_REGISTRATION_TOKEN_INVALID');
    });

    it('returns AUTH_REGISTRATION_TOKEN_EXPIRED in the JSON body for an expired token', async () => {
      const email = `verify-expired-http-${Date.now()}@boomcard.bg`;
      const token = `expired-token-http-${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'x',
          firstName: 'Verify',
          lastName: 'ExpiredHttp',
          phone: `+35989${Date.now().toString().slice(-7)}`,
          role: 'PARTNER',
          status: 'PENDING_VERIFICATION',
          emailVerified: false,
          emailVerificationToken: token,
          emailVerificationExpiry: new Date(Date.now() - 60 * 1000),
        },
        select: { id: true },
      });
      createdUserIds.push(user.id);

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('AUTH_REGISTRATION_TOKEN_EXPIRED');
    });
  });

  describe('POST /api/auth/change-email/request — AUTH_TOO_MANY_ATTEMPTS', () => {
    it('rejects a second request within the 5-minute cooldown', async () => {
      const { accessToken, user } = await createTestUser();
      createdUserIds.push(user.id);

      const first = await authRequest(accessToken)
        .post('/api/auth/change-email/request')
        .send({ newEmail: `changed-${Date.now()}@boomcard.bg` });
      expect(first.status).toBe(200);

      const second = await authRequest(accessToken)
        .post('/api/auth/change-email/request')
        .send({ newEmail: `changed-again-${Date.now()}@boomcard.bg` });

      expect(second.status).toBe(429);
      expect(second.body.error).toBe('Please wait 5 minutes before requesting another code');
      expect(second.body.details?.code).toBe('AUTH_TOO_MANY_ATTEMPTS');
      // BC-QA-033 — also assert the top-level `code` mirror (error.middleware.ts)
      // that BC-QA-004's frontend getLocalizedErrorMessage() actually reads.
      expect(second.body.code).toBe('AUTH_TOO_MANY_ATTEMPTS');
    });
  });
});
