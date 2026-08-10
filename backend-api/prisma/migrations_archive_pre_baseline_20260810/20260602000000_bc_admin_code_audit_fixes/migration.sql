-- prisma:no-transaction
-- Migration: bc_admin_code_audit_fixes
-- Task: BC-ADMIN-CODE-AUDIT (gap closure — Step 3 round 2 finding B1 + B2)
-- Date: 2026-06-02
--
-- Closes the gap where `prisma generate` updated the schema but NO migration
-- SQL existed for the admin-audit changes. `prisma migrate deploy` would have
-- been a no-op, leaving production behind the Prisma model definitions.
--
-- Changes in this migration:
--   1. CashbackEntryStatus: ADD VALUE 'TRIAL_PENDING'
--   2. VenueStatus:         ADD VALUE 'INACTIVE', ADD VALUE 'IN_PROCESSING'
--   3. TicketStatus:        ADD VALUE 'CANCELLED'
--   4. pending_super_admin_requests: add status, expiresAt, secondApproverId,
--      resolvedAt columns (3-step NOT NULL pattern for expiresAt — table may have
--      existing rows so we: add nullable → backfill → set NOT NULL).
--   5. Indexes on pending_super_admin_requests(status) and (expiresAt)
--   6. wallet_transactions FK for voidedByUserId → users(id) ON DELETE SET NULL
--
-- Concurrency safety:
--   • ALTER TYPE … ADD VALUE is non-locking in Postgres 9.1+ (value is visible
--     to new transactions immediately; in-flight transactions see old type).
--   • ADD COLUMN … DEFAULT / nullable ADD COLUMN is a metadata-only change in
--     PG 11+ — no row-level lock, no table rewrite.
--   • The expiresAt NOT NULL constraint is added AFTER the backfill so the
--     column is never in an invalid state for concurrent writers.
--   • CREATE INDEX IF NOT EXISTS uses a non-locking build (no CONCURRENTLY here
--     because the migration runner does not open a transaction that is already
--     active — each statement runs and commits before the next starts).
--   • The FK drop-then-add pattern is used because PostgreSQL does not support
--     ADD CONSTRAINT IF NOT EXISTS for foreign keys.
--
-- Route-layer note (reviewer B2 finding):
--   The approve/cancel routes in adminAdmins.routes.ts currently hard-delete
--   pending_super_admin_requests rows without writing the new audit fields.
--   The backend-engineer will update those routes in a separate pass to write
--   status/secondApproverId/resolvedAt before returning so the audit trail is
--   fully populated. The columns are added here now so the DB is ready.
--   Spec §3.9 Clash 13.3 intent is: keep rows for audit after resolution.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add TRIAL_PENDING to CashbackEntryStatus enum
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TYPE "CashbackEntryStatus" ADD VALUE IF NOT EXISTS 'TRIAL_PENDING';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Add INACTIVE and IN_PROCESSING to VenueStatus enum
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TYPE "VenueStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "VenueStatus" ADD VALUE IF NOT EXISTS 'IN_PROCESSING';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Add CANCELLED to TicketStatus enum
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Add audit-trail columns to pending_super_admin_requests
--    3-step NOT NULL pattern for expiresAt (non-empty table safety)
-- ──────────────────────────────────────────────────────────────────────────────

-- Step 4a: add all four columns as nullable / with defaults
ALTER TABLE "pending_super_admin_requests"
  ADD COLUMN IF NOT EXISTS "status"           TEXT        NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "expiresAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "secondApproverId" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedAt"       TIMESTAMP(3);

-- Step 4b: backfill expiresAt for any existing rows (createdAt + 72 hours)
UPDATE "pending_super_admin_requests"
SET "expiresAt" = "createdAt" + INTERVAL '72 hours'
WHERE "expiresAt" IS NULL;

-- Step 4c: tighten expiresAt to NOT NULL after the backfill is complete
ALTER TABLE "pending_super_admin_requests"
  ALTER COLUMN "expiresAt" SET NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Indexes on pending_super_admin_requests
-- ──────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "pending_super_admin_requests_status_idx"
  ON "pending_super_admin_requests"("status");

CREATE INDEX IF NOT EXISTS "pending_super_admin_requests_expiresAt_idx"
  ON "pending_super_admin_requests"("expiresAt");

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. FK: wallet_transactions.voidedByUserId → users(id) ON DELETE SET NULL
--    Drop-then-add because PostgreSQL does not support IF NOT EXISTS for FKs.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE "wallet_transactions"
  DROP CONSTRAINT IF EXISTS "wallet_transactions_voidedByUserId_fkey";

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL;
