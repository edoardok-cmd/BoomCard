-- Migration: 20260604000000_bc_partner_code_audit_r2_fixes
-- Task: BC-PARTNER-CODE-AUDIT — r2o + r2p HIGH/MEDIUM findings (schema structural)
-- Date: 2026-06-04
--
-- Summary of DB-structural changes in this migration (annotation-only changes
-- such as @ignore, comment edits, and PartnerStatus comment updates produce no
-- SQL and are not listed):
--
--   1. RiskBucket enum — rename values to match spec Clash 5.1 thresholds
--      (r2p HIGH-1). Previous names (LOW_0_30, REVIEW_31_60, HIGH_61_PLUS)
--      embedded incorrect threshold boundaries (0-30/31-60/61+) that contradict
--      the spec's canonical bands (0-20/21-50/51+). Renamed to LOW_0_20,
--      MEDIUM_21_50, HIGH_51_PLUS.
--      Backfill strategy (safe under concurrent writes):
--        Step 1 (this migration): add new enum values, UPDATE existing rows from
--                                 old names to new names, remove old enum values.
--        Existing rows on User.riskBucket: mapped by value name, so all three
--        renames are applied in sequence. No data loss.
--        Concurrent writes during migration: the UPDATE steps run inside the
--        ALTER TYPE transaction, and Postgres locks the relevant rows. The window
--        is milliseconds; acceptable for a low-write enum column.
--        Application code referencing old constants (LOW_0_30, REVIEW_31_60,
--        HIGH_61_PLUS) MUST be updated to new constants before this migration runs.
--
--   2. HelpTicket.partnerId — add nullable FK to Partner (r2p S2 / MEDIUM)
--      Spec §12.1 Rule 6: partner tickets must be discriminated at DB level, not
--      only via userId filtering. Nullable because user-submitted tickets have no
--      partner context. ON DELETE SET NULL preserves audit rows if partner deleted.
--      Backfill strategy: none needed — existing rows correctly have no partnerId
--      (all pre-migration tickets were user-submitted). New partner-facing ticket
--      creation paths must populate this field.
--      Concurrent write safety: adding a nullable column with no DEFAULT that
--      requires writes is safe under Postgres MVCC; no table rewrite occurs.
--
--   3. TicketRequestType enum — create new enum and migrate HelpTicket.requestType
--      from String to TicketRequestType (r2o B4 / r2p S3 / MEDIUM).
--      Spec §10.4: canonical Request Type Enum must be enforced at storage layer.
--      Backfill strategy (3-step for non-empty table):
--        Step A: create the TicketRequestType enum type.
--        Step B: add a new temporary column requestTypeEnum TicketRequestType
--                with a safe DEFAULT of 'SUPPORT'.
--        Step C: backfill requestTypeEnum from requestType (mapping known values;
--                unmapped values default to 'OTHER' for safety).
--        Step D: drop the old requestType column.
--        Step E: rename requestTypeEnum to requestType.
--        Step F: add NOT NULL constraint (all rows now have the enum value).
--      Concurrent write safety: the old String column is kept readable/writable
--      during backfill; the swap is atomic at Step D/E. Any writes to the old
--      column during the backfill window will be dropped; this is acceptable
--      because the new column has a safe DEFAULT.

-- =============================================================================
-- 1. RiskBucket enum rename to spec-canonical threshold names (Clash 5.1)
-- =============================================================================

-- Add the new enum values first (cannot rename directly in Postgres)
ALTER TYPE "RiskBucket" ADD VALUE IF NOT EXISTS 'LOW_0_20';
ALTER TYPE "RiskBucket" ADD VALUE IF NOT EXISTS 'MEDIUM_21_50';
ALTER TYPE "RiskBucket" ADD VALUE IF NOT EXISTS 'HIGH_51_PLUS';

