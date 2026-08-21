/**
 * Integration tests for BC-ADMIN-SPEC-REAUDIT-SA-GUARD-RACES-1
 *
 * Tests cover three TOCTOU (time-of-check, time-of-use) race conditions that can
 * leave zero active Super-Admins or bypass 2-of-N dual-approval requirement:
 *
 * DEFECT 1 (last-active-SA guard race in PATCH /status):
 *   Two concurrent archive requests can both see 2 active SAs, both think archiving
 *   one leaves 1 active, both updates commit, leaving 0 active SAs.
 *   Fix: Wrap guard + write in Serializable transaction.
 *
 * DEFECT 2 (role-revoke guard race in DELETE /roles/:roleKey):
 *   Same TOCTOU pattern — two concurrent revoke requests can both see >0 other
 *   non-archived SAs, both think revoking leaves ≥1, both commit, leaving 0 non-archived.
 *   Fix: Wrap SUPER_ADMIN revoke guard + delete in Serializable transaction with retry.
 *
 * DEFECT 3 (bootstrap quorum race in POST /pending-super/:id/approve):
 *   If only 1 SA exists and two self-approve requests fire concurrently, one can
 *   slip through and violate 2-of-N rule.
 *   Fix: Wrap bootstrap quorum check + user.create in Serializable transaction.
 *
 * Tests use Promise.all to fire concurrent mutations and assert:
 * - Exactly one succeeds (409 or success, not both success)
 * - Invariant holds after both requests complete (≥1 non-archived SUPER_ADMIN remains)
 *
 * Test Setup:
 *   - Token generation: generateTestToken() creates valid JWTs signed with JWT_SECRET
 *   - Auth middleware: authenticate() verifies JWTs with jwt.verify() in the normal path
 *   - No mocking: tests run against the real auth middleware stack
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { AdminRoleKey, UserStatus } from '@prisma/client';
import { genTestPhone } from './helpers/test-utils';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-SPEC-REAUDIT-SA-GUARD-RACES-1: TOCTOU Race Prevention', () => {
  let app: any;
  let superAdminRoleId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Lookup SUPER_ADMIN role
    const superAdminRole = await prisma.adminRole.findUnique({
      where: { key: AdminRoleKey.SUPER_ADMIN },
    });
    if (!superAdminRole) {
      throw new Error('SUPER_ADMIN role not found — run seed-permissions first');
    }
    superAdminRoleId = superAdminRole.id;
  });

  afterAll(async () => {
    // createTestApp() (tests/setup.ts) returns the plain Express app, not a
    // listening server — supertest's persistent-server wrapper owns the
    // actual http.Server and closes it at the file boundary. app.close is
    // not a function; calling it here was a stale test-infra bug (BC-QA-042).
    //
    // BC-QA-042 review round 1 (HIGH): this file previously had NO fixture
    // cleanup at all beyond prisma.$disconnect(). Every test creates
    // ACTIVE role:'SUPER_ADMIN' users (race-defect1-*, race-defect2-*,
    // race-existing-sa-*) and DEFECT 3 can additionally CREATE a brand new
    // one (race-new-sa1-*/race-new-sa2-* — whichever approval won the
    // race). Left behind, those stray ACTIVE SUPER_ADMINs silently supply
    // an extra "remaining active" count to any later file in the same
    // batch/run that asserts a "sole ACTIVE admin" guard scenario (see
    // bc-admin-reaudit2-lastsa-revoke-guard.test.ts), defeating that file's
    // own isolation. This cleanup does NOT touch this file's own
    // assertions — DEFECT 1/2/3 stay red on the real regression, as
    // intended; it only deletes the fixture rows afterward.
    //
    // All emails this file creates share the '@test.local' domain with one
    // of these file-unique prefixes, so a prefix-scoped delete is safe and
    // won't touch fixtures from other files.
    const emailPrefixes = [
      'race-defect1-',
      'race-defect2-',
      'race-existing-sa-',
      'race-new-sa1-',
      'race-new-sa2-',
    ];
    const staleUsers = await prisma.user.findMany({
      where: { OR: emailPrefixes.map((prefix) => ({ email: { startsWith: prefix } })) },
      select: { id: true },
    });
    const staleUserIds = staleUsers.map((u) => u.id);
    if (staleUserIds.length) {
      // PendingSuperAdminRequest.requestedBy has no onDelete: Cascade, so
      // delete those rows (both by requester and by their own email, since
      // a pending request's own row is keyed on ITS applicant email, not
      // requestedById) before deleting the Users. UserAdminRole does
      // cascade on user deletion.
      await prisma.pendingSuperAdminRequest.deleteMany({
        where: {
          OR: [
            { requestedById: { in: staleUserIds } },
            ...emailPrefixes.map((prefix) => ({ email: { startsWith: prefix } })),
          ],
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: staleUserIds } } });
    }
    await prisma.$disconnect();
  });

  describe('DEFECT 1: PATCH /status last-active-SA guard race', () => {
    it('should prevent leaving zero active SAs when two concurrent archive requests race', async () => {
      // Setup: create 3 ACTIVE SUPER_ADMINs
      const [sa1, sa2, sa3] = await Promise.all([
        prisma.user.create({
          data: {
            email: `race-defect1-sa1-${Date.now()}@test.local`,
            firstName: 'Race1SA1',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect1-sa2-${Date.now()}@test.local`,
            firstName: 'Race1SA2',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect1-sa3-${Date.now()}@test.local`,
            firstName: 'Race1SA3',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
      ]);

      // sa3 is the archiver (will archive sa1 and sa2 concurrently)
      const sa3Token = generateTestToken(sa3.id, 'SUPER_ADMIN');

      // Fire two concurrent archive requests (sa1 and sa2, both by sa3)
      // Both will see 3 ACTIVE SAs initially.
      // Without Serializable isolation, both might think:
      //   "I'm archiving one, leaving 2 others active" → both succeed
      //   Result: 0 active SAs (BUG)
      // With Serializable isolation, one succeeds, one gets 409 or serialization conflict.
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/admin/admins/${sa1.id}/status`)
          .set('Authorization', `Bearer ${sa3Token}`)
          .send({ status: 'ARCHIVED', reason: 'Test race condition 1' }),
        request(app)
          .patch(`/api/admin/admins/${sa2.id}/status`)
          .set('Authorization', `Bearer ${sa3Token}`)
          .send({ status: 'ARCHIVED', reason: 'Test race condition 1' }),
      ]);

      // Exactly one should succeed (status 200), one should get 409
      const results = [res1.status, res2.status].sort();
      expect(results).toEqual([200, 409]);

      // Invariant: at least 1 ACTIVE SUPER_ADMIN remains (sa3 or one of sa1/sa2 if the archive was rejected)
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      expect(activeSuperAdmins).toBeGreaterThanOrEqual(1);

      // Verify: exactly one was archived
      const [sa1After, sa2After] = await Promise.all([
        prisma.user.findUnique({ where: { id: sa1.id }, select: { status: true } }),
        prisma.user.findUnique({ where: { id: sa2.id }, select: { status: true } }),
      ]);
      const archivedCount = [sa1After, sa2After].filter((u) => u?.status === 'ARCHIVED').length;
      expect(archivedCount).toBe(1);
    });
  });

  describe('DEFECT 2: DELETE /roles/:roleKey revoke guard race', () => {
    it('should prevent leaving zero active SAs when two concurrent revoke requests race', async () => {
      // Setup: create 3 ACTIVE SUPER_ADMINs with SUPER_ADMIN role
      const [sa1, sa2, sa3] = await Promise.all([
        prisma.user.create({
          data: {
            email: `race-defect2-sa1-${Date.now()}@test.local`,
            firstName: 'Race2SA1',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect2-sa2-${Date.now()}@test.local`,
            firstName: 'Race2SA2',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect2-sa3-${Date.now()}@test.local`,
            firstName: 'Race2SA3',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
      ]);

      // sa3 is the revoker (will revoke sa1's and sa2's SUPER_ADMIN roles concurrently)
      const sa3Token = generateTestToken(sa3.id, 'SUPER_ADMIN');

      // Fire two concurrent revoke requests (sa1's and sa2's SUPER_ADMIN roles, both by sa3)
      // Both will see 3 ACTIVE SUPER_ADMINs initially.
      // Without Serializable isolation:
      //   remainingActiveSupers (excluding sa1) = 2 → succeed
      //   remainingActiveSupers (excluding sa2) = 2 → succeed
      //   Result: 0 active SUPER_ADMINs (BUG)
      // With Serializable isolation, one succeeds, one gets 409.
      const [res1, res2] = await Promise.all([
        request(app)
          .delete(`/api/admin/admins/${sa1.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
          .set('Authorization', `Bearer ${sa3Token}`),
        request(app)
          .delete(`/api/admin/admins/${sa2.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
          .set('Authorization', `Bearer ${sa3Token}`),
      ]);

      // Exactly one should succeed (status 200), one should get 409
      const results = [res1.status, res2.status].sort();
      expect(results).toEqual([200, 409]);

      // Invariant: at least 1 ACTIVE SUPER_ADMIN remains
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      expect(activeSuperAdmins).toBeGreaterThanOrEqual(1);

      // Verify: exactly one had SUPER_ADMIN role revoked
      const [sa1After, sa2After] = await Promise.all([
        prisma.user.findUnique({
          where: { id: sa1.id },
          select: { role: true, adminRoles: { select: { role: { select: { key: true } } } } },
        }),
        prisma.user.findUnique({
          where: { id: sa2.id },
          select: { role: true, adminRoles: { select: { role: { select: { key: true } } } } },
        }),
      ]);

      // Count how many were downgraded from SUPER_ADMIN to ADMIN (role change) or had role revoked
      const downgradedCount = [sa1After, sa2After].filter(
        (u) => u?.role === 'ADMIN' || !u?.adminRoles.some((ar) => ar.role.key === AdminRoleKey.SUPER_ADMIN),
      ).length;
      expect(downgradedCount).toBe(1);
    });
  });

  describe('DEFECT 3: POST /pending-super/:id/approve bootstrap quorum race', () => {
    it('should prevent bypassing 2-of-N when two concurrent self-approvals race with only 1 existing SA', async () => {
      // ── Isolate the bootstrap precondition (BC-QA-045-FOLLOWUP-3) ──────────
      //
      // The route's own bootstrap-quorum check (adminAdmins.routes.ts, "H2
      // fix") counts every non-ARCHIVED SUPER_ADMIN — ACTIVE, INACTIVE, AND
      // SUSPENDED all count as "exists" — not just ACTIVE ones:
      //   tx.user.count({ where: { role: 'SUPER_ADMIN', status: { not: 'ARCHIVED' } } })
      // This test's whole premise is "exactly 1 non-archived SUPER_ADMIN
      // exists", so the self-approval race can even reach the bootstrap
      // exception. Two things make that premise false by default:
      //  1. This file's OWN DEFECT 1 / DEFECT 2 tests (which ran immediately
      //     before this one, in file order) each create 3 ACTIVE SUPER_ADMIN
      //     fixtures and only clean them up in this file's afterAll — so by
      //     the time DEFECT 3 runs, up to 6 of this file's own fixtures are
      //     still live.
      //  2. boomcard_test is a shared integration-test database; other
      //     suites across the file leak non-archived SUPER_ADMIN fixtures of
      //     their own (see BC-QA-045-FOLLOWUP-3 task description).
      // Confirmed directly (BC-QA-045 impl-r2 review, finding F6): against
      // the polluted DB, both self-approvals were rejected with 403 "The
      // approver must be a different admin from the original requester" —
      // the deliberate non-bootstrap H2 rule, not a race defect.
      //
      // Fix: temporarily archive every OTHER non-ARCHIVED SUPER_ADMIN before
      // the race, so the precondition holds regardless of what earlier tests
      // in this file or other suites left behind, then restore their
      // original status afterward (finally block) so this test does not
      // permanently mutate rows it does not own — a leaked fixture from
      // another suite may still be inspected by that suite's own (broken)
      // cleanup logic, or by a human debugging the leak later.
      //
      // ACCEPTED RISK (BC-QA-045-FOLLOWUP-3 impl-r1 review, F1): boomcard_test
      // is a shared integration-test database, and this machine genuinely
      // runs multiple concurrent jest processes from OTHER worktrees against
      // it (confirmed live during review — e.g. a sibling worktree running
      // trialpending-label.test.ts, which holds its own ACTIVE SUPER_ADMIN
      // fixture across several it() blocks). For the window between the
      // archive updateMany below and the restore in the finally block, any
      // such concurrent session's SUPER_ADMIN gets its status flipped to
      // ARCHIVED — authenticate() (src/middleware/auth.middleware.ts) does a
      // live per-request status check, so an authenticated request from that
      // OTHER session during this window can receive a spurious 401 through
      // no fault of its own code. The finally-block restore is also
      // unconditional (writes back the snapshotted `sa.status`, not a
      // compare-and-swap), so if that row's status legitimately changed for
      // an unrelated reason during the window, this restore clobbers it.
      // Judged ACCEPTABLE rather than fixed outright because: (a) the route's
      // own bootstrap-quorum check (adminAdmins.routes.ts, "H2 fix") is a
      // genuine global non-archived-SUPER_ADMIN count by design, so any test
      // that wants to exercise the bootstrap path at all must transiently
      // make that global count true — there is no per-file-scoped way to
      // satisfy it; (b) the window is minimized below to just the archive
      // call and the two concurrent race requests (see the restore placement
      // right after the race responses come back, BEFORE this test's own
      // assertions run — those assertions don't need the archived state and
      // used to be inside the window for no reason); (c) the failure mode for
      // a caught-out concurrent session is a transient, cheaply-retried 401
      // in test-only code, not data corruption or a production-facing
      // defect. If this starts causing real cross-worktree flakiness in
      // practice, the fix is to scope DEFECT 3 to its own dedicated test
      // database rather than trying to further shrink an inherently
      // global-by-design precondition window.
      const otherNonArchivedSAs = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', status: { not: 'ARCHIVED' } },
        select: { id: true, status: true },
      });

      // Use a stable test ID suffix to avoid timestamp collision issues at millisecond boundaries
      const testId = `defect3-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Everything the race itself needs (the sole SA + its two pending
      // requests) is created BEFORE the archive call, outside the
      // archived-window — none of that setup depends on other SAs being
      // archived yet, only the race requests themselves do. This keeps the
      // window tight: archive → fire race → restore, with no unrelated
      // fixture-creation awaits in between.
      const raceFixtures = await createDefect3RaceFixtures(testId, superAdminRoleId);

      let raceResponses: Defect3RaceResponses;
      if (otherNonArchivedSAs.length) {
        await prisma.user.updateMany({
          where: { id: { in: otherNonArchivedSAs.map((u) => u.id) } },
          data: { status: 'ARCHIVED' },
        });
      }
      try {
        raceResponses = await fireDefect3Race(raceFixtures);
      } finally {
        // Restore whatever we temporarily archived to isolate this test's
        // precondition — do this even on failure so a red assertion above
        // cannot leave other suites' fixtures stuck ARCHIVED. Placed
        // immediately after the race responses come back (not after this
        // test's own follow-up assertions, which run below, outside the
        // try/finally) so the archived window is no longer than it has to be.
        for (const sa of otherNonArchivedSAs) {
          await prisma.user.update({ where: { id: sa.id }, data: { status: sa.status } }).catch(() => {
            // The row may no longer exist (e.g. another suite's own afterAll
            // deleted it concurrently) — non-fatal, nothing to restore.
          });
        }
      }

      await assertDefect3Race(testId, raceFixtures, raceResponses);
    });
  });

  interface Defect3RaceFixtures {
    existingSA: { id: string };
    existingSAToken: string;
    pending1: { id: string };
    pending2: { id: string };
  }

  interface Defect3RaceResponses {
    res1: { status: number };
    res2: { status: number };
  }

  async function createDefect3RaceFixtures(
    testId: string,
    superAdminRoleId: string,
  ): Promise<Defect3RaceFixtures> {
      const existingSA = await prisma.user.create({
        data: {
          email: `race-existing-sa-${testId}@test.local`,
          firstName: 'ExistingSA',
          lastName: 'Test',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          adminRoles: { create: { roleId: superAdminRoleId } },
        },
      });
      const existingSAToken = generateTestToken(existingSA.id, 'SUPER_ADMIN');

      // Create two pending SUPER_ADMIN requests from the sole existing SA
      const [pending1, pending2] = await Promise.all([
        prisma.pendingSuperAdminRequest.create({
          data: {
            email: `race-new-sa1-${testId}@test.local`,
            firstName: 'NewSA1',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'dummy',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            requestedBy: { connect: { id: existingSA.id } },
          },
        }),
        prisma.pendingSuperAdminRequest.create({
          data: {
            email: `race-new-sa2-${testId}@test.local`,
            firstName: 'NewSA2',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'dummy',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            requestedBy: { connect: { id: existingSA.id } },
          },
        }),
      ]);

      return { existingSA, existingSAToken, pending1, pending2 };
  }

  // Fires the two concurrent self-approvals. This is the ONLY part of the
  // whole DEFECT 3 flow that structurally needs the other-SAs-archived
  // window to be in effect (see the ACCEPTED RISK comment above) — fixture
  // creation happens before this is called, and assertions happen after the
  // window has already been closed by the `it()` block's restore.
  async function fireDefect3Race(fixtures: Defect3RaceFixtures): Promise<Defect3RaceResponses> {
      const { pending1, pending2, existingSAToken } = fixtures;
      // Fire two concurrent self-approvals (existingSA approves both pending requests)
      // Both will see existingSuperAdminCount = 1 initially.
      // Spec §3.9: "if only one Super Admin EXISTS" → bootstrap exception allows self-approval.
      // Without Serializable isolation:
      //   Both might think: "1 existing SA (myself) → I can self-approve" → both succeed
      //   Result: 3 total SAs (violated 2-of-N: 2nd SA created without 2nd human approval)
      // With Serializable isolation, one succeeds (quorum still 1), second gets rejection:
      //   After first succeeds, existingSuperAdminCount becomes 2, so 2nd fails with 403.
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/admins/pending-super/${pending1.id}/approve`)
          .set('Authorization', `Bearer ${existingSAToken}`),
        request(app)
          .post(`/api/admin/admins/pending-super/${pending2.id}/approve`)
          .set('Authorization', `Bearer ${existingSAToken}`),
      ]);
      return { res1, res2 };
  }

  async function assertDefect3Race(
    testId: string,
    fixtures: Defect3RaceFixtures,
    responses: Defect3RaceResponses,
  ): Promise<void> {
      const { existingSA } = fixtures;
      const { res1, res2 } = responses;

      // Expected outcome:
      // - One succeeds (201 Created)
      // - One either gets 403 (self-approval now forbidden) or 409 (serialization conflict)
      // The 409 (not 403) is the more likely outcome under Serializable isolation + concurrent race
      const results = [res1.status, res2.status];
      const hasSuccess = results.includes(201);
      const hasBlockOrConflict = results.includes(403) || results.includes(409);

      expect(hasSuccess).toBe(true);
      expect(hasBlockOrConflict).toBe(true);
      expect(results[0] !== results[1]).toBe(true); // They should differ

      // Invariant: exactly one of the pending requests resulted in a created SUPER_ADMIN
      const createdSuperAdmins = await prisma.user.count({
        where: {
          email: {
            in: [
              `race-new-sa1-${testId}@test.local`,
              `race-new-sa2-${testId}@test.local`,
            ],
          },
          role: 'SUPER_ADMIN',
        },
      });

      // Should be 0 or 1 (not 2, which would violate 2-of-N)
      expect(createdSuperAdmins).toBeLessThanOrEqual(1);

      // Verify total SUPER_ADMIN count: original (1) + at most 1 new = at most 2
      // But actually, if the race was properly prevented, we should have:
      // - existingSA (1)
      // - One newly created SA (1)
      // - One rejected/not-created (0)
      // = 2 total (this is correct: 2-of-N rule preserved)
      //
      // Scoped to THIS test's own rows rather than a raw global count
      // (BC-QA-045-FOLLOWUP-3): a raw `prisma.user.count({ role:
      // 'SUPER_ADMIN', status: 'ACTIVE' })` would be polluted by any other
      // non-archived SUPER_ADMIN row that exists in the shared
      // boomcard_test database — this file's own DEFECT 1/2 fixtures
      // (cleaned up only in this file's afterAll, which has not run yet)
      // and any cross-suite leakage alike. existingSA itself is untouched
      // by the approve race, so its own ACTIVE count plus the number of
      // newly created SAs is the exact, delta-free invariant this test
      // actually owns.
      const existingSAStillActive = await prisma.user.count({
        where: { id: existingSA.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const scopedTotalSuperAdmins = existingSAStillActive + createdSuperAdmins;
      expect(scopedTotalSuperAdmins).toBeLessThanOrEqual(2);
      expect(scopedTotalSuperAdmins).toBeGreaterThanOrEqual(1);
  }
});

/**
 * Generate a valid JWT token for integration tests.
 *
 * This creates a real JWT signed with JWT_SECRET, allowing the auth middleware to
 * verify it in the normal path without mocking. The token carries minimal claims
 * required for the auth middleware to accept it:
 *   - id: user ID (required)
 *   - email: user email (required for some middleware checks)
 *   - role: 'ADMIN' or 'SUPER_ADMIN' (required for authorization gates)
 *
 * The token is NOT tied to an actual database User row on creation; the
 * middleware will verify the JWT and accept req.user = decoded. The caller
 * is responsible for ensuring the database User exists (if needed by the route).
 *
 * Tokens expire in 15 minutes (matching JWT_EXPIRES_IN in auth.service.ts);
 * extend expiresIn if tests need tokens to persist longer.
 */
function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }

  const payload = {
    id: userId,
    email: `test-${userId}@test.local`,
    role,
  };

  const token = jwt.sign(payload, jwtSecret, {
    expiresIn: '15m',
  });

  return token;
}
