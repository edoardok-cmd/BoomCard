-- AlterTable: Receipt — add device fingerprint columns
ALTER TABLE "Receipt" ADD COLUMN "deviceFingerprint" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "deviceFingerprintRaw" TEXT;

-- AlterTable: StickerScan — add device fingerprint columns
ALTER TABLE "StickerScan" ADD COLUMN "deviceFingerprint" TEXT;
ALTER TABLE "StickerScan" ADD COLUMN "deviceFingerprintRaw" TEXT;

-- CreateIndex: compound index for device history queries
CREATE INDEX "Receipt_userId_deviceFingerprint_idx" ON "Receipt"("userId", "deviceFingerprint");
CREATE INDEX "StickerScan_userId_deviceFingerprint_idx" ON "StickerScan"("userId", "deviceFingerprint");
