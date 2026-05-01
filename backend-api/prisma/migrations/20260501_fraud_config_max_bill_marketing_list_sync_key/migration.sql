-- §7.4 Fraud rules: optional upper cap on eligible bill amount for cashback.
ALTER TABLE "VenueFraudConfig" ADD COLUMN IF NOT EXISTS "maxBillAmount" DOUBLE PRECISION;

-- §8 Marketing lists: stable sync key for seeding default lists idempotently.
ALTER TABLE "MarketingList" ADD COLUMN IF NOT EXISTS "syncKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "MarketingList_syncKey_key" ON "MarketingList"("syncKey");
