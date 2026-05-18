/**
 * Integration Tests: §7 Admin Route Auth Gates + Dispute-Cases PATCH Behaviour
 *
 * Covers gaps identified in the §7 audit:
 *
 *   Fraud Rules (§7.4)
 *   A. ADMIN (non-super) gets 403 on every FraudRule mutation route
 *      (POST /fraud-rules, PATCH /fraud-rules/:id, DELETE /fraud-rules/:id,
 *       POST /fraud-rules/:id/overrides, DELETE /fraud-rules/:id/overrides/:overId)
 *   B. ADMIN gets 403 on GET /fraud-rules/:id/overrides (new gate from audit fix)
 *   C. SUPER_ADMIN can read and mutate fraud rules + overrides
 *
 *   Dispute Cases PATCH (§7.3)
 *   D. OPEN→IN_REVIEW writes an AuditLog row with action='dispute.in-review'
 *   E. IN_REVIEW→RESOLVED without any decision returns 400
 *   F. IN_REVIEW→RESOLVED with decision in body succeeds
 *   G. IN_REVIEW→RESOLVED with prior-stored decision (no decision field in body) succeeds
 *   H. decision=null and decision="" are rejected when resolving
 *   I. non-RESOLVED transition with decision="" clears a previously-stored decision
 */

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { cleanupTestUser } from '../helpers/test-utils';

// ─── wait helper ────────────────────────────────────────────────────────────

function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PASSWORD = 'AdminPass999!';

interface AdminFixtures {
  superAdminId: string;
  superAdminToken: string;
  plainAdminId: string;
  plainAdminToken: string;
  ownerId: string;      // regular USER who owns dispute test data
}

