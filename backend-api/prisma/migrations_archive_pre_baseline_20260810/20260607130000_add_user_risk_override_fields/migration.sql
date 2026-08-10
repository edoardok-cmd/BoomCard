-- Migration: 20260607130000_add_user_risk_override_fields
-- Task: BC-ADMIN-USERMGMT-SPEC-FIX (M1) — durability fields for admin risk-profile overrides.
-- Date: 2026-06-07
--
-- ADDITIVE ONLY. Both columns are nullable so this migration is safe to apply on
-- the shared production DB with ZERO backfill and no table rewrite (Postgres adds
-- nullable columns without rewriting existing rows).
--
-- Absence of an override (both columns NULL) means the periodic behaviour-based
-- risk recompute applies normally. When an admin manually sets riskScore/riskBucket,
-- these columns are stamped so the recompute can detect and preserve the override.
--
--   riskOverriddenAt  TIMESTAMP — when an admin last manually set riskScore/riskBucket.
--   riskOverriddenBy  TEXT      — the admin User id who set the override (plain string,
--                                 no FK / self-relation; mirrors User.reviewedBy-style actor ids).
--
-- IF NOT EXISTS guards make the migration idempotent/re-runnable.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "riskOverriddenAt" TIMESTAMP(3);

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "riskOverriddenBy" TEXT;
