-- CreateIndex: wallet_transactions.stripePaymentIntentId
-- Supports the TOP_UP idempotency check in handlePaymentSucceeded webhook handler.

CREATE INDEX "wallet_transactions_stripePaymentIntentId_idx" ON "wallet_transactions"("stripePaymentIntentId");
