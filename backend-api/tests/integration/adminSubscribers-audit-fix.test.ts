/**
 * Integration Tests: BC-ADMIN-AUDIT-FIX-005
 *
 * Admin subscribers route defect fixes:
 *
 * DEFECT A (MEDIUM) — Invalid dateFrom/dateTo → HTTP 400 not 500
 *   A1. Malformed dateFrom returns 400
 *   A2. Malformed dateTo returns 400
 *   A3. Valid dateFrom/dateTo filter works
 *   A4. Export with malformed dates returns 400
 *
 * DEFECT B (MEDIUM) — ARCHIVED is terminal (not reversible)
 *   B1. ARCHIVED → ACTIVE returns 400
 *   B2. ARCHIVED → INACTIVE returns 400
 *   B3. ARCHIVED → ARCHIVED succeeds (no-op)
 *   B4. ACTIVE → ARCHIVED succeeds
 *
 * DEFECT C (LOW) — riskScore ceiling 120 (spec §2.1 additive max)
 *   C1. riskScore=121 returns 400
 *   C2. riskScore=120 succeeds
 *   C3. riskScore=0 succeeds
 *
 * DEFECT D (LOW) — ARCHIVED accounts block profile/IBAN edits
 *   D1. ARCHIVED user: firstName edit blocked
 *   D2. ARCHIVED user: IBAN edit blocked
 *   D3. ARCHIVED user: riskScore edit allowed (compliance workflows)
 *   D4. INACTIVE user: profile edit allowed
 */

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { cleanupTestUser } from '../helpers/test-utils';

const PASSWORD = 'TestPass123!';

interface TestFixtures {
  adminToken: string;
  superAdminToken: string;
  adminId: string;
  superAdminId: string;
  subscriberId: string;
  subscriberEmail: string;
}

async function createFixtures(): Promise<TestFixtures> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const hash = await bcrypt.hash(PASSWORD, 10);

  const superAdmin = await prisma.user.create({
    data: {
      email: `sa-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const subscriber = await prisma.user.create({
    data: {
      email: `subscriber-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Subscriber',
      lastName: 'Test',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      riskScore: 25,
      riskBucket: 'MEDIUM_21_50',
    },
  });

  const saRes = await request(app)
    .post('/api/auth/login')
    .send({ email: superAdmin.email, password: PASSWORD, clientType: 'web' });
  if (saRes.status !== 200) {
    throw new Error(`SUPER_ADMIN login failed: ${saRes.status}`);
  }

  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ email: admin.email, password: PASSWORD, clientType: 'web' });
  if (adminRes.status !== 200) {
    throw new Error(`ADMIN login failed: ${adminRes.status}`);
  }

  return {
    superAdminToken: saRes.body.data.accessToken,
    superAdminId: superAdmin.id,
    adminToken: adminRes.body.data.accessToken,
    adminId: admin.id,
    subscriberId: subscriber.id,
    subscriberEmail: subscriber.email!,
  };
}

