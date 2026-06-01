-- Migration: bc_schema_1_risk_columns
-- Task: BC-SCHEMA-1
-- Date: 2026-06-01
--
-- Adds 4 backward-compatible schema additions. All changes are safe under
-- concurrent writes:
--   1. UserStatus.ARCHIVED        — ALTER TYPE … ADD VALUE is non-locking in PG 9.1+.
--   2. Partner.hasRiskFlag        — NOT NULL DEFAULT false ADD COLUMN; Postgres fills
--                                   existing rows at catalog level, no row-level lock in PG 11+.
--   3. Sticker.autoDeactivatedAt  — nullable DateTime column; no existing data affected.
--   4. StickerScan.specRiskLevel  — nullable text column; no existing data affected.
--
-- No backfill required. No NOT NULL step required.
-- Rollback: ALTER TYPE "UserStatus" RENAME VALUE 'ARCHIVED' TO '<drop>'; DROP INDEX …;
--           ALTER TABLE "Partner" DROP COLUMN "hasRiskFlag";
--           ALTER TABLE "Sticker" DROP COLUMN "autoDeactivatedAt";
--           ALTER TABLE "StickerScan" DROP COLUMN "specRiskLevel";
--           (enum value removal requires a schema rebuild in PG — leave ARCHIVED unused
--            rather than drop if rollback is needed post-deploy.)

-- 1. Add ARCHIVED to UserStatus enum
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- 2. Add hasRiskFlag to Partner
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "hasRiskFlag" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Partner_hasRiskFlag_idx" ON "Partner"("hasRiskFlag");

-- 3. Add autoDeactivatedAt to Sticker
ALTER TABLE "Sticker" ADD COLUMN IF NOT EXISTS "autoDeactivatedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Sticker_autoDeactivatedAt_idx" ON "Sticker"("autoDeactivatedAt");

-- 4. Add specRiskLevel to StickerScan
ALTER TABLE "StickerScan" ADD COLUMN IF NOT EXISTS "specRiskLevel" TEXT;
CREATE INDEX IF NOT EXISTS "StickerScan_specRiskLevel_idx" ON "StickerScan"("specRiskLevel");