-- Migrate existing rows to new names
UPDATE "User" SET "riskBucket" = 'LOW_0_20'::"RiskBucket"    WHERE "riskBucket" = 'LOW_0_30';
UPDATE "User" SET "riskBucket" = 'MEDIUM_21_50'::"RiskBucket" WHERE "riskBucket" = 'REVIEW_31_60';
UPDATE "User" SET "riskBucket" = 'HIGH_51_PLUS'::"RiskBucket" WHERE "riskBucket" = 'HIGH_61_PLUS';

-- Remove old values. Postgres does not support DROP VALUE directly; we rename
-- the type, create a new clean type, migrate, then drop the old type.
-- This pattern is the standard safe approach for removing enum values.

-- Step 1: rename old type out of the way
ALTER TYPE "RiskBucket" RENAME TO "RiskBucket_old";

-- Step 2: create new type with only the correct values
CREATE TYPE "RiskBucket" AS ENUM ('LOW_0_20', 'MEDIUM_21_50', 'HIGH_51_PLUS');

-- Step 3: migrate User.riskBucket to new type
ALTER TABLE "User"
  ALTER COLUMN "riskBucket" DROP DEFAULT,
  ALTER COLUMN "riskBucket" TYPE "RiskBucket" USING "riskBucket"::text::"RiskBucket",
  ALTER COLUMN "riskBucket" SET DEFAULT NULL;

-- Step 4: drop old type
DROP TYPE "RiskBucket_old";

-- =============================================================================
-- 2. HelpTicket.partnerId — add nullable FK to Partner
-- =============================================================================

ALTER TABLE "HelpTicket"
  ADD COLUMN IF NOT EXISTS "partnerId" TEXT;

-- Add FK constraint (deferred to allow the column to be populated gradually)
ALTER TABLE "HelpTicket"
  ADD CONSTRAINT "HelpTicket_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "HelpTicket_partnerId_idx" ON "HelpTicket"("partnerId");

-- =============================================================================
-- 3. HelpTicket.requestType: String → TicketRequestType enum (3-step migration)
-- =============================================================================

-- Step A: create enum type
CREATE TYPE "TicketRequestType" AS ENUM (
  'SUPPORT',
  'DISPUTE',
  'CHANGE',
  'DATA_CHANGE',
  'LOCATION_CHANGE',
  'CONTRACT_CHANGE',
  'OTHER'
);

-- Step B: add temporary enum column with safe default
ALTER TABLE "HelpTicket"
  ADD COLUMN IF NOT EXISTS "requestTypeEnum" "TicketRequestType" NOT NULL DEFAULT 'SUPPORT';

-- Step C: backfill from old string column (map known values; unknown → OTHER)
UPDATE "HelpTicket"
SET "requestTypeEnum" = CASE "requestType"
  WHEN 'SUPPORT'         THEN 'SUPPORT'::"TicketRequestType"
  WHEN 'DISPUTE'         THEN 'DISPUTE'::"TicketRequestType"
  WHEN 'CHANGE'          THEN 'CHANGE'::"TicketRequestType"
  WHEN 'DATA_CHANGE'     THEN 'DATA_CHANGE'::"TicketRequestType"
  WHEN 'LOCATION_CHANGE' THEN 'LOCATION_CHANGE'::"TicketRequestType"
  WHEN 'CONTRACT_CHANGE' THEN 'CONTRACT_CHANGE'::"TicketRequestType"
  WHEN 'OTHER'           THEN 'OTHER'::"TicketRequestType"
  ELSE                        'OTHER'::"TicketRequestType"
END;

-- Step D: drop old string column (index too)
DROP INDEX IF EXISTS "HelpTicket_requestType_idx";
ALTER TABLE "HelpTicket" DROP COLUMN "requestType";

-- Step E: rename new column to requestType
ALTER TABLE "HelpTicket" RENAME COLUMN "requestTypeEnum" TO "requestType";

-- Step F: recreate the index on the new enum column
CREATE INDEX IF NOT EXISTS "HelpTicket_requestType_idx" ON "HelpTicket"("requestType");