describe('BC-ADMIN-AUDIT-FIX-005: adminSubscribers route defect fixes', () => {
  let fixtures: TestFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  });

  afterAll(async () => {
    await cleanupTestUser(fixtures.superAdminId);
    await cleanupTestUser(fixtures.adminId);
    await cleanupTestUser(fixtures.subscriberId);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT A: Invalid dateFrom/dateTo → 400 not 500
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT A: Date validation on GET /subscribers and /export', () => {
    it('A1 — Malformed dateFrom returns 400', async () => {
      const res = await request(app)
        .get('/api/admin/subscribers?dateFrom=invalid-date')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dateFrom.*valid date/i);
    });

    it('A2 — Malformed dateTo returns 400', async () => {
      const res = await request(app)
        .get('/api/admin/subscribers?dateTo=not-a-date')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dateTo.*valid date/i);
    });

    it('A3 — Valid dateFrom/dateTo filter works', async () => {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
      const dateTo = new Date();

      const res = await request(app)
        .get(
          `/api/admin/subscribers?dateFrom=${dateFrom.toISOString()}&dateTo=${dateTo.toISOString()}`,
        )
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.subscribers).toBeDefined();
      expect(Array.isArray(res.body.subscribers)).toBe(true);
    });

    it('A4 — Export with malformed dateFrom returns 400', async () => {
      const res = await request(app)
        .get('/api/admin/subscribers/export?dateFrom=bad-date')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dateFrom.*valid date/i);
    });

    it('A5 — Export with malformed dateTo returns 400', async () => {
      const res = await request(app)
        .get('/api/admin/subscribers/export?dateTo=nope')
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dateTo.*valid date/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT B: ARCHIVED is terminal
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT B: ARCHIVED account status is terminal', () => {
    let archivedSubscriberId: string;

    beforeAll(async () => {
      // Create a fresh subscriber to archive
      const hash = await bcrypt.hash(PASSWORD, 10);
      const archived = await prisma.user.create({
        data: {
          email: `archived-${Date.now()}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Archive',
          lastName: 'Test',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });
      archivedSubscriberId = archived.id;

      // Archive the user
      await request(app)
        .patch(`/api/admin/subscribers/${archivedSubscriberId}/status`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ status: 'ARCHIVED' });
    });

    afterAll(async () => {
      await cleanupTestUser(archivedSubscriberId);
    });

    it('B1 — ARCHIVED → ACTIVE returns 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedSubscriberId}/status`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ status: 'ACTIVE' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });

    it('B2 — ARCHIVED → INACTIVE returns 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedSubscriberId}/status`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ status: 'INACTIVE' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });

    it('B3 — ARCHIVED → ARCHIVED succeeds (no-op)', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedSubscriberId}/status`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ status: 'ARCHIVED' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ARCHIVED');
    });
  });

  it('B4 — ACTIVE → ARCHIVED succeeds', async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const toArchive = await prisma.user.create({
      data: {
        email: `to-archive-${Date.now()}@boomcard.bg`,
        passwordHash: hash,
        firstName: 'ToArchive',
        lastName: 'Test',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const res = await request(app)
      .patch(`/api/admin/subscribers/${toArchive.id}/status`)
      .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
      .send({ status: 'ARCHIVED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ARCHIVED');

    await cleanupTestUser(toArchive.id);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT C: riskScore ceiling is 120 (spec §2.1 additive max: 40+30+20+20+10)
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT C: riskScore validation (ceiling 120)', () => {
    it('C1 — riskScore=121 returns 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${fixtures.subscriberId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ riskScore: 121 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/between 0 and 120/i);
    });

    it('C2 — riskScore=120 succeeds', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${fixtures.subscriberId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ riskScore: 120 });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.riskScore).toBe(120);
    });

    it('C3 — riskScore=0 succeeds', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${fixtures.subscriberId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ riskScore: 0 });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.riskScore).toBe(0);
    });

    it('C4 — riskScore=-1 returns 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${fixtures.subscriberId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ riskScore: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/between 0 and 120/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT D: ARCHIVED blocks profile/IBAN edits
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT D: ARCHIVED account profile/IBAN edits blocked', () => {
    let archivedId: string;
    let inactiveId: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash(PASSWORD, 10);
      const archived = await prisma.user.create({
        data: {
          email: `archived-profile-${Date.now()}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Archived',
          lastName: 'Profile',
          role: 'USER',
          status: 'ARCHIVED',
          emailVerified: true,
          iban: 'BG80BNBG96611020345672',
        },
      });
      archivedId = archived.id;

      const inactive = await prisma.user.create({
        data: {
          email: `inactive-profile-${Date.now()}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Inactive',
          lastName: 'Profile',
          role: 'USER',
          status: 'INACTIVE',
          emailVerified: true,
        },
      });
      inactiveId = inactive.id;
    });

    afterAll(async () => {
      await cleanupTestUser(archivedId);
      await cleanupTestUser(inactiveId);
    });

    it('D1 — ARCHIVED user: firstName edit blocked', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ firstName: 'UpdatedName' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });

    it('D2 — ARCHIVED user: IBAN edit blocked', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ iban: 'BG80BNBG96611020345673' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });

    it('D3 — ARCHIVED user: phone edit blocked (any profile field)', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ phone: '+1234567890' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });

    it('D4 — ARCHIVED user: riskScore edit allowed (compliance)', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ riskScore: 50 });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.riskScore).toBe(50);
    });

    it('D5 — INACTIVE user: profile edit allowed', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${inactiveId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ firstName: 'AllowedUpdate' });
      expect(res.status).toBe(200);
      expect(res.body.subscriber.firstName).toBe('AllowedUpdate');
    });

    it('D6 — ARCHIVED user: address edit blocked', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ address: '123 New Street' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });

    it('D7 — ARCHIVED user: email edit blocked', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedId}/profile`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ email: 'new-email@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/archived.*terminal/i);
    });
  });
});
