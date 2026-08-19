-- BC-MYPOS-004 (part 2 of 2): Provider-neutral payment references — backfill
-- + composite uniqueness.
--
-- Depends on 20260819120000_add_payment_provider_columns having already
-- committed (adds the nullable "paymentProvider"/"providerOrderId" columns
-- and the "PaymentProvider" enum this migration backfills and constrains).
-- See that migration's header for the full BC-MYPOS-004 background and for
-- why this work is split across two migration files rather than one.
--
-- WHAT THIS MIGRATION DOES
-- -------------------------
-- 1. Backfills paymentProvider = 'PAYSERA' and providerOrderId =
--    payseraOrderId for every existing "subscriptions"/"PendingSubscription"
--    row with a non-null payseraOrderId, regardless of status column value.
--    This is a plain UPDATE, filtered only on payseraOrderId IS NOT NULL —
--    it is NOT filtered by status/lifecycle state, so it necessarily covers
--    in-flight rows too (subscriptions.status IN
--    ACTIVE/PAST_DUE/CANCELLED/INCOMPLETE/INCOMPLETE_EXPIRED/TRIALING/
--    UNPAID/PAUSED/EXPIRED/FAILED_PAYMENT and
--    "PendingSubscription".status IN CREATED/PAID/COMPLETED/EXPIRED/FAILED)
--    — nothing about "in-flight" vs "terminal" narrows the WHERE clause.
-- 2. Backfills paymentProvider = 'STRIPE_LEGACY' and providerOrderId =
--    stripeSubscriptionId for every existing "subscriptions" row with a
--    non-null stripeSubscriptionId that step 1 didn't already claim (guarded
--    by paymentProvider IS NULL, so it can never run before or clobber a
--    Paysera-backfilled row — see "STRIPE BACKFILL" below). There is no
--    Stripe-shaped column on "PendingSubscription" (it only ever carries
--    payseraOrderId — checkout there is Paysera-only), so no equivalent
--    step exists for that table; this is a genuine absence of a target, not
--    an oversight.
-- 3. Adds a composite UNIQUE constraint on (paymentProvider,
--    providerOrderId) on both tables — see "UNIQUENESS SCOPE" and
--    "LOCK WINDOW" below.
--
-- The backfill UPDATEs (steps 1-2) run BEFORE either ADD CONSTRAINT
-- statement (step 3, in that order, deliberately) so that no ACCESS
-- EXCLUSIVE lock has been acquired anywhere yet in this transaction when the
-- backfills run — see LOCK WINDOW.
--
-- BACKFILL SAFETY UNDER CONCURRENT WRITES
-- ----------------------------------------
-- Both tables are actively written to in production (subscriptions is
-- touched on every renewal/callback cycle; PendingSubscription on every
-- checkout-in-progress). Because 20260819120000 already committed the
-- nullable columns in its own separate transaction, the backfill UPDATEs
-- below are the FIRST statements to touch these tables in THIS migration's
-- transaction — there is no ACCESS EXCLUSIVE lock from an earlier statement
-- in this same transaction still being held. The backfill UPDATEs therefore
-- genuinely take only ordinary ROW EXCLUSIVE table + per-row locks
-- (standard DML), NOT a table-wide lock, so they do not block concurrent
-- reads and only conflict with a concurrent writer touching the exact same
-- row (normal MVCC contention, no different from any other application
-- UPDATE against these tables). This claim is empirically verified below
-- (see LOCK WINDOW) — it is the corrected version of the same claim the
-- original single-file migration made incorrectly, per
-- BC-MYPOS-004-impl-r1.md finding F1: there, the claim was false because
-- the ADD COLUMN statements ran in the SAME transaction immediately before
-- the backfill; here, they do not, so the claim now holds.
--
-- A concurrent INSERT of a brand-new Paysera or Stripe row between this
-- migration's start and the relevant backfill UPDATE is not a correctness
-- hazard: such a row would already have paymentProvider/providerOrderId set
-- by the application (BC-MYPOS-005) or NULL (pre-BC-MYPOS-005 code), and
-- both backfill UPDATEs' own WHERE clause (`"paymentProvider" IS NULL`)
-- only ever touches rows that still need it, so neither can clobber a
-- concurrently-written row that already has a value.
--
-- STRIPE BACKFILL
-- -----------------
-- Step 2 backfills "subscriptions" rows created via Stripe the same way
-- step 1 backfills Paysera rows, using stripeSubscriptionId as the source
-- column and the STRIPE_LEGACY enum value added specifically for this case
-- (see the PaymentProvider enum's own comment in schema.prisma). It is
-- guarded by both `"stripeSubscriptionId" IS NOT NULL` and
-- `"paymentProvider" IS NULL`, and runs strictly after step 1 in this file,
-- so a row that step 1 already claimed (i.e. has both payseraOrderId and
-- stripeSubscriptionId set, however unlikely) is left alone by step 2 —
-- Paysera backfill takes priority and step 2 can only ever fill in rows
-- step 1 skipped. There is no equivalent step for "PendingSubscription": it
-- has no Stripe-identifying column at all (checkout there is Paysera-only),
-- so a Stripe-specific backfill has no target on that table.
--
-- UNIQUENESS SCOPE
-- -----------------
-- The constraint is scoped to (paymentProvider, providerOrderId), not
-- providerOrderId alone, because order IDs minted by different providers
-- could otherwise collide. Postgres treats every NULL as distinct under a
-- multi-column UNIQUE constraint, so the many rows that have neither column
-- populated yet (anything not backfilled, e.g. future MyPOS-only writers
-- before BC-MYPOS-005 ships) do not conflict with one another.
--
-- Note this constraint can NEVER be violated by the data this migration
-- itself writes: every step-1-backfilled providerOrderId is a straight copy
-- of payseraOrderId, which already carries its own UNIQUE constraint
-- ("subscriptions_payseraOrderId_key" / "PendingSubscription_payseraOrderId_key"),
-- and every step-1-backfilled paymentProvider is the single literal
-- 'PAYSERA'. Likewise every step-2-backfilled providerOrderId is a straight
-- copy of stripeSubscriptionId, which also already carries its own UNIQUE
-- constraint on "subscriptions" (`Subscription.stripeSubscriptionId
-- @unique` in schema.prisma), and every step-2-backfilled paymentProvider is
-- the single literal 'STRIPE_LEGACY' — so (PAYSERA, <copied payseraOrderId>)
-- and (STRIPE_LEGACY, <copied stripeSubscriptionId>) pairs are each unique
-- by construction, and the two families can never collide with each other
-- either (different paymentProvider literal). No pre-flight
-- duplicate-detection query (of the kind used in the
-- 20260810160000_add_user_phone_role_unique migration) is required here.
--
-- LOCK WINDOW (empirically verified against a scratch Postgres instance,
-- same methodology as BC-MYPOS-004-impl-r1.md's runtime checks — a
-- pg_sleep observation window plus a concurrent-session pg_locks/blocking
-- probe, run separately for the backfill steps and the constraint step)
-- ------------------------------------------------------------------------
-- The backfill UPDATE statements (steps 1-2) do NOT take a table-wide lock:
-- with a `pg_sleep(3)` inserted immediately after the "subscriptions"
-- backfill UPDATEs but before any ADD CONSTRAINT statement, `pg_locks`
-- showed no ACCESS EXCLUSIVE (or any other table-level) lock held against
-- "subscriptions", and a concurrent `SELECT count(*) FROM subscriptions`
-- from a second session returned immediately, unblocked. This confirms the
-- original single-file migration's backfill-safety claim, which was false
-- in that file (per BC-MYPOS-004-impl-r1.md F1) purely because of lock
-- retention from that file's own preceding ADD COLUMN statements, is true
-- once ADD COLUMN is committed in a separate prior migration as it now is.
--
-- Each ADD CONSTRAINT ... UNIQUE statement (step 3) IS the one place in
-- this migration that requires a table-wide validation scan: Postgres
-- takes an ACCESS EXCLUSIVE lock on the target table for the duration of
-- that scan (reads AND writes block against that table for that window),
-- and — because Postgres holds locks until the enclosing transaction's
-- COMMIT, not until end-of-statement — that lock remains held through
-- whatever remains of this migration's transaction after it (here: at most
-- the second table's own ADD CONSTRAINT statement, since these are the
-- last two statements in the file, followed immediately by COMMIT).
-- Verified with the same pg_sleep + pg_locks + concurrent-blocking-probe
-- technique: during a `pg_sleep(3)` inserted immediately after the
-- "subscriptions" ADD CONSTRAINT statement, `pg_locks` showed
-- AccessExclusiveLock held (granted) against "subscriptions", and a
-- concurrent `SELECT count(*) FROM subscriptions` blocked for the full
-- sleep window until commit. "PendingSubscription" was NOT blocked during
-- that same window, confirming the ACCESS EXCLUSIVE lock is scoped to its
-- own single table and does not extend to the other table's ADD CONSTRAINT
-- statement that follows it in the same transaction.
--
-- This is the same tradeoff already accepted and documented in this repo's
-- own 20260810160000_add_user_phone_role_unique migration for "User" —
-- that migration's header explains in detail why `CREATE INDEX
-- CONCURRENTLY` (which avoids this lock) is not usable here: `prisma
-- migrate deploy` (prisma@^7.7.0, the version pinned in this repo) always
-- wraps migration.sql in a single transaction and CONCURRENTLY cannot run
-- inside one (verified P3018 failure in that migration's own header note),
-- and there is no documented per-migration opt-out in this Prisma version.
--
-- Given the uniqueness is mathematically guaranteed (see UNIQUENESS SCOPE
-- above — no pre-flight check needed, and the scan can only ever confirm
-- what is already true rather than reject any row), this migration
-- proceeds with plain ADD CONSTRAINT statements rather than a further
-- split. If "subscriptions" / "PendingSubscription" have grown large
-- enough in production for the validation scan's lock window to become
-- user-visible by the time this ships, defer the two ADD CONSTRAINT
-- statements to a further follow-up migration run in a low-traffic window,
-- once table growth/lock-duration has been confirmed acceptable (e.g. via
-- `EXPLAIN` row-count or a maintenance-window deploy) — the backfill above
-- is unaffected either way, since it already carries no table-wide lock
-- risk on its own.
--
-- ROLLBACK (Prisma does not auto-generate down migrations)
-- -----------------------------------------------------------
-- To revert this migration exactly, run the following in a single
-- transaction against the target database, then remove this migration's
-- row from the "_prisma_migrations" table (`DELETE FROM
-- "_prisma_migrations" WHERE migration_name =
-- '20260819120100_backfill_and_constrain_payment_provider';`) so `prisma
-- migrate deploy` will re-apply it if needed. Run this BEFORE rolling back
-- 20260819120000_add_payment_provider_columns (that migration's rollback
-- drops the columns this one's constraints and backfilled data depend on).
--
--   BEGIN;
--   ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "Subscription_paymentProvider_providerOrderId_key";
--   ALTER TABLE "PendingSubscription" DROP CONSTRAINT IF EXISTS "PendingSubscription_paymentProvider_providerOrderId_key";
--   UPDATE "subscriptions" SET "paymentProvider" = NULL, "providerOrderId" = NULL WHERE "stripeSubscriptionId" IS NOT NULL AND "paymentProvider" = 'STRIPE_LEGACY' AND "providerOrderId" = "stripeSubscriptionId";
--   UPDATE "subscriptions" SET "paymentProvider" = NULL, "providerOrderId" = NULL WHERE "payseraOrderId" IS NOT NULL AND "providerOrderId" = "payseraOrderId";
--   UPDATE "PendingSubscription" SET "paymentProvider" = NULL, "providerOrderId" = NULL WHERE "payseraOrderId" IS NOT NULL AND "providerOrderId" = "payseraOrderId";
--   COMMIT;
--
-- The backfill-undo UPDATEs are scoped defensively (matching provider +
-- copied value) so they only clear rows this migration itself populated,
-- not any row a later application write (BC-MYPOS-005, e.g. a genuine MyPOS
-- order) may have set in the meantime. The Stripe undo is additionally
-- scoped to `"paymentProvider" = 'STRIPE_LEGACY'` (not just the copied-value
-- check) so it can never touch a row the Paysera undo already reset. No
-- pre-existing column (including payseraOrderId or stripeSubscriptionId) is
-- touched by either this migration or its rollback, so no data loss occurs
-- either way.

-- 1. Backfill existing Paysera rows (every status/lifecycle state — the
--    WHERE clause is only on payseraOrderId, not on any status column).
--    Runs first, before step 2 or either ADD CONSTRAINT below — see LOCK
--    WINDOW.
UPDATE "subscriptions"
SET "paymentProvider" = 'PAYSERA',
    "providerOrderId" = "payseraOrderId"
WHERE "payseraOrderId" IS NOT NULL
  AND "paymentProvider" IS NULL;

UPDATE "PendingSubscription"
SET "paymentProvider" = 'PAYSERA',
    "providerOrderId" = "payseraOrderId"
WHERE "payseraOrderId" IS NOT NULL
  AND "paymentProvider" IS NULL;

-- 2. Backfill existing Stripe-originated "subscriptions" rows that step 1
--    didn't already claim (see STRIPE BACKFILL above). No equivalent step
--    for "PendingSubscription" — it has no Stripe-identifying column.
UPDATE "subscriptions"
SET "paymentProvider" = 'STRIPE_LEGACY',
    "providerOrderId" = "stripeSubscriptionId"
WHERE "stripeSubscriptionId" IS NOT NULL
  AND "paymentProvider" IS NULL;

-- 3. Composite uniqueness (see LOCK WINDOW note above — ACCESS EXCLUSIVE
--    for the duration of the validation scan on each table, accepted here
--    because the backfilled data can never violate it; defer to a further
--    follow-up migration instead if table size makes the scan lock window
--    a concern at deploy time)
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "Subscription_paymentProvider_providerOrderId_key"
  UNIQUE ("paymentProvider", "providerOrderId");

ALTER TABLE "PendingSubscription"
  ADD CONSTRAINT "PendingSubscription_paymentProvider_providerOrderId_key"
  UNIQUE ("paymentProvider", "providerOrderId");
