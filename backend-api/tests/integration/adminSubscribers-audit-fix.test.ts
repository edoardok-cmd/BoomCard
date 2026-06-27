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
 *
 * DEFECT E (LOW) — DELETED status bypass (permission tier enforcement)
 *   E1. DELETED account cannot be revived via /status endpoint (400)
 *   E2. DELETED account with deletedAt=null cannot be patched to ACTIVE via /status
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
      phone: `+1000${suffix.replace(/[^0-9]/g, '').slice(0, 7)}`,
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
      phone: `+2000${suffix.replace(/[^0-9]/g, '').slice(0, 7)}`,
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
      phone: `+3000${suffix.replace(/[^0-9]/g, '').slice(0, 7)}`,
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
          phone: `+4${Date.now().toString().slice(-10)}`,
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
        phone: `+5${Date.now().toString().slice(-10)}`,
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
          phone: `+6${Date.now().toString().slice(-10)}`,
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
          phone: `+7${Date.now().toString().slice(-10)}`,
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

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT E: DELETED status bypass — permission tier enforcement
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT E: DELETED status bypass (permission tier enforcement)', () => {
    let deletedId: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash(PASSWORD, 10);
      const deleted = await prisma.user.create({
        data: {
          email: `deleted-${Date.now()}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Deleted',
          lastName: 'Test',
          role: 'USER',
          status: 'DELETED',
          emailVerified: true,
          deletedAt: null, // Soft-delete state: status=DELETED but deletedAt=null
          phone: `+8${Date.now().toString().slice(-10)}`,
        },
      });
      deletedId = deleted.id;
    });

    afterAll(async () => {
      await cleanupTestUser(deletedId);
    });

    it('E1 — DELETED account cannot be revived via /status endpoint (400)', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${deletedId}/status`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ status: 'ACTIVE' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/restore endpoint/i);
    });

    it('E2 — DELETED account cannot be patched to INACTIVE via /status endpoint either (400)', async () => {
      // The guard fires for any target status, not just ACTIVE.
      // DELETED → INACTIVE must also be redirected to /restore.
      const res = await request(app)
        .patch(`/api/admin/subscribers/${deletedId}/status`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
        .send({ status: 'INACTIVE' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/restore endpoint/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INV-INPUT-025 (BC-ADMIN-SPEC-REAUDIT9-SUBSCRIBER-NULL-WALLET-1):
  // Subscriber with no wallet row must not 500 the list or export routes.
  // ─────────────────────────────────────────────────────────────────────────

  describe('INV-INPUT-025: wallet-less subscriber does not 500 list or export', () => {
    let walletlessId: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash(PASSWORD, 10);
      const u = await prisma.user.create({
        data: {
          email: `no-wallet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'NoWallet',
          lastName: 'Subscriber',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          phone: `+9${Date.now().toString().slice(-10)}`,
        },
      });
      walletlessId = u.id;
    });

    afterAll(async () => {
      await cleanupTestUser(walletlessId);
    });

    it('INV-INPUT-025-LIST — GET /subscribers returns 200 and includes the wallet-less subscriber', async () => {
      const res = await request(app)
        .get(`/api/admin/subscribers?search=no-wallet`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.subscribers).toBeDefined();
      expect(Array.isArray(res.body.subscribers)).toBe(true);
      const row = (res.body.subscribers as Array<Record<string, unknown>>).find(
        (s: Record<string, unknown>) => s.id === walletlessId,
      );
      expect(row).toBeDefined();
      const wd = row!.walletDisplay as Record<string, {bgn: number; eur: number}>;
      expect((wd.availableBalance).bgn).toBe(0);
      expect((wd.availableBalance).eur).toBe(0);
      expect((wd.balance).bgn).toBe(0);
      expect((wd.balance).eur).toBe(0);
      expect((wd.pendingBalance).bgn).toBe(0);
      expect((wd.pendingBalance).eur).toBe(0);
    });

    it('INV-INPUT-025-EXPORT — GET /subscribers/export returns 200 and includes the wallet-less subscriber', async () => {
      const res = await request(app)
        .get(`/api/admin/subscribers/export?search=no-wallet`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.subscribers).toBeDefined();
      expect(Array.isArray(res.body.subscribers)).toBe(true);
      const row = (res.body.subscribers as Array<Record<string, unknown>>).find(
        (s: Record<string, unknown>) => s.id === walletlessId,
      );
      expect(row).toBeDefined();
      const wd = row!.walletDisplay as Record<string, {bgn: number; eur: number}>;
      expect((wd.availableBalance).bgn).toBe(0);
      expect((wd.availableBalance).eur).toBe(0);
      expect((wd.balance).bgn).toBe(0);
      expect((wd.balance).eur).toBe(0);
      expect((wd.pendingBalance).bgn).toBe(0);
      expect((wd.pendingBalance).eur).toBe(0);
    });

    it('INV-INPUT-025-ZERO — wallet-less subscriber row has zero balances in walletDisplay', async () => {
      const res = await request(app)
        .get(`/api/admin/subscribers?search=no-wallet`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(200);
      const row = (res.body.subscribers as Array<Record<string, unknown>>).find(
        (s: Record<string, unknown>) => s.id === walletlessId,
      );
      expect(row).toBeDefined();
      expect(row!.walletDisplay).toBeDefined();
      const wd = row!.walletDisplay as Record<string, {bgn: number; eur: number}>;
      expect((wd.availableBalance).bgn).toBe(0);
      expect((wd.availableBalance).eur).toBe(0);
      expect((wd.balance).bgn).toBe(0);
      expect((wd.balance).eur).toBe(0);
      expect((wd.pendingBalance).bgn).toBe(0);
      expect((wd.pendingBalance).eur).toBe(0);
    });

    it('INV-INPUT-025-DETAIL — GET /subscribers/:userId returns 200 (not 500) for a wallet-less subscriber', async () => {
      const res = await request(app)
        .get(`/api/admin/subscribers/${walletlessId}`)
        .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.walletDisplay).toBeDefined();
      const wd = res.body.walletDisplay as Record<string, {bgn: number; eur: number}>;
      expect((wd.availableBalance).bgn).toBe(0);
      expect((wd.availableBalance).eur).toBe(0);
      expect((wd.balance).bgn).toBe(0);
      expect((wd.balance).eur).toBe(0);
      expect((wd.pendingBalance).bgn).toBe(0);
      expect((wd.pendingBalance).eur).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT F: ARCHIVED terminality survives a DELETE → restore round-trip
  // (BC-ADMIN-SPEC-REAUDIT2-ARCHIVE-RESTORE-BYPASS-1)
  //
  // Spec §1.1 / §2.4: ARCHIVED is terminal — an archived user reactivates only via
  // password-reset + new subscription, never an admin flip back to Active. PATCH /status
  // enforces this directly (DEFECT B). The escape hatch closed here is the DELETE-then-
  // restore round-trip: previously DELETE overwrote status=DELETED without recording the
  // prior state and POST /restore unconditionally wrote ACTIVE, silently reviving a
  // terminal ARCHIVED user as ACTIVE. restore must now revive the EXACT pre-delete status.
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT F: ARCHIVED survives DELETE → restore (no silent revive to ACTIVE)', () => {
    async function makeSubscriber(label: string): Promise<string> {
      const hash = await bcrypt.hash(PASSWORD, 10);
      const u = await prisma.user.create({
        data: {
          email: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Round',
          lastName: 'Trip',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          phone: `+0${Date.now().toString().slice(-10)}`,
        },
      });
      return u.id;
    }

    it('F1 — ARCHIVED → DELETE → restore comes back ARCHIVED, NOT ACTIVE', async () => {
      const userId = await makeSubscriber('archive-roundtrip');
      try {
        // Archive via the real PATCH /status endpoint.
        const archiveRes = await request(app)
          .patch(`/api/admin/subscribers/${userId}/status`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
          .send({ status: 'ARCHIVED' });
        expect(archiveRes.status).toBe(200);
        expect(archiveRes.body.status).toBe('ARCHIVED');

        // Soft-delete.
        const delRes = await request(app)
          .delete(`/api/admin/subscribers/${userId}/account`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
          .send({ reason: 'audit-fix round-trip' });
        expect(delRes.status).toBe(200);
        expect(delRes.body.ok).toBe(true);

        // Restore — must NOT silently revive to ACTIVE.
        const restoreRes = await request(app)
          .post(`/api/admin/subscribers/${userId}/restore`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.status).toBe('ARCHIVED');
        expect(restoreRes.body.status).not.toBe('ACTIVE');

        // statusBeforeDelete is cleared back to NULL after restore.
        const after = await prisma.user.findUnique({
          where: { id: userId },
          select: { status: true, deletedAt: true, statusBeforeDelete: true },
        });
        expect(after?.status).toBe('ARCHIVED');
        expect(after?.deletedAt).toBeNull();
        expect(after?.statusBeforeDelete).toBeNull();
      } finally {
        await cleanupTestUser(userId);
      }
    });

    it('F2 — ACTIVE → DELETE → restore comes back ACTIVE (normal case preserved)', async () => {
      const userId = await makeSubscriber('active-roundtrip');
      try {
        const delRes = await request(app)
          .delete(`/api/admin/subscribers/${userId}/account`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
          .send({ reason: 'normal case' });
        expect(delRes.status).toBe(200);

        const restoreRes = await request(app)
          .post(`/api/admin/subscribers/${userId}/restore`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.status).toBe('ACTIVE');

        const after = await prisma.user.findUnique({
          where: { id: userId },
          select: { status: true, deletedAt: true, statusBeforeDelete: true },
        });
        expect(after?.status).toBe('ACTIVE');
        expect(after?.deletedAt).toBeNull();
        expect(after?.statusBeforeDelete).toBeNull();
      } finally {
        await cleanupTestUser(userId);
      }
    });

    it('F3 — INACTIVE → DELETE → restore comes back INACTIVE (exact prior state)', async () => {
      const userId = await makeSubscriber('inactive-roundtrip');
      try {
        const statusRes = await request(app)
          .patch(`/api/admin/subscribers/${userId}/status`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
          .send({ status: 'INACTIVE' });
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.status).toBe('INACTIVE');

        const delRes = await request(app)
          .delete(`/api/admin/subscribers/${userId}/account`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
          .send({});
        expect(delRes.status).toBe(200);

        const restoreRes = await request(app)
          .post(`/api/admin/subscribers/${userId}/restore`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.status).toBe('INACTIVE');
      } finally {
        await cleanupTestUser(userId);
      }
    });

    it('F4 — Legacy soft-deleted row (statusBeforeDelete NULL) restores to ACTIVE', async () => {
      // Simulate a row deleted BEFORE this fix: status=DELETED, deletedAt set,
      // statusBeforeDelete still NULL. restore must fall back to ACTIVE.
      const hash = await bcrypt.hash(PASSWORD, 10);
      const legacy = await prisma.user.create({
        data: {
          email: `legacy-deleted-${Date.now()}@boomcard.bg`,
          passwordHash: hash,
          firstName: 'Legacy',
          lastName: 'Deleted',
          role: 'USER',
          status: 'DELETED',
          emailVerified: true,
          deletedAt: new Date(),
          statusBeforeDelete: null,
          phone: `+1${Date.now().toString().slice(-10)}`,
        },
      });
      try {
        const restoreRes = await request(app)
          .post(`/api/admin/subscribers/${legacy.id}/restore`)
          .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.status).toBe('ACTIVE');
      } finally {
        await cleanupTestUser(legacy.id);
      }
    });
  });
});
