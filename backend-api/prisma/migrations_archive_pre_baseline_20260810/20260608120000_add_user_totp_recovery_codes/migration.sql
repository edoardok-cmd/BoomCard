-- Migration: 20260608120000_add_user_totp_recovery_codes
-- Task: BC-ADMIN-2FA-RECOVERY-AND-FRONTEND-FIX-015 (b) — one-time 2FA backup recovery codes.
-- Date: 2026-06-08
--
-- ADDITIVE ONLY. Adds a String[] column holding bcrypt HASHES of single-use 2FA
-- recovery codes. Plaintext codes are returned to the admin exactly once at
-- 2FA-enable time and are never stored or retrievable again. A successful
-- recovery-code login consumes (removes) the matching hash from the array.
--
-- The column is NOT NULL with a DEFAULT '{}' (empty array). Postgres applies a
-- constant DEFAULT for an added column without rewriting existing rows, so this is
-- safe to apply on the shared production DB with ZERO backfill and no table rewrite.
--
-- IF NOT EXISTS guard makes the migration idempotent/re-runnable.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "totpRecoveryCodes" TEXT[] NOT NULL DEFAULT '{}';
