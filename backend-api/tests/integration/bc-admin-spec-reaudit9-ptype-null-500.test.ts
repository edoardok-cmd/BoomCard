/**
 * BC-ADMIN-SPEC-REAUDIT9-PTYPE-NULL-500-1 Regression Test
 *
 * INV-PTYPE-009: PUT /api/admin/partner-types/:id/plan-access with a null
 * or non-object element in the rules array must return 400, not 500.
 *
 * Before the fix: `rule.plan` on a null element threw TypeError → HTTP 500.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { genTestPhone } from '../helpers/test-utils';

const TAG = `ptype-null500-${Date.now()}`;

let adminToken: string;
let partnerTypeId: string;

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

beforeAll(async () => {
  const email = `${TAG}@test.local`;
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('AdminPass123!', 12),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'PType',
      lastName: 'Tester',
      phone: genTestPhone(),
    },
  });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'AdminPass123!', clientType: 'web' });
  adminToken = loginRes.body.data?.accessToken ?? '';

  const createRes = await request(app)
    .post('/api/admin/partner-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `${TAG}-type`, maxDiscountRate: 10 });
  partnerTypeId = createRes.body.data?.id ?? '';
});

afterAll(async () => {
  await prisma.partnerType.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe('PUT /api/admin/partner-types/:id/plan-access — null/non-object rule guard', () => {
  it('returns 400 (not 500) when rules contains a null element', async () => {
    const res = await request(app)
      .put(`/api/admin/partner-types/${partnerTypeId}/plan-access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rules: [null] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when rules contains an undefined/primitive element', async () => {
    const res = await request(app)
      .put(`/api/admin/partner-types/${partnerTypeId}/plan-access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rules: ['BASIC'] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid plan string (non-null rule, bad plan)', async () => {
    const res = await request(app)
      .put(`/api/admin/partner-types/${partnerTypeId}/plan-access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rules: [{ plan: 'NOT_A_PLAN', canView: true, canRedeem: true }] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 with valid rules (all required fields present)', async () => {
    const res = await request(app)
      .put(`/api/admin/partner-types/${partnerTypeId}/plan-access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rules: [{ plan: 'BASIC', canView: true, canRedeem: true }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
