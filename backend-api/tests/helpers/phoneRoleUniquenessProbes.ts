/**
 * BC-QA-051 — behavioural probes for the `(phone, role)` uniqueness rule on `"User"`.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-10 the migration `20260810160000_add_user_phone_role_unique` added a
 * BLANKET `UNIQUE ("phone", "role")` to `"User"`. `"User"."phone"` is NOT NULL and
 * "no phone on file" is represented in this database by the EMPTY STRING — which,
 * unlike NULL, is not distinct from itself. 134 of 231 production rows sit in that
 * blank bucket (real end users, partners, 3 of 4 SUPER_ADMINs), so the constraint was
 * unsatisfiable, `prisma migrate deploy` exited 1, and because deploy was chained into
 * the Fly start command with `&&`, the API never started: a ~10-day outage.
 *
 * The repair replaces it with a PARTIAL unique index that excludes blank phones:
 *
 *     CREATE UNIQUE INDEX "User_phone_role_key"
 *       ON "User" ("phone", "role") WHERE btrim("phone") <> '';
 *
 * Nothing executable pinned that predicate. A future refactor that simplifies
 * `schema.prisma`'s attribute back to a plain `@@unique([phone, role])`, or a
 * later migration that recreates the index without its `WHERE`, would pass CI
 * silently — CI runs `prisma migrate deploy` against a FRESH Postgres where a
 * total unique constraint applies perfectly cleanly. The defect only manifests
 * against data that contains blank phones, which is exactly the data CI never has.
 * The warning comments in `schema.prisma` and in the migration were the only thing
 * standing between this codebase and a repeat of the outage, and a comment is not
 * a test.
 *
 * WHAT THESE PROBES PIN — BEHAVIOUR, NOT SPELLING
 * -----------------------------------------------
 * Every probe below is a real INSERT against a real Postgres. They therefore keep
 * working if the index is renamed, if the predicate is written differently
 * (`btrim(phone) <> ''` vs `length(btrim(phone)) > 0` vs `phone !~ '^\\s*$'`), if the
 * rule moves from `schema.prisma` into a hand-written migration, or if it is
 * expressed as a constraint trigger instead of an index. A test that asserted the
 * literal text of a schema line or of a comment would pass while the database did
 * something different — which is precisely the failure mode that produced the outage.
 *
 * The four invariants:
 *
 *   BLANK_EMPTY_COEXIST  Two rows with phone = ''    and the same role must coexist.
 *   BLANK_WS_COEXIST     Two rows with phone = '   ' and the same role must coexist.
 *                        (`btrim`, not `= ''`: a whitespace-only phone is blank too.)
 *   BLANK_MIXED_COEXIST  '' and '  ' under the same role must coexist — they are
 *                        both blank under `btrim`, so neither is indexed.
 *   NONBLANK_DUP_REJECT  Two rows with the same NON-blank phone and the same role
 *                        must be rejected by the database (SQLSTATE 23505).
 *   NONBLANK_CROSSROLE   The same non-blank phone under two DIFFERENT roles is fine.
 *
 * The first three are the property whose loss took production down. The last two are
 * what stops the pin from being satisfied by simply deleting the index altogether.
 *
 * ISOLATION AND RE-RUNNABILITY
 * ----------------------------
 * Each probe runs inside its own transaction which is ALWAYS rolled back, so the
 * suite commits nothing, leaves no residue, and can be re-run against the same
 * database indefinitely. Row ids / emails additionally carry a per-probe nonce so a
 * probe cannot collide with a pre-existing row (or with a concurrently running copy
 * of this suite) even in the window before its rollback.
 *
 * SYNTHETIC DATA ONLY: phone fixtures use the non-allocated Bulgarian national
 * prefix `000`, so they are not dialable and cannot be anyone's number. This
 * repository is public — never paste production data into a fixture.
 */

/**
 * Minimal structural view of a `pg` connection. Deliberately NOT typed as
 * `pg.PoolClient`: `@types/pg` is not installed in this repo, and the probes only
 * need `query`. Callers must pass a SINGLE dedicated connection (a `PoolClient`
 * from `pool.connect()`, or a `Client`) — never a `Pool`, because BEGIN/ROLLBACK
 * require session affinity and a Pool may route each statement to a different
 * backend.
 */
