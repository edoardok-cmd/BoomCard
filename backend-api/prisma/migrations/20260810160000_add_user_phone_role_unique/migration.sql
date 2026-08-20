-- BC-QA-032 / BC-QA-051: enforce (phone, role) uniqueness on "User" for rows
-- that actually carry a phone number.
--
-- ============================================================================
-- BC-QA-051 REWRITE (2026-08-20) — WHY THIS FILE WAS EDITED IN PLACE
-- ============================================================================
-- The previous version of this file shipped on 2026-08-10 and has been
-- FAILING in production ever since. Production's `_prisma_migrations` row for
-- this migration reads: finished_at IS NULL, rolled_back_at IS NULL,
-- applied_steps_count = 0 — i.e. it applied NOTHING; its pre-flight guard
-- raised and aborted the whole transaction. Because
-- `prisma migrate deploy` is chained into the Fly start command with `&&`
-- (fly.toml `[processes] app`), the API process never started: a ~10-day
-- production outage, and the two later migrations
-- (20260819120000_add_payment_provider_columns and
-- 20260819120100_backfill_and_constrain_payment_provider) never applied.
--
-- Editing an applied migration in place is normally forbidden (Prisma
-- checksums migration files). It is sanctioned here because:
--   * In production this migration applied ZERO steps and is recorded as
--     FAILED, so there is no applied state to contradict. The operator
--     runbook resolves it `--rolled-back` first, after which Prisma re-runs
--     this file from scratch and records the NEW checksum.
--   * Verified empirically on prisma@7.7.0 (the version pinned in
--     backend-api/package.json): `prisma migrate deploy` does NOT verify
--     migration checksums. A database on which the OLD version of this file
--     applied successfully (a developer's local `boomcard_test`, which
--     tests/setup.ts re-deploys on every `npm test`) reports
--     "No pending migrations to apply." / "Database schema is up to date!"
--     and exit 0 after this file changes — it does not error on the
--     mismatch. CI (.github/workflows/admin-spec-sweeps.yml) runs against a
--     fresh Postgres service container each run, so it has no stored
--     checksum at all.
--   * `prisma migrate dev` (the developer-only path) DOES notice the edit.
--     Measured against a scratch database on which the old version had
--     applied successfully:
--       - The migration `20260810160000_add_user_phone_role_unique` was
--         modified after it was applied.
--       - Drift detected: … [-] Removed unique index on columns (phone, role)
--                            [+] Added unique index on columns (phone, role)
--       We need to reset the "public" schema …
--     That is the accepted cost, and it only affects a disposable local
--     database. Anyone who hits it should reset `boomcard_test` once
--     (`npm run db:reset`, or drop and recreate it) and move on. It does NOT
--     affect production or CI, neither of which runs `migrate dev`.
--
-- ============================================================================
-- WHAT WAS WRONG WITH THE PREVIOUS VERSION
-- ============================================================================
-- It added a BLANKET `UNIQUE ("phone", "role")` table constraint, guarded by a
-- pre-flight check whose header justified itself on NULL-distinctness:
-- "phone IS NOT NULL only — Postgres unique indexes treat every NULL as
-- distinct, so rows with no phone on file never collide with each other",
-- and advised an operator to "null out the stale/duplicate phone".
--
-- Both halves of that premise are false against this schema:
--   1. "User"."phone" is NOT NULL — in production AND in schema.prisma
--      (`phone String`, not `String?`). Zero production rows have a NULL
--      phone, and none can: nulling one out is rejected by the column.
--      NULL-distinctness therefore protects nothing here.
--   2. The way "no phone on file" is actually represented in this database is
--      the EMPTY STRING, and empty strings are NOT distinct from each other —
--      they collide like any other value. In production the '' bucket is 134
--      rows and is by far the largest colliding group. It holds real accounts:
--      every live ACTIVE partner, all three SUPER_ADMINs, and real end users.
--      A blanket unique on (phone, role) can never be satisfied without
--      mutating those rows.
--
-- ============================================================================
-- THE CONSTRAINT SHAPE THIS MIGRATION NOW CREATES
-- ============================================================================
-- A PARTIAL unique index that simply excludes blank phones:
--
--     UNIQUE ("phone", "role") WHERE btrim("phone") <> ''
--
-- This mutates zero rows in the '' bucket while still enforcing exactly the
-- rule the application wants. It is also the shape the application code
-- ALREADY implements: AuthService.register's duplicate-phone pre-check is
-- wrapped in `if (sanitizedPhone) { ... }` (src/services/auth.service.ts),
-- i.e. it deliberately does not treat a blank phone as colliding. Before this
-- rewrite the database and the application disagreed about that; now they
-- agree.
--
-- `btrim()` rather than `= ''` so a whitespace-only phone (' ') is treated as
-- blank too. (Production currently has 0 such rows — checked — but the app
-- does not forbid one.)
--
-- INDEX NAME IS DELIBERATELY UNCHANGED: "User_phone_role_key".
-- src/services/auth.service.ts:52 (`isPhoneRoleUniqueViolation`) matches
-- P2002 payloads on the literal string 'User_phone_role_key'. Postgres reports
-- the INDEX name in the 23505 error for a unique index exactly as it does for
-- a unique constraint, so the name that code needs is still the name the
-- database emits: verified against a scratch database, a partial-index
-- violation raises
--   ERROR: duplicate key value violates unique constraint "User_phone_role_key"
--   DETAIL: Key (phone, role)=(+359888123456, USER) already exists.
--
-- HOWEVER — measured, not assumed — on prisma@7.7.0 driving
-- @prisma/adapter-pg (this app's client, see src/lib/prisma.ts) the P2002
-- error object carries NO `meta.target` field at all; the constraint name
-- appears only inside `meta.driverAdapterError.cause.originalMessage`, with
-- `constraint.fields = ["phone","role"]` beside it. So
-- isPhoneRoleUniqueViolation() returns FALSE today. That is a PRE-EXISTING
-- defect, not something this migration introduces: the untouched TOTAL
-- @@unique([email, role]) produces exactly the same payload shape and
-- isEmailRoleUniqueViolation() is equally dead. Enforcement is unaffected
-- (the duplicate write is still rejected); only the 409 translation is.
-- Keeping the name is still the right call — it is what a repaired matcher
-- will key on.
--
-- A partial index cannot be a table CONSTRAINT (Postgres only supports
-- `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` over a total index), so this is
-- a standalone `CREATE UNIQUE INDEX`. Consequences:
--   * pg_constraint no longer has a "User_phone_role_key" row; pg_indexes
--     does. Nothing in this codebase reads pg_constraint.
--   * schema.prisma now declares the SAME partial index natively:
--         @@unique([phone, role], where: raw("btrim(phone) <> ''"))
--     using the `partialIndexes` preview feature, which this repo's generator
--     block already enables. That keeps schema and database in agreement:
--     `prisma migrate diff --from-empty --to-schema prisma/schema.prisma
--     --script` emits exactly the CREATE UNIQUE INDEX below, and diffing this
--     schema against a database in the post-fix state reports no change for
--     this index. Writing it as a plain `@@unique([phone, role])` instead
--     makes `migrate dev` generate a DROP + total-unique recreate — i.e. it
--     would re-create this outage. See the comment at that attribute.
--
-- ============================================================================
-- LOCKING / SAFETY UNDER CONCURRENT WRITES
-- ============================================================================
-- `prisma migrate deploy` (prisma@7.7.0) wraps every migration.sql in one
-- transaction and offers no per-migration opt-out, so `CREATE INDEX
-- CONCURRENTLY` is unavailable here. Re-verified for this rewrite rather than
-- inherited from the previous version's note: putting CONCURRENTLY on the
-- statement below and running `prisma migrate deploy` against a scratch
-- database gives
--     Error: P3018
--     ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
--
-- A plain `CREATE UNIQUE INDEX` takes a SHARE lock on "User": concurrent
-- READS continue, concurrent WRITES block for the duration of the build. That
-- is strictly less disruptive than the previous version's
-- `ALTER TABLE ... ADD CONSTRAINT`, which additionally takes ACCESS EXCLUSIVE
-- and blocks reads too. Measured on a scratch copy of this schema by holding
-- each statement open in a transaction and reading pg_locks for the backend:
--     CREATE UNIQUE INDEX …            -> ShareLock
--     ALTER TABLE … ADD CONSTRAINT …   -> AccessExclusiveLock + ShareLock
-- "User" is ~231 rows in production; the build is sub-millisecond.
--
-- Backfill strategy for this non-empty, actively-written table: there is NO
-- backfill in this file. The colliding rows are re-phoned OUT OF BAND, before
-- this migration runs, by
--   backend-api/prisma/scripts/bc-qa-051-dedupe-phone-role.js
-- (trial mode + before-image dump + executable rollback). That script is the
-- only thing that mutates data; this migration only adds an index. Splitting
-- them this way means the data fix is independently reviewable, independently
-- reversible, and can be run and verified while the app is still down —
-- rather than being an unreviewable UPDATE buried inside a migration
-- transaction.
--
-- The pre-flight check below is retained (scoped to the predicate the index
-- actually uses) purely so that a deploy attempted BEFORE the dedupe fails
-- with an enumerated, actionable message instead of a bare 23505 naming one
-- arbitrary row. It does not make the migration idempotent and is not a
-- substitute for running the dedupe.
--
-- Race note: the pre-flight SELECT does not itself lock "User", so in
-- principle a concurrent INSERT could introduce a new duplicate between the
-- check and the CREATE INDEX. That would make CREATE INDEX fail with 23505 —
-- safe (nothing is written), just less legible. In the production apply this
-- window does not exist at all: the API is not running, so there are no
-- writers.

DO $$
DECLARE
  conflict_count integer;
  conflict_report text;
BEGIN
  SELECT count(*) INTO conflict_count
  FROM (
    SELECT "phone", "role"
    FROM "User"
    WHERE btrim("phone") <> ''
    GROUP BY "phone", "role"
    HAVING count(*) > 1
  ) dupes;

  IF conflict_count > 0 THEN
    SELECT string_agg(format('phone=%L role=%s (rows=%s)', "phone", "role", cnt), E'\n')
    INTO conflict_report
    FROM (
      SELECT "phone", "role", count(*) AS cnt
      FROM "User"
      WHERE btrim("phone") <> ''
      GROUP BY "phone", "role"
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 50
    ) reported;

    RAISE EXCEPTION
      'BC-QA-051: cannot create partial unique index "User_phone_role_key" — % non-blank (phone, role) pair(s) still collide (showing up to 50). Run backend-api/prisma/scripts/bc-qa-051-dedupe-phone-role.js (trial mode first) against this database, then re-run migrate deploy. Colliding pairs: %',
      conflict_count, conflict_report;
  END IF;
END $$;

-- CreateIndex (partial unique — blank phones excluded; see header)
CREATE UNIQUE INDEX "User_phone_role_key"
  ON "User" ("phone", "role")
  WHERE btrim("phone") <> '';
