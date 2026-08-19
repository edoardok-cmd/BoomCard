-- BC-QA-032: Enforce phone+role uniqueness on "User", mirroring the existing
-- (email, role) shape exactly — the same phone number may register under
-- each role separately (USER/PARTNER/ADMIN), but not twice under the same
-- role. Backs AuthService.register's new duplicate-phone guard and the
-- AUTH_PHONE_ALREADY_REGISTERED error code the frontend mapping table
-- (BC-QA-004) already expects.
--
-- BACKFILL / SAFETY STRATEGY FOR THIS NON-EMPTY, ACTIVELY-WRITTEN TABLE
-- ------------------------------------------------------------------
-- 1. Pre-flight duplicate check (below): before attempting to add the
--    constraint we scan for any existing (phone, role) pairs that would
--    violate it (phone IS NOT NULL only — Postgres unique indexes treat
--    every NULL as distinct, so rows with no phone on file never collide
--    with each other). If any are found, this migration RAISES an
--    exception and ABORTS *before* touching the constraint, naming the
--    exact colliding (phone, role) pairs and their row count so an
--    operator can decide how to dedupe (e.g. null out the stale/duplicate
--    phone on the older account) and re-run. We do NOT silently drop or
--    null out any pre-existing row ourselves.
-- 2. As of this writing there is no phone-uniqueness enforcement anywhere
--    in the codebase (that gap is exactly what BC-QA-032 exists to close),
--    so we cannot assume the data already satisfies the constraint the way
--    we could for, say, a column whose only writer already deduplicates.
--    Hence the explicit pre-flight check rather than assuming the table is
--    clean.
--
-- ROUND-2 CORRECTION — CONCURRENTLY dropped, ACCESS EXCLUSIVE LOCK ACCEPTED
-- ------------------------------------------------------------------
-- The original version of this migration used
-- `CREATE UNIQUE INDEX CONCURRENTLY` (no `ACCESS EXCLUSIVE` table lock)
-- followed by `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE USING INDEX`, on
-- the claimed premise that "Since Prisma ORM 4.7+, `prisma migrate`
-- detects `CREATE INDEX CONCURRENTLY` in a migration file and
-- automatically applies that migration WITHOUT wrapping it in a
-- transaction." THAT CLAIM IS FALSE for this repo's actual installed
-- version (`prisma@^7.7.0`): verified empirically by running
-- `npx prisma migrate deploy` against a real scratch schema, which failed
-- with `P3018: ERROR: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block` — `prisma migrate deploy` wraps every migration.sql
-- file in a single transaction regardless of its contents, and Prisma
-- provides no per-migration opt-out of that wrapping. There is no
-- documented mechanism in this Prisma version to run a genuinely
-- non-transactional statement as part of the ordinary `migrate deploy`
-- pipeline (this is a long-standing, still-open upstream limitation, not
-- something specific to this migration).
--
-- Given that, this migration now does a single plain, transactional
-- `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE (...)`, which takes an
-- `ACCESS EXCLUSIVE` lock on "User" for the duration of the constraint's
-- validation scan (it must read the whole table once to prove no existing
-- row violates it) — reads AND writes against "User" block for that
-- window. This is the deliberate, disclosed tradeoff of the fallback
-- named in this task's own review as acceptable when no non-transactional
-- mechanism is available: the migration is fully deployable via the
-- standard `prisma migrate deploy` pipeline (which this repo's own test
-- harness, `tests/setup.ts`, runs on every `npm test`), at the cost of a
-- brief full-table exclusive lock in production. Given "User" is not yet
-- at a size where this scan is expected to take more than a few seconds,
-- and no other non-transactional path exists for this Prisma version,
-- this tradeoff is accepted here; schedule this migration for a low-
-- traffic deploy window if "User" has grown large enough for the lock
-- window to become user-visible.
--
-- Idempotency / re-run note: this migration is intentionally NOT
-- idempotent in the sense of being safe to apply twice (Prisma migrations
-- are one-shot by design — see CLAUDE.md db-engineer constraints). If the
-- pre-flight check aborts this migration, fix the offending rows and
-- re-run `prisma migrate deploy`; Prisma will retry this same migration
-- file since it was never recorded as applied.

DO $$
DECLARE
  conflict_count integer;
  conflict_report text;
BEGIN
  SELECT count(*) INTO conflict_count
  FROM (
    SELECT "phone", "role"
    FROM "User"
    WHERE "phone" IS NOT NULL
    GROUP BY "phone", "role"
    HAVING count(*) > 1
  ) dupes;

  IF conflict_count > 0 THEN
    SELECT string_agg(format('phone=%L role=%s (rows=%s)', "phone", "role", cnt), E'\n')
    INTO conflict_report
    FROM (
      SELECT "phone", "role", count(*) AS cnt
      FROM "User"
      WHERE "phone" IS NOT NULL
      GROUP BY "phone", "role"
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 50
    ) reported;

    RAISE EXCEPTION
      'BC-QA-032: cannot add @@unique([phone, role]) — % existing (phone, role) pair(s) already violate it (showing up to 50): %',
      conflict_count, conflict_report;
  END IF;
END $$;

-- AddConstraint (single transactional statement; takes ACCESS EXCLUSIVE for
-- the duration of the validation scan — see ROUND-2 CORRECTION note above)
ALTER TABLE "User" ADD CONSTRAINT "User_phone_role_key" UNIQUE ("phone", "role");
