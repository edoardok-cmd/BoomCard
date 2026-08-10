-- Finding #6 race-condition fix: promote the plain index on StickerScan.receiptImageHash
-- to a UNIQUE index so concurrent duplicate-hash inserts fail with P2002 at the DB layer
-- (instead of racing past the application-level findFirst/update dedupe).
--
-- Production-safety step: before switching the index to UNIQUE we MUST ensure no two
-- existing rows share a hash. Migration 20260416_sticker_scan_receipt_image_hash added
-- the column unguarded, so any hashes written since then could collide.
--
-- Strategy: for every hash that appears more than once, keep the oldest scan's hash as
-- the canonical record and NULL the duplicates' hashes while marking them REJECTED.
-- Postgres's UNIQUE semantics allow multiple NULLs, so nullified rows won't collide.
-- The reject reason is explicit so ops can recognise migration-time resolutions.

-- For every hash that appears more than once, keep the oldest scan's hash as the
-- canonical record. For non-canonical duplicates we NULL the hash (so the UNIQUE index
-- has room), and we only flip status to REJECTED when the scan hasn't already been
-- approved. APPROVED scans keep their status — admins/users have already been paid; a
-- retroactive REJECT would revoke cashback and is not acceptable for a migration to do.
WITH duplicates AS (
  SELECT id, "receiptImageHash", "status",
         ROW_NUMBER() OVER (PARTITION BY "receiptImageHash" ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "StickerScan"
  WHERE "receiptImageHash" IS NOT NULL
)
UPDATE "StickerScan" s
SET "receiptImageHash" = NULL,
    -- Only demote when not already approved/paid. Leave REJECTED/EXPIRED as-is; flip
    -- PENDING/VALIDATING/MANUAL_REVIEW/SESSION_ACTIVE to REJECTED.
    "status" = CASE
      WHEN d."status" IN ('PENDING','VALIDATING','MANUAL_REVIEW','SESSION_ACTIVE') THEN 'REJECTED'
      ELSE s."status"
    END,
    "rejectionReason" = CASE
      WHEN d."status" IN ('PENDING','VALIDATING','MANUAL_REVIEW','SESSION_ACTIVE')
        THEN COALESCE(s."rejectionReason", 'Duplicate receipt image (migration backfill)')
      ELSE s."rejectionReason"
    END,
    "fraudReasons" = COALESCE(s."fraudReasons", '["DUPLICATE_IMAGE_HASH_BACKFILL"]')
FROM duplicates d
WHERE s.id = d.id AND d.rn > 1;

-- Drop the existing non-unique index (created by migration 20260416_sticker_scan_receipt_image_hash)
DROP INDEX IF EXISTS "StickerScan_receiptImageHash_idx";

-- Add UNIQUE index. Uses CREATE UNIQUE INDEX rather than ALTER TABLE ADD CONSTRAINT so it's
-- fully idempotent on re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS "StickerScan_receiptImageHash_key" ON "StickerScan" ("receiptImageHash");
