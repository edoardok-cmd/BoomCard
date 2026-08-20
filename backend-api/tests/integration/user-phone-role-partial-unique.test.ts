/**
 * BC-QA-051 — standing regression pin: `(phone, role)` uniqueness on `"User"` must
 * stay PARTIAL (blank phones excluded).
 *
 * THE REGRESSION THIS EXISTS TO CATCH
 * -----------------------------------
 * A blanket `UNIQUE ("phone", "role")` on `"User"` is unsatisfiable against real
 * production data: `phone` is NOT NULL and "no phone on file" is the EMPTY STRING,
 * which (unlike NULL) is not distinct from itself. 134 of 231 production rows sit in
 * that bucket. When that constraint shipped on 2026-08-10 the migration aborted,
 * `prisma migrate deploy` exited 1, and — because deploy was chained into the Fly
 * start command with `&&` — the API process never started. ~10 days of downtime,
 * across nine consecutive CD runs that all reported green.
 *
 * CI could not see any of it, and still cannot: CI runs `prisma migrate deploy`
 * against a FRESH Postgres, where a total unique constraint applies perfectly
 * cleanly. The defect only manifests against data containing blank phones — exactly
 * the data CI never has. So the pin cannot be "does the migration apply"; it has to
 * be "does the migrated database still ACCEPT the writes production depends on".
 *
 * This file inserts those writes. It goes red if anyone simplifies `schema.prisma`'s
 * attribute back to a plain `@@unique([phone, role])`, if a later migration recreates
 * the index without its `WHERE`, or if the rule is widened to phone alone. It stays
 * green through a rename, a re-spelled predicate, or a move to a different
 * enforcement mechanism — because it asserts behaviour, not spelling.
 *
 * The probe logic lives in tests/helpers/phoneRoleUniquenessProbes.ts so that
 * user-phone-role-partial-unique.teeth.test.ts can run the IDENTICAL probes against a
 * deliberately-regressed scratch schema and prove they go red. A pin that has never
 * been seen to fail is not a pin.
 *
 * DATABASE: the migrated schema of `process.env.DATABASE_URL` (tests/setup.ts pins it
 * from .env.test and runs `prisma migrate deploy` before any test file loads; CI's
 * admin-spec-sweeps.yml provisions the Postgres service container and deploys
 * migrations itself). Every probe rolls its transaction back, so this suite commits
 * nothing and is safely re-runnable against the same database.
 */

import { Pool } from 'pg';
import {
  BLANK_COEXISTENCE_PROBE_IDS,
  PHONE_ROLE_INDEX_NAME,
  PROBE_IDS,
  ProbeResult,
  formatProbeReport,
  readUserUniqueIndexDefs,
  runPhoneRoleUniquenessProbes,
} from '../helpers/phoneRoleUniquenessProbes';

describe('BC-QA-051: "User" (phone, role) uniqueness must remain PARTIAL', () => {
  let pool: Pool;
  let results: ProbeResult[];
  let indexDefs: string[];

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // One dedicated connection: the probes drive BEGIN/ROLLBACK and need session
    // affinity, which a Pool does not guarantee per statement.
    const client = await pool.connect();
    try {
      results = await runPhoneRoleUniquenessProbes(client, 'public');
      indexDefs = await readUserUniqueIndexDefs(client, 'public');
    } finally {
      client.release();
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  const resultFor = (id: string): ProbeResult => {
    const r = results.find((x) => x.id === id);
    if (!r) throw new Error(`no probe result for ${id}`);
    return r;
  };

  // ── The invariant whose loss took production down ──────────────────────────
  describe.each(BLANK_COEXISTENCE_PROBE_IDS)('blank-phone coexistence: %s', (probeId) => {
    it('accepts both rows', () => {
      const r = resultFor(probeId);
      expect(`${r.id}: ${r.detail}`).toBe(`${r.id}: both rows inserted, as required`);
    });
  });

  // ── The invariants that stop the pin being satisfied by deleting the index ──
  it('rejects a duplicate NON-blank (phone, role) with SQLSTATE 23505', () => {
    const r = resultFor(PROBE_IDS.NONBLANK_DUP_REJECT);
    expect(`${r.id}: ${r.detail}`).toContain('rejected with 23505');
  });

  it('accepts the same non-blank phone under two different roles', () => {
    const r = resultFor(PROBE_IDS.NONBLANK_CROSSROLE);
    expect(`${r.id}: ${r.detail}`).toBe(`${r.id}: both rows inserted, as required`);
  });

  // ── Roll-up: report every violation at once, with index context ─────────────
  it('satisfies every (phone, role) uniqueness invariant', () => {
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      throw new Error(formatProbeReport(results, indexDefs));
    }
    expect(failed).toEqual([]);
  });

  // ── One deliberate name assertion, and why it is not "spelling" ─────────────
  // src/services/auth.service.ts's isPhoneRoleUniqueViolation() matches P2002
  // payloads on the literal string 'User_phone_role_key'. That makes the index NAME
  // an application-visible contract, not cosmetics: renaming the index silently
  // downgrades a would-be 409 to a 500. Postgres reports the INDEX name in 23505
  // exactly as it does a constraint name, so the name the app needs is the name the
  // database emits — and this asserts the emitted one, not a string in a schema file.
  it('reports the constraint name the application matches on', () => {
    const r = resultFor(PROBE_IDS.NONBLANK_DUP_REJECT);
    expect(r.constraint).toBe(PHONE_ROLE_INDEX_NAME);
  });
});
