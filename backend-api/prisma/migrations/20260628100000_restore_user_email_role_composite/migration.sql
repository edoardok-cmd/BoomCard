-- Migration: restore_user_email_role_composite
--
-- Problem: Migration 20260602200000_bc_user_code_audit_fixes (lines 58-59) dropped
-- the composite unique index "User_email_role_key" (email, role) and replaced it
-- with a single-column unique constraint "User_email_key" (email only).
-- This contradicts schema.prisma @@unique([email, role]) and prevents sibling
-- accounts (same email, different roles) from being created, breaking
-- tests/integration/account-switching.test.ts.
--
-- Backfill safety: The "User" table is non-empty. Dropping the single-column
-- unique constraint is safe under concurrent writes because we are WIDENING the
-- uniqueness rule (from email-only to email+role). The new composite unique index
-- is created AFTER the old constraint is dropped so there is no window where
-- both constraints co-exist. No existing row can violate (email, role) uniqueness
-- because each user has exactly one role; the old email-only constraint already
-- prevented duplicate (email, role) pairs.

-- Step 1: Drop the single-column unique constraint added by the June 2 migration.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
-- Also drop as index in case it was created as an index rather than a constraint.
DROP INDEX IF EXISTS "User_email_key";

-- Step 2: Recreate the composite unique index declared in schema.prisma
-- @@unique([email, role]) → Prisma names it "User_email_role_key".
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_role_key" ON "User"(email, role);
