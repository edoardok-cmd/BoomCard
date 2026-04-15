-- Catch-up migration: add schema objects that were never created via migration.

-- ────────────────────────────────────────────────────────────
-- 1. User: password-reset fields + GDPR consent tracking
-- ────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetExpires" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);

-- ────────────────────────────────────────────────────────────
-- 2. NotificationType enum: add missing values
-- ────────────────────────────────────────────────────────────
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STICKER_SCAN_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FRAUD_ALERT';

-- ────────────────────────────────────────────────────────────
-- 3. CashbackRate table (@@map("cashback_rates"))
-- ────────────────────────────────────────────────────────────
CREATE TABLE "cashback_rates" (
    "id"            TEXT NOT NULL,
    "discountStep"  INTEGER NOT NULL,
    "basic"         DOUBLE PRECISION NOT NULL,
    "premium"       DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"     TEXT,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cashback_rates_discountStep_idx" ON "cashback_rates"("discountStep");
CREATE INDEX "cashback_rates_effectiveFrom_idx" ON "cashback_rates"("effectiveFrom");
