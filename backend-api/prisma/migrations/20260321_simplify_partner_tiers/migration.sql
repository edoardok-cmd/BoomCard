-- Simplify PartnerTier enum from 5 values to 3, matching the 3 subscription plans.
-- Old tiers: BASIC(10%), STANDARD(15%), PREMIUM(20%), VIP(30%), EXCLUSIVE(100%)
-- New tiers: BASIC(10%), LIGHT(20%), PREMIUM(20%)
--
-- Migration mapping:
--   BASIC     → BASIC
--   STANDARD  → LIGHT
--   PREMIUM   → LIGHT   (old 20% → new LIGHT 20%)
--   VIP       → PREMIUM
--   EXCLUSIVE → PREMIUM

-- Step 1: Add LIGHT value to the existing PartnerTier enum
ALTER TYPE "PartnerTier" ADD VALUE IF NOT EXISTS 'LIGHT';

-- Step 2: Remap old tier values to new ones (LIGHT must be committed before UPDATE)
-- Note: ADD VALUE is auto-committed in Postgres; the UPDATE runs after.
UPDATE "Partner" SET tier = 'LIGHT'    WHERE tier = 'STANDARD';
UPDATE "Partner" SET tier = 'LIGHT'    WHERE tier = 'PREMIUM';
UPDATE "Partner" SET tier = 'PREMIUM'  WHERE tier IN ('VIP', 'EXCLUSIVE');

-- Step 3: Rebuild the enum with only 3 values, dropping STANDARD, VIP, EXCLUSIVE
ALTER TABLE "Partner" ALTER COLUMN tier TYPE text;
DROP TYPE "PartnerTier";
CREATE TYPE "PartnerTier" AS ENUM ('BASIC', 'LIGHT', 'PREMIUM');
ALTER TABLE "Partner" ALTER COLUMN tier TYPE "PartnerTier" USING tier::"PartnerTier";
ALTER TABLE "Partner" ALTER COLUMN tier SET DEFAULT 'BASIC'::"PartnerTier";
