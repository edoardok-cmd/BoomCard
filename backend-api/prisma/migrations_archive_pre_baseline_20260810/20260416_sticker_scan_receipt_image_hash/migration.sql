-- Finding #6: add SHA-256 hash column + index to StickerScan for duplicate-receipt detection.

ALTER TABLE "StickerScan" ADD COLUMN IF NOT EXISTS "receiptImageHash" TEXT;
CREATE INDEX IF NOT EXISTS "StickerScan_receiptImageHash_idx" ON "StickerScan" ("receiptImageHash");
