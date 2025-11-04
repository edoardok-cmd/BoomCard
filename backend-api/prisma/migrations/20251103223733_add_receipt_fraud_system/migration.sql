/*
  Warnings:

  - You are about to drop the column `confidence` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `isValidated` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `rawText` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `validatedAt` on the `Receipt` table. All the data in the column will be lost.
  - You are about to drop the column `validatedBy` on the `Receipt` table. All the data in the column will be lost.
  - Made the column `imageHash` on table `Receipt` required. This step will fail if there are existing NULL values in that column.
  - Made the column `imageUrl` on table `Receipt` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "ReceiptAnalytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "totalReceipts" INTEGER NOT NULL DEFAULT 0,
    "approvedReceipts" INTEGER NOT NULL DEFAULT 0,
    "rejectedReceipts" INTEGER NOT NULL DEFAULT 0,
    "pendingReceipts" INTEGER NOT NULL DEFAULT 0,
    "totalCashback" REAL NOT NULL DEFAULT 0,
    "totalSpent" REAL NOT NULL DEFAULT 0,
    "averageReceiptAmount" REAL NOT NULL DEFAULT 0,
    "topMerchant" TEXT,
    "lastReceiptDate" DATETIME,
    "successRate" REAL NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MerchantWhitelist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "merchantName" TEXT NOT NULL,
    "nameBg" TEXT,
    "taxId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "addedBy" TEXT,
    "reason" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VenueFraudConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueId" TEXT,
    "partnerId" TEXT,
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
    "autoApproveThreshold" REAL NOT NULL DEFAULT 30,
    "autoRejectThreshold" REAL NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT,
    "imageHash" TEXT NOT NULL,
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
INSERT INTO "new_Receipt" ("createdAt", "id", "imageHash", "imageKey", "imageUrl", "items", "merchantName", "metadata", "rejectionReason", "status", "totalAmount", "transactionId", "updatedAt", "userId") SELECT "createdAt", "id", "imageHash", "imageKey", "imageUrl", "items", "merchantName", "metadata", "rejectionReason", "status", "totalAmount", "transactionId", "updatedAt", "userId" FROM "Receipt";
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
CREATE UNIQUE INDEX "ReceiptAnalytics_userId_key" ON "ReceiptAnalytics"("userId");

-- CreateIndex
CREATE INDEX "ReceiptAnalytics_userId_idx" ON "ReceiptAnalytics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantWhitelist_merchantName_key" ON "MerchantWhitelist"("merchantName");

-- CreateIndex
CREATE INDEX "MerchantWhitelist_status_idx" ON "MerchantWhitelist"("status");

-- CreateIndex
CREATE INDEX "MerchantWhitelist_merchantName_idx" ON "MerchantWhitelist"("merchantName");

-- CreateIndex
CREATE UNIQUE INDEX "VenueFraudConfig_venueId_key" ON "VenueFraudConfig"("venueId");

-- CreateIndex
CREATE INDEX "VenueFraudConfig_venueId_idx" ON "VenueFraudConfig"("venueId");

-- CreateIndex
CREATE INDEX "VenueFraudConfig_partnerId_idx" ON "VenueFraudConfig"("partnerId");
