/**
 * BC-QA-035 Integration Tests
 *
 * POST /api/partners/onboard (admin partner-onboarding) used to pass
 * `phone: phone || null` straight into `tx.user.create()`. `User.phone` is a
 * NOT NULL column with no `@default` in prisma/schema.prisma, so an admin
 * submitting the onboarding form without a phone number produced an
 * unhandled Prisma NOT-NULL-violation (500) instead of a clean validation
 * error.
 *
 * The fix enforces phone as required (and format-validated, same
 * PHONE_REGEX as auth.validator.ts's registerValidation) at the route layer,
 * mirroring the admin onboarding form's own client-side required-field rule
 * (AdminPartnerOnboardingPage.tsx).
 *
 * Tests:
 * 1. Missing phone -> 400 (not 500), no orphan User/Partner rows created
 * 2. Malformed phone -> 400
 * 3. Valid phone -> 201/200, User.phone persisted correctly
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { UserStatus } from '@prisma/client';
import { genTestPhone } from '../helpers/test-utils';

interface TestContext {
  adminUser: any;
  adminToken: string;
}

const ctx: TestContext = {
  adminUser: null,
  adminToken: '',
};

const createdUserIds: string[] = [];
const createdPartnerIds: string[] = [];

beforeAll(async () => {
  const adminEmail = `bc-qa-035-admin-${Date.now()}@boomcard.bg`;
  const adminPasswordHash = await bcrypt.hash('AdminPass123!', 12);

  ctx.adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: UserStatus.ACTIVE,
      emailVerified: true,
      firstName: 'BCQA035',
      lastName: 'Admin',
      phone: genTestPhone(),
    },
  });
  createdUserIds.push(ctx.adminUser.id);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: 'AdminPass123!', clientType: 'web' });

  ctx.adminToken = loginRes.body.data.accessToken;
});

afterAll(async () => {
  if (createdPartnerIds.length > 0) {
    await prisma.partner.deleteMany({ where: { id: { in: createdPartnerIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

describe('BC-QA-035: POST /api/partners/onboard phone required', () => {
  it('rejects onboarding with a missing phone as 400, not a 500 NOT-NULL crash', async () => {
    const email = `bc-qa-035-nophone-${Date.now()}@boomcard.bg`;

    const res = await request(app)
      .post('/api/partners/onboard')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        email,
        businessName: 'BC-QA-035 No Phone Business',
        category: 'restaurants',
        address: '1 Test Str',
        city: 'Sofia',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.error)).toMatch(/phone/i);

    // No orphan rows should have been persisted.
    const orphanUser = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    expect(orphanUser).toBeNull();
  });

  it('rejects onboarding with a malformed phone as 400', async () => {
    const email = `bc-qa-035-badphone-${Date.now()}@boomcard.bg`;

    const res = await request(app)
      .post('/api/partners/onboard')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        email,
        businessName: 'BC-QA-035 Bad Phone Business',
        category: 'restaurants',
        address: '1 Test Str',
        city: 'Sofia',
        phone: 'not-a-phone',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.error)).toMatch(/phone/i);

    const orphanUser = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    expect(orphanUser).toBeNull();
  });

  it('onboards successfully with a valid phone and persists User.phone', async () => {
    const email = `bc-qa-035-goodphone-${Date.now()}@boomcard.bg`;
    const phone = genTestPhone();

    const res = await request(app)
      .post('/api/partners/onboard')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        email,
        businessName: 'BC-QA-035 Good Phone Business',
        category: 'restaurants',
        address: '1 Test Str',
        city: 'Sofia',
        latitude: 42.6977,
        longitude: 23.3219,
        phone,
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);

    const createdUser = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    expect(createdUser).not.toBeNull();
    expect(createdUser!.phone).toBe(phone);
    createdUserIds.push(createdUser!.id);

    const createdPartner = await prisma.partner.findFirst({ where: { userId: createdUser!.id } });
    expect(createdPartner).not.toBeNull();
    createdPartnerIds.push(createdPartner!.id);
  });
});
