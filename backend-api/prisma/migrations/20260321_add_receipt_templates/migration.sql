-- Add perceptualHash to Receipt table
ALTER TABLE "Receipt" ADD COLUMN "perceptualHash" TEXT;
CREATE INDEX "Receipt_perceptualHash_idx" ON "Receipt"("perceptualHash");

-- Extend VenueFraudConfig with template matching settings
ALTER TABLE "VenueFraudConfig"
  ADD COLUMN "templateMatchEnabled"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "templateVisualWeight"      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "templateMerchantWeight"    DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  ADD COLUMN "templateKeywordWeight"     DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  ADD COLUMN "templateMinSimilarity"     DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  ADD COLUMN "templateFraudPoints"       INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "templateMerchantThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

-- Create VenueReceiptTemplate table
CREATE TABLE "VenueReceiptTemplate" (
  "id"               TEXT NOT NULL,
  "venueId"          TEXT NOT NULL,
  "merchantName"     TEXT NOT NULL,
  "description"      TEXT,
  "expectedKeywords" TEXT,
  "imageUrl"         TEXT NOT NULL,
  "imageKey"         TEXT NOT NULL,
  "perceptualHash"   TEXT NOT NULL,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "uploadedBy"       TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VenueReceiptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VenueReceiptTemplate_venueId_idx"          ON "VenueReceiptTemplate"("venueId");
CREATE INDEX "VenueReceiptTemplate_venueId_isActive_idx" ON "VenueReceiptTemplate"("venueId", "isActive");