export interface SqlExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ProbeResult {
  /** Stable invariant id, safe to assert on. */
  id: string;
  /** Human-readable statement of the invariant, quoted into failure output. */
  invariant: string;
  ok: boolean;
  /** What actually happened, including the SQLSTATE when the database refused. */
  detail: string;
  /** For NONBLANK_DUP_REJECT: the constraint name Postgres reported on 23505. */
  constraint?: string;
}

export const PROBE_IDS = {
  BLANK_EMPTY_COEXIST: 'BLANK_EMPTY_COEXIST',
  BLANK_WS_COEXIST: 'BLANK_WS_COEXIST',
  BLANK_MIXED_COEXIST: 'BLANK_MIXED_COEXIST',
  NONBLANK_DUP_REJECT: 'NONBLANK_DUP_REJECT',
  NONBLANK_CROSSROLE: 'NONBLANK_CROSSROLE',
} as const;

/** The probes whose failure IS the BC-QA-051 outage shape. */
export const BLANK_COEXISTENCE_PROBE_IDS: string[] = [
  PROBE_IDS.BLANK_EMPTY_COEXIST,
  PROBE_IDS.BLANK_WS_COEXIST,
  PROBE_IDS.BLANK_MIXED_COEXIST,
];

/**
 * The subset of the blank-coexistence family that a TOTAL, predicate-less unique
 * index on the RAW `(phone, role)` columns actually breaks — i.e. the exact
 * regression that caused the outage.
 *
 * BLANK_MIXED_COEXIST is deliberately NOT in this list, and the reason was measured
 * rather than assumed (the teeth-proof asserted all three and went red on this one):
 * a total unique index over the raw columns keys on the stored text, and `''` and
 * `'  '` are different text, so those two rows coexist under it perfectly well. The
 * probe is not redundant, though — it is the one that catches the OTHER way this rule
 * can regress, a total unique over the EXPRESSION `(btrim(phone), role)`, which
 * collapses every blank spelling into one key. See
 * TOTAL_BTRIM_UNIQUE_REGRESSION_PROBE_IDS.
 */
export const TOTAL_UNIQUE_REGRESSION_PROBE_IDS: string[] = [
  PROBE_IDS.BLANK_EMPTY_COEXIST,
  PROBE_IDS.BLANK_WS_COEXIST,
];

/**
 * What a total unique index over `(btrim(phone), role)` breaks: all three blank
 * spellings collapse to one key, so every pairing of blanks collides.
 */
export const TOTAL_BTRIM_UNIQUE_REGRESSION_PROBE_IDS: string[] = [
  PROBE_IDS.BLANK_EMPTY_COEXIST,
  PROBE_IDS.BLANK_WS_COEXIST,
  PROBE_IDS.BLANK_MIXED_COEXIST,
];

/** Index name the application keys on (src/services/auth.service.ts). */
export const PHONE_ROLE_INDEX_NAME = 'User_phone_role_key';

/**
 * Guard schema names before interpolating them into DDL/DML. Mirrors
 * `assertSafeSchemaName` in src/lib/prisma.ts. Schema names come from test code
 * here, never from user input, but interpolating an unvalidated identifier into
 * SQL is the kind of habit that escapes its original context.
 */
function assertSafeSchemaName(schema: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(
      `phoneRoleUniquenessProbes: "${schema}" is not a safe unquoted Postgres identifier.`,
    );
  }
}