async function createAdminFixtures(): Promise<AdminFixtures> {
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

  // Plain ADMIN with no sub-roles: resolveUserPermissions returns [] →
  // JWT has no `permissions` field. authorize('ADMIN','SUPER_ADMIN') passes;
  // authorize('SUPER_ADMIN') fails → 403 on every SUPER_ADMIN-gated route.
  const plainAdmin = await prisma.user.create({
    data: {
      email: `adm-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Plain',
      lastName: 'Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // Regular user who will "own" dispute test data
  const owner = await prisma.user.create({
    data: {
      email: `owner-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Dispute',
      lastName: 'Owner',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // Login both admins via API (clientType=web so the login route accepts admin roles)
  const saRes = await request(app)
    .post('/api/auth/login')
    .send({ email: superAdmin.email, password: PASSWORD, clientType: 'web' });
  if (saRes.status !== 200) throw new Error(`SUPER_ADMIN login failed: ${saRes.status} ${JSON.stringify(saRes.body)}`);

  const paRes = await request(app)
    .post('/api/auth/login')
    .send({ email: plainAdmin.email, password: PASSWORD, clientType: 'web' });
  if (paRes.status !== 200) throw new Error(`ADMIN login failed: ${paRes.status} ${JSON.stringify(paRes.body)}`);

  return {
    superAdminId: superAdmin.id,
    superAdminToken: saRes.body.data.accessToken,
    plainAdminId: plainAdmin.id,
    plainAdminToken: paRes.body.data.accessToken,
    ownerId: owner.id,
  };
}

// ─── §7.4 Fraud Rule Auth Gates ──────────────────────────────────────────────

describe('§7.4 Fraud Rule auth gates', () => {
  let fixtures: AdminFixtures;
  let ruleId: string;
  const createdRuleIds: string[] = [];

  beforeAll(async () => {
    fixtures = await createAdminFixtures();

    // Seed a FraudRule so PATCH/DELETE/overrides tests have a target.
    const rule = await prisma.fraudRule.create({
      data: {
        tier: 'SYSTEM',
        createdBy: fixtures.superAdminId,
      },
    });
    ruleId = rule.id;
    createdRuleIds.push(ruleId);
  });

  afterAll(async () => {
    // Clean up overrides first (FK constraint)
    await prisma.fraudRuleOverride.deleteMany({ where: { ruleId: { in: createdRuleIds } } });
    await prisma.fraudRule.deleteMany({ where: { id: { in: createdRuleIds } } });
    await cleanupTestUser(fixtures.superAdminId);
    await cleanupTestUser(fixtures.plainAdminId);
    await cleanupTestUser(fixtures.ownerId);
  });

  // ── A: ADMIN blocked on every mutation route ──────────────────────────────

  it('A1 — ADMIN: POST /fraud-rules returns 403', async () => {
    const res = await request(app)
      .post('/api/admin/settings/fraud-rules')
      .set('Authorization', `Bearer ${fixtures.plainAdminToken}`)
      .send({ tier: 'SYSTEM' });
    expect(res.status).toBe(403);
  });

  it('A2 — ADMIN: PATCH /fraud-rules/:id returns 403', async () => {
    const res = await request(app)
      .patch(`/api/admin/settings/fraud-rules/${ruleId}`)
      .set('Authorization', `Bearer ${fixtures.plainAdminToken}`)
      .send({ notes: 'should be blocked' });
    expect(res.status).toBe(403);
  });

  it('A3 — ADMIN: DELETE /fraud-rules/:id returns 403', async () => {
    const res = await request(app)
      .delete(`/api/admin/settings/fraud-rules/${ruleId}`)
      .set('Authorization', `Bearer ${fixtures.plainAdminToken}`);
    expect(res.status).toBe(403);
  });

  it('A4 — ADMIN: POST /fraud-rules/:id/overrides returns 403', async () => {
    const res = await request(app)
      .post(`/api/admin/settings/fraud-rules/${ruleId}/overrides`)
      .set('Authorization', `Bearer ${fixtures.plainAdminToken}`)
      .send({ targetType: 'user', targetId: fixtures.ownerId, override: {} });
    expect(res.status).toBe(403);
  });

  it('A5 — ADMIN: DELETE /fraud-rules/:id/overrides/:overId returns 403', async () => {
    // The 403 fires before any DB lookup — a non-existent overId still returns 403.
    const fakeOverrideId = '00000000-0000-0000-0000-000000000001';
    const res = await request(app)
      .delete(`/api/admin/settings/fraud-rules/${ruleId}/overrides/${fakeOverrideId}`)
      .set('Authorization', `Bearer ${fixtures.plainAdminToken}`);
    expect(res.status).toBe(403);
  });

  // ── B: ADMIN blocked on GET /overrides (new gate) ─────────────────────────

  it('B — ADMIN: GET /fraud-rules/:id/overrides returns 403', async () => {
    const res = await request(app)
      .get(`/api/admin/settings/fraud-rules/${ruleId}/overrides`)
      .set('Authorization', `Bearer ${fixtures.plainAdminToken}`);
    expect(res.status).toBe(403);
  });

  // ── C: SUPER_ADMIN passes all routes ──────────────────────────────────────

  it('C1 — SUPER_ADMIN: GET /fraud-rules returns 200', async () => {
    const res = await request(app)
      .get('/api/admin/settings/fraud-rules')
      .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('C2 — SUPER_ADMIN: POST /fraud-rules creates a rule (201)', async () => {
    const res = await request(app)
      .post('/api/admin/settings/fraud-rules')
      .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
      .send({ tier: 'SYSTEM', notes: 'integration test rule' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdRuleIds.push(res.body.data.id);
  });

  it('C3 — SUPER_ADMIN: GET /fraud-rules/:id/overrides returns 200', async () => {
    const res = await request(app)
      .get(`/api/admin/settings/fraud-rules/${ruleId}/overrides`)
      .set('Authorization', `Bearer ${fixtures.superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('C4 — SUPER_ADMIN: POST /fraud-rules/:id/overrides creates an override (201)', async () => {
    const res = await request(app)
      .post(`/api/admin/settings/fraud-rules/${ruleId}/overrides`)
      .set('Authorization', `Bearer ${fixtures.superAdminToken}`)
      .send({
        targetType: 'user',
        targetId: fixtures.ownerId,
        override: { dailyScanLimit: 99 },
        reason: 'test override',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ─── §7.3 Dispute Cases PATCH ────────────────────────────────────────────────

describe('§7.3 PATCH /dispute-cases/:id', () => {
  let fixtures: AdminFixtures;
  let superAdminToken: string;
  let ownerId: string;

  // Helper: creates a fresh OPEN dispute via the API and returns its id.
  async function openDispute(): Promise<string> {
    const res = await request(app)
      .post('/api/admin/control/dispute-cases')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ subjectType: 'CASHBACK', subjectId: 'cashback-ref-001', userId: ownerId });
    if (res.status !== 201) throw new Error(`POST dispute-cases failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.id;
  }

  // Helper: advance a dispute from OPEN → IN_REVIEW.
  async function advanceToInReview(disputeId: string): Promise<void> {
    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'IN_REVIEW' });
    if (res.status !== 200) throw new Error(`advance to IN_REVIEW failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  beforeAll(async () => {
    fixtures = await createAdminFixtures();
    superAdminToken = fixtures.superAdminToken;
    ownerId = fixtures.ownerId;
  });

  afterEach(async () => {
    if (!ownerId) return;
    const disputes = await prisma.dispute.findMany({ where: { userId: ownerId } });
    for (const d of disputes) {
      await prisma.disputeNote.deleteMany({ where: { disputeId: d.id } });
    }
    await prisma.dispute.deleteMany({ where: { userId: ownerId } });
  });

  afterAll(async () => {
    await cleanupTestUser(fixtures.superAdminId);
    await cleanupTestUser(fixtures.plainAdminId);
    await cleanupTestUser(fixtures.ownerId);
  });

  // ── D: OPEN→IN_REVIEW audit action ────────────────────────────────────────

  it('D — OPEN→IN_REVIEW writes AuditLog action=dispute.in-review', async () => {
    const disputeId = await openDispute();

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'IN_REVIEW' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_REVIEW');

    // The audit write is fire-and-forget; give it a moment to complete.
    await wait(200);

    const log = await prisma.auditLog.findFirst({
      where: { action: 'dispute.in-review', objectId: disputeId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log?.actorUserId).toBe(fixtures.superAdminId);
  });

  // ── E: RESOLVED without any decision → 400 ────────────────────────────────

  it('E — IN_REVIEW→RESOLVED with no decision anywhere returns 400', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'RESOLVED' });  // no decision field, none stored in DB

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/decision/i);
  });

  // ── F: RESOLVED with decision in body ──────────────────────────────────────

  it('F — IN_REVIEW→RESOLVED with decision in body succeeds (200)', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'RESOLVED', decision: 'Claim verified — cashback approved' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVED');
    expect(res.body.data.resolvedAt).not.toBeNull();
  });

  // ── G: RESOLVED with prior-stored decision (no decision in body) ──────────

  it('G — RESOLVED falls back to prior-stored decision when not supplied', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    // Store a decision without advancing status
    await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ decision: 'Pre-stored decision text' });

    // Now resolve without repeating the decision field
    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVED');
  });

  // ── H: decision=null and decision="" block RESOLVED ───────────────────────

  it('H1 — RESOLVED with decision=null returns 400', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'RESOLVED', decision: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/decision/i);
  });

  it('H2 — RESOLVED with decision="" returns 400', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'RESOLVED', decision: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/decision/i);
  });

  it('H3 — RESOLVED with decision that is whitespace-only returns 400', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'RESOLVED', decision: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/decision/i);
  });

  // ── I: non-RESOLVED transition with decision="" clears stored decision ─────

  it('I — non-RESOLVED PATCH with decision="" clears a previously-stored decision', async () => {
    const disputeId = await openDispute();
    await advanceToInReview(disputeId);

    // Store a decision
    await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ decision: 'Draft decision to be retracted' });

    // Clear the decision by sending decision="" (not advancing status)
    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ decision: '' });

    expect(res.status).toBe(200);
    // decision should now be null in the DB
    const updated = await prisma.dispute.findUnique({ where: { id: disputeId } });
    expect(updated?.decision).toBeNull();
  });
});

// ─── §7.3 Dispute PATCH — assignedTo validation ──────────────────────────────

describe('§7.3 PATCH /dispute-cases/:id — assignedTo validation', () => {
  let fixtures: AdminFixtures;
  let superAdminToken: string;
  let plainAdminToken: string;
  let superAdminId: string;
  let ownerId: string;

  beforeAll(async () => {
    fixtures = await createAdminFixtures();
    superAdminToken = fixtures.superAdminToken;
    plainAdminToken = fixtures.plainAdminToken;
    superAdminId = fixtures.superAdminId;
    ownerId = fixtures.ownerId;
  });

  afterEach(async () => {
    if (!ownerId) return;
    const disputes = await prisma.dispute.findMany({ where: { userId: ownerId } });
    for (const d of disputes) {
      await prisma.disputeNote.deleteMany({ where: { disputeId: d.id } });
    }
    await prisma.dispute.deleteMany({ where: { userId: ownerId } });
  });

  afterAll(async () => {
    await cleanupTestUser(fixtures.superAdminId);
    await cleanupTestUser(fixtures.plainAdminId);
    await cleanupTestUser(fixtures.ownerId);
  });

  async function createOpenDispute(): Promise<string> {
    const res = await request(app)
      .post('/api/admin/control/dispute-cases')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ subjectType: 'CASHBACK', subjectId: 'test-cashback-001', userId: ownerId });
    if (res.status !== 201) throw new Error(`POST dispute-cases failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.id;
  }

  // ── J: PATCH with non-existent assignedTo → 404 ───────────────────────────

  it('J — PATCH with non-existent assignedTo returns 404', async () => {
    const disputeId = await createOpenDispute();

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ assignedTo: '00000000-0000-0000-0000-000000000099' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/assignee not found/i);
  });

  // ── K: PATCH with subscriber as assignedTo → 400 ─────────────────────────

  it('K — PATCH with a subscriber (USER role) as assignedTo returns 400', async () => {
    const disputeId = await createOpenDispute();

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ assignedTo: ownerId }); // ownerId has role=USER

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ADMIN or SUPER_ADMIN/i);
  });

  // ── L: PATCH with valid admin assignedTo → 200 ────────────────────────────

  it('L — PATCH with a valid ADMIN assignedTo succeeds (200)', async () => {
    const disputeId = await createOpenDispute();

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ assignedTo: fixtures.plainAdminId }); // plain ADMIN is valid

    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo).toBe(fixtures.plainAdminId);
  });

  // ── M: PATCH with assignedTo=null unassigns the case ─────────────────────

  it('M — PATCH with assignedTo=null clears the assignee', async () => {
    const disputeId = await createOpenDispute();

    const res = await request(app)
      .patch(`/api/admin/control/dispute-cases/${disputeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ assignedTo: null });

    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo).toBeNull();
  });
});

// ─── §7.3 Dispute POST — optional assignedTo at creation ─────────────────────

describe('§7.3 POST /dispute-cases — optional assignedTo', () => {
  let fixtures: AdminFixtures;
  let superAdminToken: string;
  let ownerId: string;

  beforeAll(async () => {
    fixtures = await createAdminFixtures();
    superAdminToken = fixtures.superAdminToken;
    ownerId = fixtures.ownerId;
  });

  afterEach(async () => {
    if (!ownerId) return;
    const disputes = await prisma.dispute.findMany({ where: { userId: ownerId } });
    for (const d of disputes) {
      await prisma.disputeNote.deleteMany({ where: { disputeId: d.id } });
    }
    await prisma.dispute.deleteMany({ where: { userId: ownerId } });
  });

  afterAll(async () => {
    await cleanupTestUser(fixtures.superAdminId);
    await cleanupTestUser(fixtures.plainAdminId);
    await cleanupTestUser(fixtures.ownerId);
  });

  // ── N: creation without assignedTo defaults to requesting admin ───────────

  it('N — creation without assignedTo defaults to requesting admin', async () => {
    const res = await request(app)
      .post('/api/admin/control/dispute-cases')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ subjectType: 'CASHBACK', subjectId: 'test-n-001', userId: ownerId });

    expect(res.status).toBe(201);
    expect(res.body.data.assignedTo).toBe(fixtures.superAdminId);
  });

  // ── O: creation with explicit assignedTo (plain admin) ───────────────────

  it('O — creation with valid assignedTo assigns to the specified admin', async () => {
    const res = await request(app)
      .post('/api/admin/control/dispute-cases')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        subjectType: 'CASHBACK',
        subjectId: 'test-o-001',
        userId: ownerId,
        assignedTo: fixtures.plainAdminId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assignedTo).toBe(fixtures.plainAdminId);
  });

  // ── P: creation with subscriber as assignedTo → 400 ─────────────────────

  it('P — creation with subscriber (USER) as assignedTo returns 400', async () => {
    const res = await request(app)
      .post('/api/admin/control/dispute-cases')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        subjectType: 'CASHBACK',
        subjectId: 'test-p-001',
        userId: ownerId,
        assignedTo: ownerId, // ownerId has role=USER
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ADMIN or SUPER_ADMIN/i);
  });

  // ── Q: creation with non-existent assignedTo → 404 ───────────────────────

  it('Q — creation with non-existent assignedTo returns 404', async () => {
    const res = await request(app)
      .post('/api/admin/control/dispute-cases')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        subjectType: 'CASHBACK',
        subjectId: 'test-q-001',
        userId: ownerId,
        assignedTo: '00000000-0000-0000-0000-000000000099',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/assignee not found/i);
  });
});
