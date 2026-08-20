/**
 * BC-QA-051 — TEETH-PROOF for user-phone-role-partial-unique.test.ts.
 *
 * A pin that has never been observed to fail is not a pin. This file constructs the
 * ACTUAL regression — a TOTAL `UNIQUE ("phone", "role")` in place of the partial one,
 * i.e. byte-for-byte the constraint shape that caused the ~10-day BC-QA-051 production
 * outage — and asserts that the IDENTICAL probe module the standing test uses goes RED
 * against it and GREEN against the correct schema. It therefore also guards the probe
 * module itself: gut the probes and this file fails, so the standing test cannot be
 * silently disarmed into a green no-op.
 *
 * It does this against a real Postgres, not a simulation:
 *
 *   1. Create a randomly-named scratch schema in the test database and run
 *      `prisma migrate deploy` into it (the two-step scratch-schema convention
 *      documented on `createScratchSchemaClient` in src/lib/prisma.ts and already
 *      used by tests/unit/prisma.scratchSchema.test.ts). That gives a genuine
 *      migrated copy of `"User"`, partial index included.
 *   2. Probes must be GREEN.
 *   3. Replace the partial index with a total one — the regression.
 *   4. Probes must be RED, and specifically red on the blank-phone coexistence
 *      invariants, with the duplicate-rejection invariant still green (a total unique
 *      index rejects blank collisions AND non-blank ones; only the blank half is the
 *      defect).
 *   5. Restore the partial index. Probes must be GREEN again — which shows step 4's
 *      red came from the index shape and nothing else.
 *
 * The scratch schema is dropped in afterAll and its name is randomised per run, so
 * this is safe to re-run and safe alongside concurrent test runs. It never touches
 * `public`.
 */

import { execSync } from 'child_process';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import {
  PROBE_IDS,
  TOTAL_BTRIM_UNIQUE_REGRESSION_PROBE_IDS,
  TOTAL_UNIQUE_REGRESSION_PROBE_IDS,
  ProbeResult,
  formatProbeReport,
  readUserUniqueIndexDefs,
  runPhoneRoleUniquenessProbes,
} from '../helpers/phoneRoleUniquenessProbes';

const SCHEMA = `bcqa051_teeth_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;

const withSchema = (url: string, schema: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}schema=${schema}`;

describe('BC-QA-051 teeth: the partial-unique pin actually fails on the real regression', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    const baseUrl = process.env.DATABASE_URL as string; // pinned by tests/setup.ts
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: withSchema(baseUrl, SCHEMA) },
    });
    pool = new Pool({ connectionString: baseUrl });
    client = await pool.connect();
  }, 180_000);

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      client.release();
    }
    await pool?.end();
  });

  const report = async (): Promise<{ results: ProbeResult[]; text: string }> => {
    const results = await runPhoneRoleUniquenessProbes(client, SCHEMA);
    const defs = await readUserUniqueIndexDefs(client, SCHEMA);
    return { results, text: formatProbeReport(results, defs) };
  };

  it('step 1 — GREEN against the migrated schema (partial unique index)', async () => {
    const { results, text } = await report();
    const failed = results.filter((r) => !r.ok);
    if (failed.length) throw new Error(`expected all probes to pass, got:\n${text}`);
    expect(failed).toEqual([]);
  });

  it('step 2 — RED once the index is recreated TOTAL (the outage shape)', async () => {
    // The regression, exactly as a careless refactor would produce it: the plain
    // `@@unique([phone, role])` that `prisma migrate dev` emits when the `where:`
    // clause is dropped from schema.prisma is a DROP + total-unique recreate under
    // the same name. Nothing else about the schema changes.
    await client.query(`DROP INDEX "${SCHEMA}"."User_phone_role_key"`);
    await client.query(
      `CREATE UNIQUE INDEX "User_phone_role_key" ON "${SCHEMA}"."User" ("phone", "role")`,
    );

    const { results, text } = await report();
    const failedIds = results.filter((r) => !r.ok).map((r) => r.id);

    // The blank-phone coexistence invariants a raw total index breaks — the outage.
    // NB this is two of the three blank probes, not all three: a total index over the
    // RAW columns keys on stored text, and '' and '  ' are different text, so
    // BLANK_MIXED_COEXIST survives it. That was measured here, not assumed — step 2b
    // below is the regression BLANK_MIXED_COEXIST does catch.
    expect(failedIds.sort()).toEqual([...TOTAL_UNIQUE_REGRESSION_PROBE_IDS].sort());

    // ...and the non-blank invariants must still hold, which is what shows the probes
    // are discriminating between "uniqueness is too broad" and "uniqueness is gone".
    expect(results.find((r) => r.id === PROBE_IDS.NONBLANK_DUP_REJECT)?.ok).toBe(true);
    expect(results.find((r) => r.id === PROBE_IDS.NONBLANK_CROSSROLE)?.ok).toBe(true);

    // The failure text an engineer would actually read must name the cause.
    expect(text).toContain('BC-QA-051 outage shape');
    expect(text).toContain('BLANK_EMPTY_COEXIST');
  });

  it('step 2b — RED on the btrim-expression variant of the same mistake', async () => {
    // The other shape this can regress into: a total unique over the EXPRESSION
    // (btrim(phone), role). Someone "fixing" the whitespace case by normalising
    // inside the index instead of excluding blanks from it produces exactly this,
    // and it is the same outage — every blank spelling collapses to one key, so all
    // 134 blank-phone production rows collide.
    await client.query(`DROP INDEX "${SCHEMA}"."User_phone_role_key"`);
    await client.query(
      `CREATE UNIQUE INDEX "User_phone_role_key" ON "${SCHEMA}"."User" (btrim("phone"), "role")`,
    );

    const { results } = await report();
    const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
    expect(failedIds.sort()).toEqual([...TOTAL_BTRIM_UNIQUE_REGRESSION_PROBE_IDS].sort());
  });

  it('step 3 — GREEN again once the partial predicate is restored', async () => {
    await client.query(`DROP INDEX "${SCHEMA}"."User_phone_role_key"`);
    await client.query(
      `CREATE UNIQUE INDEX "User_phone_role_key" ON "${SCHEMA}"."User" ("phone", "role")
         WHERE btrim("phone") <> ''`,
    );

    const { results, text } = await report();
    const failed = results.filter((r) => !r.ok);
    if (failed.length) throw new Error(`expected all probes to pass again, got:\n${text}`);
    expect(failed).toEqual([]);
  });

  it('step 4 — RED if the uniqueness rule is dropped altogether', async () => {
    // The complementary regression: "make the blank probes pass" must not be
    // achievable by simply deleting the index. Restored immediately afterwards so
    // this test leaves the schema in the correct state for anything added later.
    await client.query(`DROP INDEX "${SCHEMA}"."User_phone_role_key"`);
    try {
      const { results } = await report();
      const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
      expect(failedIds).toEqual([PROBE_IDS.NONBLANK_DUP_REJECT]);
    } finally {
      await client.query(
        `CREATE UNIQUE INDEX "User_phone_role_key" ON "${SCHEMA}"."User" ("phone", "role")
           WHERE btrim("phone") <> ''`,
      );
    }
  });
});
