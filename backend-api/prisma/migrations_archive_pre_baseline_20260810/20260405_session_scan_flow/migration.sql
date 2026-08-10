-- Add SESSION_ACTIVE status: QR scanned but receipt not yet submitted.
-- This lets us record the exact session start time when the user scans the QR,
-- separate from when they submit the receipt (per BOOM_Card_Master_Functionality spec §6).
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'SESSION_ACTIVE';

-- Track when the QR was first scanned (session start time).
-- Used to enforce the 1-hour receipt upload window and detect waiter-fraud patterns.
ALTER TABLE "StickerScan"
  ADD COLUMN IF NOT EXISTS "sessionStartedAt" TIMESTAMP(3);

-- Backfill existing rows: use createdAt as the session start time for legacy scans.
UPDATE "StickerScan"
  SET "sessionStartedAt" = "createdAt"
  WHERE "sessionStartedAt" IS NULL;

-- Default existing values so new sessions created without a bill amount (status = SESSION_ACTIVE)
-- don't fail NOT NULL constraints.
ALTER TABLE "StickerScan"
  ALTER COLUMN "billAmount"      SET DEFAULT 0,
  ALTER COLUMN "cashbackPercent" SET DEFAULT 0,
  ALTER COLUMN "cashbackAmount"  SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS "StickerScan_sessionStartedAt_idx" ON "StickerScan" ("sessionStartedAt");
