-- Deactivate per-venue caps and submission limits.
-- Updates both schema defaults (for new rows) and existing rows.

-- VenueFraudConfig
ALTER TABLE "VenueFraudConfig" ALTER COLUMN "minBillAmount" SET DEFAULT 0;
ALTER TABLE "VenueFraudConfig" ALTER COLUMN "maxScansPerDay" SET DEFAULT 999999;
ALTER TABLE "VenueFraudConfig" ALTER COLUMN "maxScansPerMonth" SET DEFAULT 999999;

UPDATE "VenueFraudConfig" SET "minBillAmount" = 0, "maxScansPerDay" = 999999, "maxScansPerMonth" = 999999;

-- VenueStickerConfig
ALTER TABLE "VenueStickerConfig" ALTER COLUMN "minBillAmount" SET DEFAULT 0;
ALTER TABLE "VenueStickerConfig" ALTER COLUMN "maxScansPerDay" SET DEFAULT 999999;
ALTER TABLE "VenueStickerConfig" ALTER COLUMN "maxScansPerMonth" SET DEFAULT 999999;

UPDATE "VenueStickerConfig" SET "minBillAmount" = 0, "maxScansPerDay" = 999999, "maxScansPerMonth" = 999999;
