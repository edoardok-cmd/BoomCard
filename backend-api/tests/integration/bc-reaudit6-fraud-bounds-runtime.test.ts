/**
 * Runtime tests for fraud-bounds SA-only change
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

const RUN_TAG = `fraud-bounds-${Date.now()}`;

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN', permissions: string[] = []): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set');
  }
  return jwt.sign(
    { id: userId, email: `${RUN_TAG}-${userId}@test.local`, role, permissions },
    jwtSecret,
    { expiresIn: '15m' },
  );
}

describe('BC-ADMIN-SPEC-REAUDIT6 — Fraud-bounds SA-only enforcement', () => {
  let app: any;
  let adminId: string;
  let superAdminId: string;
  let adminToken: string;
  let superAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create test ADMIN user
    const admin = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-admin@boomcard.bg`,
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        passwordHash: 'unused',
        emailVerified: true,
        phone: '+359000000000',
      },
    });
    adminId = admin.id;
    adminToken = generateTestToken(adminId, 'ADMIN', ['control.rules.write']);

    // Create test SUPER_ADMIN user
    const superAdmin = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-superadmin@boomcard.bg`,
        firstName: 'Test',
        lastName: 'SuperAdmin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        passwordHash: 'unused',
        emailVerified: true,
        phone: '+359000000001',
      },
    });
    superAdminId = superAdmin.id;
    superAdminToken = generateTestToken(superAdminId, 'SUPER_ADMIN', []);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.fraudRule.deleteMany({
      where: {
        createdBy: { in: [adminId, superAdminId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [{ id: adminId }, { id: superAdminId }],
      },
    });
  });

  describe('POST /api/admin/settings/fraud-rules', () => {
    it('ADMIN with out-of-bounds dailyScanLimit → 422', async () => {
      const res = await request(app)
        .post('/api/admin/settings/fraud-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tier: 'SYSTEM',
          dailyScanLimit: 999, // max is 500
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/outside the permitted bounds/i);
    });

    it('ADMIN within bounds → 201', async () => {
      const res = await request(app)
        .post('/api/admin/settings/fraud-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tier: 'SYSTEM',
          dailyScanLimit: 300,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dailyScanLimit).toBe(300);
    });

    it('SUPER_ADMIN exceeding bounds → 201 allowed', async () => {
      const res = await request(app)
        .post('/api/admin/settings/fraud-rules')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          tier: 'SYSTEM',
          dailyScanLimit: 999,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dailyScanLimit).toBe(999);
    });
  });

  describe('PATCH /api/admin/settings/fraud-rules/:id', () => {
    let ruleId: string;

    beforeAll(async () => {
      const rule = await prisma.fraudRule.create({
        data: {
          tier: 'SYSTEM',
          dailyScanLimit: 100,
          createdBy: superAdminId,
        },
      });
      ruleId = rule.id;
    });

    it('ADMIN exceeding bounds on PATCH → 422', async () => {
      const res = await request(app)
        .patch(`/api/admin/settings/fraud-rules/${ruleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dailyScanLimit: 999,
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/outside the permitted bounds/i);
    });

    it('ADMIN within bounds on PATCH → 200', async () => {
      const res = await request(app)
        .patch(`/api/admin/settings/fraud-rules/${ruleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dailyScanLimit: 250,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.dailyScanLimit).toBe(250);
    });

    it('SUPER_ADMIN exceeding bounds on PATCH → 200', async () => {
      const res = await request(app)
        .patch(`/api/admin/settings/fraud-rules/${ruleId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          dailyScanLimit: 999,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.dailyScanLimit).toBe(999);
    });
  });
});
