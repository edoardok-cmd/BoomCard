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
--   DETAIL: Key (phone, role)=(+359XXXXXXXXX, USER) already exists.
-- (+359XXXXXXXXX throughout this file is a non-dialable stand-in. Do not paste
-- a real number into a comment here: this repository is public and source is
-- permanent, which is strictly worse than the log exposure this file's own
-- redaction rule exists to prevent.)
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
-- with an actionable message instead of a bare 23505 naming one arbitrary
-- row. It does not make the migration idempotent and is not a substitute for
-- running the dedupe.
--
-- ============================================================================
-- THE PRE-FLIGHT MESSAGE MUST NOT CONTAIN CUSTOMER DATA
-- ============================================================================
-- The first version of this rewrite built its abort message with
-- `format('phone=%L role=%s (rows=%s)', "phone", "role", cnt)` over up to 50
-- groups — i.e. it printed real customers' phone numbers. That was survivable
-- while migrations ran inside the app machine's start command, where stderr
-- only reached Fly's log stream (which needs a Fly token to read).
--
-- It is NOT survivable now. The ops half of BC-QA-051 moved migrations to
-- `fly.toml [deploy] release_command`. `flyctl deploy` streams the release
-- command's own output into the CD step's stdout — that is how an operator
-- learns why a release aborted — and .github/workflows/deploy-fly.yml runs on
-- `push` to `master` under `paths: ['backend-api/**']`, which this very
-- migration matches. The repository (edoardok-cmd/BoomCard) is PUBLIC, so
-- Actions logs are world-readable with no authentication and are retained for
-- 90 days. Merging before the dedupe has run IS therefore the leak path, and
-- that is the default ordering, not an exotic one.
--
-- (The same review round also had the workflow dumping `flyctl logs` on
-- failure. That step was removed in the companion ops commit — see the long
-- comment above "Dump Fly diagnostics on failure" in deploy-fly.yml. The
-- release_command path above is independent of it and is the one this file
-- has to defend against: the guard's own message is the payload there.)
--
-- Therefore: this message reports COUNTS and ROLES only. `UserRole` is a
-- fixed enum of five values and carries no personal data; a group count and a
-- row count carry none either. The operator has database access by
-- definition — anyone able to act on this message can run the SELECT it
-- names — so withholding the values costs nothing operationally. The values
-- also remain available locally from the dedupe script's own plan output.
--
-- RULE FOR ANY FUTURE EDIT OF THIS FILE: nothing that can reach `RAISE`,
-- `RAISE NOTICE`, or a Postgres error DETAIL may carry a phone, an email, a
-- name or a user id. Aggregate over them instead.
--
-- Race note — CLOSED by the LOCK TABLE below, and it had to be.
-- The earlier version of this file observed that the pre-flight SELECT takes
-- no lock, so a row committed between the check and the CREATE INDEX would
-- make the index build fail 23505, and dismissed that as "safe, just less
-- legible". That dismissal was wrong, for a reason the rest of this header
-- already spells out: a 23505 from CREATE UNIQUE INDEX carries the colliding
-- values in its DETAIL line —
--   DETAIL: Key (phone, role)=(+359XXXXXXXXX, USER) is duplicated.
-- — and `prisma migrate deploy` prints that DETAIL, twice (once as `DETAIL:`
-- and again inside the `DbError { … detail: Some(…) }` struct it dumps). Under
-- `release_command` that lands in the PUBLIC Actions log. So the race was not
-- merely inelegant; it was a second, unguarded path to exactly the leak the
-- redacted RAISE above exists to prevent, and the guard cannot help because it
-- has already passed by then.
--
-- `LOCK TABLE "User" IN SHARE MODE` as the very first statement closes it.
-- SHARE conflicts with ROW EXCLUSIVE (INSERT/UPDATE/DELETE) but not with other
-- SHARE holders or with readers, so it blocks writers for the rest of the
-- transaction while leaving reads alone — and CREATE INDEX takes SHARE anyway,
-- so this acquires the same lock a few statements earlier and holds it across
-- the pre-flight. Cost: nothing. After it, the state the pre-flight inspects is
-- the state the index build sees, so the build cannot discover a duplicate the
-- check did not.
--
-- In the production apply the window is empty regardless (the API is not
-- running during release_command, so there are no writers) — but the previous
-- release IS still serving while release_command runs, so writers are live in
-- the general case, and this file must not depend on the app being down.
--
-- NOT CLOSED HERE, and worth knowing before step 5: the same channel is open in
-- 20260819120100_backfill_and_constrain_payment_provider, whose two
-- `ALTER TABLE … ADD CONSTRAINT … UNIQUE` statements would print
-- `Key (paymentProvider, providerOrderId)=(…)` on failure. `migrate deploy`
-- applies it in the same release. Measured read-only against production
-- 2026-08-20: zero duplicate providerOrderId groups, so it cannot fire today.
-- Left alone deliberately — that file belongs to BC-MYPOS-004's surface, not to
-- this outage repair; the remedy is the same one line at the top of it.

-- Hold "User" still for the whole migration: the pre-flight below and the index
-- build at the end must see the same rows, or a raced duplicate reaches the
-- public release log through Postgres's own 23505 DETAIL. See "Race note" above.
-- SHARE blocks writers, admits readers, and is the same lock CREATE INDEX takes.
LOCK TABLE "User" IN SHARE MODE;

DO $$
DECLARE
  conflict_groups integer;
  conflict_rows   integer;
  role_breakdown  text;
BEGIN
  -- Counts and roles only. See "THE PRE-FLIGHT MESSAGE MUST NOT CONTAIN
  -- CUSTOMER DATA" above before adding anything to this block.
  SELECT count(*), coalesce(sum(cnt), 0)
  INTO conflict_groups, conflict_rows
  FROM (
    SELECT count(*) AS cnt
    FROM "User"
    WHERE btrim("phone") <> ''
    GROUP BY "phone", "role"
    HAVING count(*) > 1
  ) dupes;

  IF conflict_groups > 0 THEN
    SELECT string_agg(format('%s: %s group(s)/%s row(s)', "role", groups, rows_in_role), ', '
                      ORDER BY "role")
    INTO role_breakdown
    FROM (
      SELECT "role", count(*) AS groups, sum(cnt) AS rows_in_role
      FROM (
        SELECT "role", count(*) AS cnt
        FROM "User"
        WHERE btrim("phone") <> ''
        GROUP BY "phone", "role"
        HAVING count(*) > 1
      ) g
      GROUP BY "role"
    ) by_role;

    RAISE EXCEPTION
      'BC-QA-051: cannot create partial unique index "User_phone_role_key" — % non-blank (phone, role) group(s) covering % row(s) still collide. Colliding VALUES are deliberately omitted from this message: it can surface in a PUBLIC CI log via fly.toml release_command. Breakdown by role: %. To see the offending rows, query the database directly: SELECT phone, role, count(*) FROM "User" WHERE btrim(phone) <> '''' GROUP BY 1, 2 HAVING count(*) > 1; Then run backend-api/prisma/scripts/bc-qa-051-dedupe-phone-role.js (trial mode first) against this database and re-run migrate deploy.',
      conflict_groups, conflict_rows, role_breakdown;
  END IF;
END $$;

-- CreateIndex (partial unique — blank phones excluded; see header)
CREATE UNIQUE INDEX "User_phone_role_key"
  ON "User" ("phone", "role")
  WHERE btrim("phone") <> '';
