-- Spec §7.1 — auto-approve enforcement
--
-- Problem: VenueStickerConfig.autoApproveThreshold had a default of 10, which
-- conflicts with the spec threshold of 30 (0-30 = auto-approve). The column
-- was also never consulted at scan time — every scan was routed to MANUAL_REVIEW
-- regardless of fraudScore. This migration fixes the DB-level default; the
-- application-level enforcement is in sticker.service.ts uploadReceipt().
--
-- IDEMPOTENT: ALTER COLUMN default change is safe to replay.

-- 1. Fix the default for new VenueStickerConfig rows
ALTER TABLE "VenueStickerConfig"
  ALTER COLUMN "autoApproveThreshold" SET DEFAULT 30;

-- 2. Update existing rows that still carry the old default value (10).
--    Rows explicitly set to 10 by an admin would also be updated here —
--    acceptable because the field was never enforced, so no row was
--    intentionally configured to a tighter threshold.
UPDATE "VenueStickerConfig"
SET "autoApproveThreshold" = 30
WHERE "autoApproveThreshold" = 10;
