-- CreateIndex: composite indexes for hot query paths

-- Receipt: perceptual-hash duplicate check scoped to user
CREATE INDEX "Receipt_userId_perceptualHash_idx" ON "Receipt"("userId", "perceptualHash");

-- Receipt: daily/monthly submission-count queries for rate limiting
CREATE INDEX "Receipt_userId_createdAt_idx" ON "Receipt"("userId", "createdAt");

-- Offer: active-offer list queries (status + featured + date range)
CREATE INDEX "Offer_status_isFeatured_startDate_endDate_idx" ON "Offer"("status", "isFeatured", "startDate", "endDate");
