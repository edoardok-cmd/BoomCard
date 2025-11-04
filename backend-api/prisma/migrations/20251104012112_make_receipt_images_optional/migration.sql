-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "cardId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "discount" REAL;
ALTER TABLE "Transaction" ADD COLUMN "discountAmount" REAL;
ALTER TABLE "Transaction" ADD COLUMN "finalAmount" REAL;
ALTER TABLE "Transaction" ADD COLUMN "venueId" TEXT;

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "qrCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sticker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "locationType" TEXT NOT NULL DEFAULT 'TABLE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "printedAt" DATETIME,
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "totalScans" INTEGER NOT NULL DEFAULT 0,
    "lastScannedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sticker_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Sticker_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StickerLocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StickerLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBg" TEXT,
    "locationType" TEXT NOT NULL DEFAULT 'TABLE',
    "locationNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "floor" TEXT,
    "section" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StickerLocation_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StickerScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "billAmount" REAL NOT NULL,
    "verifiedAmount" REAL,
    "cashbackPercent" REAL NOT NULL,
    "cashbackAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "latitude" REAL,
    "longitude" REAL,
    "distance" REAL,
    "receiptImageUrl" TEXT,
    "ocrData" TEXT,
    "fraudScore" REAL NOT NULL DEFAULT 0,
    "fraudReasons" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "transactionId" TEXT,
    "rejectionReason" TEXT,
    "processedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StickerScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StickerScan_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StickerScan_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StickerScan_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StickerScan_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VenueStickerConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT NOT NULL,
    "cashbackPercent" REAL NOT NULL DEFAULT 5.0,
    "premiumBonus" REAL NOT NULL DEFAULT 2.0,
    "platinumBonus" REAL NOT NULL DEFAULT 5.0,
    "minBillAmount" REAL NOT NULL DEFAULT 10.0,
    "maxCashbackPerScan" REAL,
    "maxScansPerDay" INTEGER NOT NULL DEFAULT 3,
    "maxScansPerMonth" INTEGER NOT NULL DEFAULT 30,
    "gpsVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gpsRadiusMeters" INTEGER NOT NULL DEFAULT 100,
    "ocrVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveThreshold" REAL NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VenueStickerConfig_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT,
    "venueId" TEXT,
    "offerId" TEXT,
    "cardId" TEXT,
    "imageUrl" TEXT,
    "imageKey" TEXT,
    "imageHash" TEXT,
    "ocrRawText" TEXT,
    "ocrData" TEXT,
    "merchantName" TEXT,
    "totalAmount" REAL,
    "verifiedAmount" REAL,
    "receiptDate" DATETIME,
    "items" TEXT,
    "cashbackPercent" REAL NOT NULL DEFAULT 0,
    "cashbackAmount" REAL NOT NULL DEFAULT 0,
    "ocrConfidence" REAL NOT NULL DEFAULT 0,
    "fraudScore" REAL NOT NULL DEFAULT 0,
    "fraudReasons" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "submissionCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "reviewNotes" TEXT,
    "rejectionReason" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Receipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" ("cardId", "cashbackAmount", "cashbackPercent", "createdAt", "fraudReasons", "fraudScore", "id", "imageHash", "imageKey", "imageUrl", "ipAddress", "items", "latitude", "longitude", "merchantName", "metadata", "ocrConfidence", "ocrData", "ocrRawText", "offerId", "receiptDate", "rejectionReason", "reviewNotes", "reviewedAt", "reviewedBy", "status", "submissionCount", "totalAmount", "transactionId", "updatedAt", "userAgent", "userId", "venueId", "verifiedAmount") SELECT "cardId", "cashbackAmount", "cashbackPercent", "createdAt", "fraudReasons", "fraudScore", "id", "imageHash", "imageKey", "imageUrl", "ipAddress", "items", "latitude", "longitude", "merchantName", "metadata", "ocrConfidence", "ocrData", "ocrRawText", "offerId", "receiptDate", "rejectionReason", "reviewNotes", "reviewedAt", "reviewedBy", "status", "submissionCount", "totalAmount", "transactionId", "updatedAt", "userAgent", "userId", "venueId", "verifiedAmount" FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
CREATE UNIQUE INDEX "Receipt_transactionId_key" ON "Receipt"("transactionId");
CREATE INDEX "Receipt_userId_idx" ON "Receipt"("userId");
CREATE INDEX "Receipt_venueId_idx" ON "Receipt"("venueId");
CREATE INDEX "Receipt_status_idx" ON "Receipt"("status");
CREATE INDEX "Receipt_imageHash_idx" ON "Receipt"("imageHash");
CREATE INDEX "Receipt_createdAt_idx" ON "Receipt"("createdAt");
CREATE INDEX "Receipt_merchantName_idx" ON "Receipt"("merchantName");
CREATE INDEX "Receipt_fraudScore_idx" ON "Receipt"("fraudScore");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Card_cardNumber_key" ON "Card"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Card_qrCode_key" ON "Card"("qrCode");

-- CreateIndex
CREATE INDEX "Card_userId_idx" ON "Card"("userId");

-- CreateIndex
CREATE INDEX "Card_cardNumber_idx" ON "Card"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_stickerId_key" ON "Sticker"("stickerId");

-- CreateIndex
CREATE UNIQUE INDEX "Sticker_qrCode_key" ON "Sticker"("qrCode");

-- CreateIndex
CREATE INDEX "Sticker_venueId_idx" ON "Sticker"("venueId");

-- CreateIndex
CREATE INDEX "Sticker_locationId_idx" ON "Sticker"("locationId");

-- CreateIndex
CREATE INDEX "Sticker_stickerId_idx" ON "Sticker"("stickerId");

-- CreateIndex
CREATE INDEX "Sticker_status_idx" ON "Sticker"("status");

-- CreateIndex
CREATE INDEX "StickerLocation_venueId_idx" ON "StickerLocation"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "StickerLocation_venueId_locationNumber_locationType_key" ON "StickerLocation"("venueId", "locationNumber", "locationType");

-- CreateIndex
CREATE UNIQUE INDEX "StickerScan_transactionId_key" ON "StickerScan"("transactionId");

-- CreateIndex
CREATE INDEX "StickerScan_userId_idx" ON "StickerScan"("userId");

-- CreateIndex
CREATE INDEX "StickerScan_stickerId_idx" ON "StickerScan"("stickerId");

-- CreateIndex
CREATE INDEX "StickerScan_venueId_idx" ON "StickerScan"("venueId");

-- CreateIndex
CREATE INDEX "StickerScan_cardId_idx" ON "StickerScan"("cardId");

-- CreateIndex
CREATE INDEX "StickerScan_status_idx" ON "StickerScan"("status");

-- CreateIndex
CREATE INDEX "StickerScan_createdAt_idx" ON "StickerScan"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VenueStickerConfig_venueId_key" ON "VenueStickerConfig"("venueId");

-- CreateIndex
CREATE INDEX "VenueStickerConfig_venueId_idx" ON "VenueStickerConfig"("venueId");

-- CreateIndex
CREATE INDEX "Transaction_venueId_idx" ON "Transaction"("venueId");

-- CreateIndex
CREATE INDEX "Transaction_cardId_idx" ON "Transaction"("cardId");