function nonce(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Obviously-synthetic, non-dialable phone number. `000` is not an allocated
 * Bulgarian national prefix, so this cannot collide with a real subscriber.
 */
function syntheticPhone(): string {
  const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  return `+35900000${digits}`;
}

function errCode(err: unknown): string {
  return String((err as { code?: unknown })?.code ?? 'no-sqlstate');
}

function errConstraint(err: unknown): string | undefined {
  const c = (err as { constraint?: unknown })?.constraint;
  return typeof c === 'string' ? c : undefined;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface FixtureRow {
  suffix: string;
  phone: string;
  role: string;
}

async function insertUser(db: SqlExecutor, schema: string, n: string, row: FixtureRow): Promise<void> {
  // Column list is the NOT NULL / no-default set of "User" plus role. Everything
  // else takes its schema default, so this INSERT survives new nullable columns.
  await db.query(
    `INSERT INTO "${schema}"."User"
       (id, email, "passwordHash", "firstName", "lastName", phone, role, "updatedAt")
     VALUES ($1, $2, 'bc-qa-051-not-a-real-hash', 'BCQA051', 'Fixture', $3, $4, now())`,
    [`bcqa051-${n}-${row.suffix}`, `bcqa051-${n}-${row.suffix}@example.invalid`, row.phone, row.role],
  );
}

/**
 * Run `fn` inside a transaction that is ALWAYS rolled back. Nothing a probe writes
 * is ever committed, which is what makes this suite re-runnable against a shared
 * database without ON CONFLICT juggling or an afterAll cleanup that can be skipped.
 */
async function inRolledBackTransaction<T>(db: SqlExecutor, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    return await fn();
  } finally {
    // ROLLBACK is valid even when the transaction is already in the aborted state
    // that a failed INSERT leaves behind, so this runs unconditionally.
    await db.query('ROLLBACK');
  }
}

/**
 * Two rows whose phones are both BLANK, under the same role, must coexist.
 * This is the invariant a total `UNIQUE (phone, role)` destroys.
 */
async function coexistenceProbe(
  db: SqlExecutor,
  schema: string,
  id: string,
  invariant: string,
  phones: [string, string],
  role: string,
): Promise<ProbeResult> {
  const n = nonce();
  return inRolledBackTransaction(db, async () => {
    await insertUser(db, schema, n, { suffix: 'a', phone: phones[0], role });
    try {
      await insertUser(db, schema, n, { suffix: 'b', phone: phones[1], role });
      return { id, invariant, ok: true, detail: 'both rows inserted, as required' };
    } catch (err) {
      return {
        id,
        invariant,
        ok: false,
        constraint: errConstraint(err),
        detail:
          `the SECOND row was REJECTED (SQLSTATE ${errCode(err)}` +
          `${errConstraint(err) ? `, constraint "${errConstraint(err)}"` : ''}): ${errMessage(err)}. ` +
          'This is exactly the BC-QA-051 outage shape: uniqueness on (phone, role) is being ' +
          'applied to blank phones, so every production account with no phone on file ' +
          'collides and `prisma migrate deploy` cannot apply against real data.',
      };
    }
  });
}

/** The same NON-blank phone twice under the same role must be refused by the database. */
async function duplicateRejectedProbe(db: SqlExecutor, schema: string): Promise<ProbeResult> {
  const n = nonce();
  const phone = syntheticPhone();
  const id = PROBE_IDS.NONBLANK_DUP_REJECT;
  const invariant = 'two rows with the same NON-blank phone and the same role must be rejected';
  return inRolledBackTransaction(db, async () => {
    await insertUser(db, schema, n, { suffix: 'a', phone, role: 'USER' });
    try {
      await insertUser(db, schema, n, { suffix: 'b', phone, role: 'USER' });
      return {
        id,
        invariant,
        ok: false,
        detail:
          'the duplicate was ACCEPTED — (phone, role) uniqueness is not enforced at all. ' +
          'The partial index is missing, disabled, or its predicate no longer matches ' +
          'non-blank phones.',
      };
    } catch (err) {
      const code = errCode(err);
      if (code !== '23505') {
        return {
          id,
          invariant,
          ok: false,
          detail: `rejected, but with SQLSTATE ${code} instead of 23505: ${errMessage(err)}`,
        };
      }
      return {
        id,
        invariant,
        ok: true,
        constraint: errConstraint(err),
        detail: `rejected with 23505 on constraint "${errConstraint(err) ?? '(unnamed)'}", as required`,
      };
    }
  });
}

/** The same non-blank phone under two DIFFERENT roles must be accepted. */
async function crossRoleProbe(db: SqlExecutor, schema: string): Promise<ProbeResult> {
  const n = nonce();
  const phone = syntheticPhone();
  const id = PROBE_IDS.NONBLANK_CROSSROLE;
  const invariant = 'the same non-blank phone under two different roles must be accepted';
  return inRolledBackTransaction(db, async () => {
    await insertUser(db, schema, n, { suffix: 'a', phone, role: 'USER' });
    try {
      await insertUser(db, schema, n, { suffix: 'b', phone, role: 'PARTNER' });
      return { id, invariant, ok: true, detail: 'both rows inserted, as required' };
    } catch (err) {
      return {
        id,
        invariant,
        ok: false,
        detail:
          `the PARTNER row was REJECTED (SQLSTATE ${errCode(err)}): ${errMessage(err)}. ` +
          'Uniqueness has been widened to phone alone — a partner and their personal ' +
          'user account share a phone by design.',
      };
    }
  });
}

/**
 * Run every invariant probe against `<schema>."User"`. Returns one result per
 * invariant, in a stable order. Never throws for a violated invariant — a violation
 * is data in the returned array, so a caller can report ALL failures at once
 * instead of only the first.
 */
export async function runPhoneRoleUniquenessProbes(
  db: SqlExecutor,
  schema = 'public',
): Promise<ProbeResult[]> {
  assertSafeSchemaName(schema);
  return [
    await coexistenceProbe(
      db,
      schema,
      PROBE_IDS.BLANK_EMPTY_COEXIST,
      "two rows with phone = '' and the same role must coexist",
      ['', ''],
      'USER',
    ),
    await coexistenceProbe(
      db,
      schema,
      PROBE_IDS.BLANK_WS_COEXIST,
      "two rows with a whitespace-only phone and the same role must coexist (btrim, not = '')",
      ['   ', '   '],
      'PARTNER',
    ),
    await coexistenceProbe(
      db,
      schema,
      PROBE_IDS.BLANK_MIXED_COEXIST,
      "phone = '' and phone = '  ' under the same role must coexist — both are blank under btrim",
      ['', '  '],
      'ADMIN',
    ),
    await duplicateRejectedProbe(db, schema),
    await crossRoleProbe(db, schema),
  ];
}

/**
 * Read the unique-index definitions on `<schema>."User"`.
 *
 * JUDGEMENT — this is DIAGNOSTIC CONTEXT, NOT AN ASSERTION, and deliberately so.
 * Asserting the literal `indexdef` text would add nothing on top of the probes above
 * (they already fail on any index that is total rather than partial, and on any index
 * that is missing) while being strictly more brittle: it would break on a rename, on
 * `btrim(phone) <> ''` being re-spelled as an equivalent predicate, on a Postgres
 * upgrade that reformats `pg_get_indexdef` output, and on the rule being moved to a
 * constraint trigger — none of which are regressions. Worse, it would pin the
 * SPELLING while the behaviour drifted, which is the exact failure mode that produced
 * this outage (a warning comment nobody could execute). So the definitions are read
 * only to enrich the failure message: when a probe goes red, the first question an
 * engineer asks is "what does the index look like now", and this answers it inline.
 */
export async function readUserUniqueIndexDefs(db: SqlExecutor, schema = 'public'): Promise<string[]> {
  assertSafeSchemaName(schema);
  const res = await db.query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = $1 AND tablename = 'User' AND indexdef ILIKE 'CREATE UNIQUE%'
      ORDER BY indexname`,
    [schema],
  );
  return res.rows.map((r) => String(r.indexdef));
}

/** Render probe results + index context into a single readable assertion message. */
export function formatProbeReport(results: ProbeResult[], indexDefs: string[]): string {
  const lines = results.map(
    (r) => `  [${r.ok ? 'PASS' : 'FAIL'}] ${r.id}: ${r.invariant}\n         -> ${r.detail}`,
  );
  return [
    'BC-QA-051 (phone, role) uniqueness invariants:',
    ...lines,
    '',
    'Unique indexes currently on "User" (diagnostic context, not asserted):',
    ...(indexDefs.length ? indexDefs.map((d) => `  ${d}`) : ['  (none)']),
    '',
    'If a BLANK_* probe failed: the (phone, role) uniqueness rule has stopped being',
    'PARTIAL. Restore the `WHERE btrim("phone") <> \'\'` predicate — see',
    'prisma/migrations/20260810160000_add_user_phone_role_unique/migration.sql.',
  ].join('\n');
}
