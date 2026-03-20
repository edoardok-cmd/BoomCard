-- CreateTable: OfferRedemption
-- Tracks each user's redemption of an offer.
-- Prevents double-redemption (@@unique on userId + offerId).
-- Persists the one-time code so partners can verify it.

CREATE TABLE "OfferRedemption" (
    "id"         TEXT NOT NULL,
    "offerId"    TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "code"       TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferRedemption_pkey" PRIMARY KEY ("id")
);

-- Unique: one redemption code is globally unique
CREATE UNIQUE INDEX "OfferRedemption_code_key" ON "OfferRedemption"("code");

-- Unique: one redemption per user per offer
CREATE UNIQUE INDEX "OfferRedemption_userId_offerId_key" ON "OfferRedemption"("userId", "offerId");

-- Indexes
CREATE INDEX "OfferRedemption_offerId_idx"  ON "OfferRedemption"("offerId");
CREATE INDEX "OfferRedemption_userId_idx"   ON "OfferRedemption"("userId");
CREATE INDEX "OfferRedemption_expiresAt_idx" ON "OfferRedemption"("expiresAt");

-- ForeignKeys
ALTER TABLE "OfferRedemption"
    ADD CONSTRAINT "OfferRedemption_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferRedemption"
    ADD CONSTRAINT "OfferRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
