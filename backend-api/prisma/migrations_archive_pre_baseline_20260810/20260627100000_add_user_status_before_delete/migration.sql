-- Migration: 20260627100000_add_user_status_before_delete
-- Task: BC-ADMIN-SPEC-REAUDIT2-ARCHIVE-RESTORE-BYPASS-1 — close the ARCHIVED-terminality
--       bypass (spec §1.1 / §2.4) escapable via a DELETE-then-restore round-trip.
-- Date: 2026-06-27
--
-- ADDITIVE ONLY. Adds a nullable "statusBeforeDelete" column ("UserStatus" enum) that
-- DELETE /:userId/account stamps with the user's current status at soft-delete time so
-- POST /:userId/restore can revive the user to their EXACT prior state (e.g. ARCHIVED
-- comes back ARCHIVED, not ACTIVE) instead of unconditionally writing ACTIVE.
--
-- The column is NULLABLE with no DEFAULT. Postgres adds a nullable column without a
-- default as a metadata-only change (no table rewrite, no backfill), so existing rows
-- simply get NULL. Legacy rows soft-deleted before this column existed therefore restore
-- to ACTIVE (preserving today's behaviour), and the column is cleared back to NULL on
-- every restore.
--
-- IF NOT EXISTS guard makes the migration idempotent/re-runnable.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "statusBeforeDelete" "UserStatus";
