-- Migration: Replace hardcoded PartnerTier enum with dynamic PartnerType table
-- Also adds PlanTypeAccess for configurable plan→type access rules
-- and adds tags column to Offer

-- ────────────────────────────────────────────────────────────
-- 1. Create PartnerType table and seed with existing tiers
-- ────────────────────────────────────────────────────────────
CREATE TABLE "PartnerType" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "name"            TEXT NOT NULL,
    "nameBg"          TEXT,
    "description"     TEXT,
    "descriptionBg"   TEXT,
    "maxDiscountRate" DOUBLE PRECISION NOT NULL,
    "color"           TEXT NOT NULL DEFAULT '#6b7280',
    "sortOrder"       INTEGER NOT NULL DEFAULT 0,
    "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PartnerType_name_key" ON "PartnerType"("name");
CREATE INDEX "PartnerType_isActive_idx" ON "PartnerType"("isActive");
CREATE INDEX "PartnerType_sortOrder_idx" ON "PartnerType"("sortOrder");

-- Seed the three original tiers (preserving existing behaviour)
INSERT INTO "PartnerType" ("id", "name", "nameBg", "description", "maxDiscountRate", "color", "sortOrder", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'BASIC',   'BASIC',   'Entry-level partner — up to 10% discount',    10,  '#6b7280', 1, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'LIGHT',   'LIGHT',   'Mid-tier partner — up to 20% discount',       20,  '#1e3a5f', 2, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'PREMIUM', 'PREMIUM', 'Top-tier partner — up to 20% discount',       20,  '#1c1917', 3, CURRENT_TIMESTAMP);

-- ────────────────────────────────────────────────────────────
-- 2. Create PlanTypeAccess table and seed with existing rules
-- ────────────────────────────────────────────────────────────
CREATE TABLE "PlanTypeAccess" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "plan"          TEXT NOT NULL,
    "partnerTypeId" TEXT NOT NULL,
    "canView"       BOOLEAN NOT NULL DEFAULT TRUE,
    "canRedeem"     BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT "PlanTypeAccess_partnerTypeId_fkey"
        FOREIGN KEY ("partnerTypeId") REFERENCES "PartnerType"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "PlanTypeAccess_plan_partnerTypeId_key" ON "PlanTypeAccess"("plan", "partnerTypeId");
CREATE INDEX "PlanTypeAccess_plan_idx" ON "PlanTypeAccess"("plan");
CREATE INDEX "PlanTypeAccess_partnerTypeId_idx" ON "PlanTypeAccess"("partnerTypeId");

-- Seed access rules matching the old hardcoded PLAN_REDEEMABLE_TIERS:
--   LIGHT plan  → can view + redeem BASIC only
--   BASIC plan  → can view + redeem BASIC + LIGHT
--   PREMIUM plan → can view + redeem all (BASIC, LIGHT, PREMIUM)
INSERT INTO "PlanTypeAccess" ("id", "plan", "partnerTypeId", "canView", "canRedeem")
SELECT gen_random_uuid()::text, 'LIGHT', pt."id", TRUE, TRUE
FROM "PartnerType" pt WHERE pt."name" = 'BASIC';

INSERT INTO "PlanTypeAccess" ("id", "plan", "partnerTypeId", "canView", "canRedeem")
SELECT gen_random_uuid()::text, 'BASIC', pt."id", TRUE, TRUE
FROM "PartnerType" pt WHERE pt."name" IN ('BASIC', 'LIGHT');

INSERT INTO "PlanTypeAccess" ("id", "plan", "partnerTypeId", "canView", "canRedeem")
SELECT gen_random_uuid()::text, 'PREMIUM', pt."id", TRUE, TRUE
FROM "PartnerType" pt WHERE pt."name" IN ('BASIC', 'LIGHT', 'PREMIUM');

-- ────────────────────────────────────────────────────────────
-- 3. Migrate Partner: add partnerTypeId, populate from tier, drop tier
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Partner" ADD COLUMN "partnerTypeId" TEXT;

-- Populate partnerTypeId from the old tier value (BASIC→BASIC, etc.)
UPDATE "Partner" p
SET "partnerTypeId" = pt."id"
FROM "PartnerType" pt
WHERE pt."name" = p."tier"::text;

-- Make non-nullable (all rows now have a value)
ALTER TABLE "Partner" ALTER COLUMN "partnerTypeId" SET NOT NULL;

-- Add FK constraint and index
ALTER TABLE "Partner"
    ADD CONSTRAINT "Partner_partnerTypeId_fkey"
    FOREIGN KEY ("partnerTypeId") REFERENCES "PartnerType"("id");

DROP INDEX IF EXISTS "Partner_tier_idx";
CREATE INDEX "Partner_partnerTypeId_idx" ON "Partner"("partnerTypeId");

-- Drop old tier column and enum
ALTER TABLE "Partner" DROP COLUMN "tier";
DROP TYPE IF EXISTS "PartnerTier";

-- ────────────────────────────────────────────────────────────
-- 4. Add tags column to Offer
-- ────────────────────────────────────────────────────────────
ALTER TABLE "Offer" ADD COLUMN "tags" TEXT;
