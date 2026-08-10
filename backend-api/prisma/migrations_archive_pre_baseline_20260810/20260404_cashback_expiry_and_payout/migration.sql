-- Cashback expiry: each CASHBACK_CREDIT transaction carries a 60-day expiry window.
-- Oldest cashback expires first (cascading). NULL = non-cashback transaction.
ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "cashbackExpiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "wallet_transactions_cashbackExpiresAt_idx"
  ON "wallet_transactions" ("cashbackExpiresAt");
