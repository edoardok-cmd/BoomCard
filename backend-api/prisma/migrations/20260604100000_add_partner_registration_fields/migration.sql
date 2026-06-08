-- Migration: 20260604100000_add_partner_registration_fields
-- Task: FIX #2 (spec §2.3) — persist partner-application fields that the public
-- RegisterPartnerPage collects but the backend previously dropped.
-- Date: 2026-06-04
--
-- ADDITIVE ONLY. All three columns are nullable / defaulted so this migration is
-- safe to apply on the shared production DB with zero backfill and no table
-- rewrite (Postgres adds nullable columns and columns with a constant DEFAULT
-- without rewriting existing rows).
--
--   participationLevel  TEXT          — Spec §2.3 "Ниво на участие": "basic" | "active" | "growth".
--   acceptPrivacy       BOOLEAN false — Spec §2.3 separate required Privacy Policy consent.
--   additionalInfo      TEXT          — Spec §2.3 free-text additional notes (optional).
--
-- IF NOT EXISTS guards make the migration idempotent/re-runnable.

ALTER TABLE "Partner"
  ADD COLUMN IF NOT EXISTS "participationLevel" TEXT;

ALTER TABLE "Partner"
  ADD COLUMN IF NOT EXISTS "acceptPrivacy" BOOLEAN DEFAULT false;

ALTER TABLE "Partner"
  ADD COLUMN IF NOT EXISTS "additionalInfo" TEXT;
