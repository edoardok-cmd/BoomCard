-- One-time normalization: snap legacy over-cap offer discounts to the 25% program cap.
--
-- Context: DISCOUNT_STEPS = [5, 10, 15, 20, 25] is now enforced on both writes
-- and reads (partnerTypes + offers.service + partner-dashboard utils). A small
-- number of offers were created before the cap and still hold 35/45 in
-- "discountPercent". The dropdown snaps them on display, but raw reads
-- (orderBy discountPercent desc in top-discounts, gte range filters,
-- update-path validation that falls back to existing.discountPercent) still
-- see the un-snapped values, so legacy over-cap offers currently sort above
-- every compliant 25% offer in public listings.
--
-- Run:
--   psql "$DATABASE_URL" -f scripts/normalize-legacy-offer-discounts.sql

BEGIN;

SELECT id, title, "discountPercent"
FROM "Offer"
WHERE "discountPercent" > 25;

UPDATE "Offer"
SET "discountPercent" = 25
WHERE "discountPercent" > 25;

COMMIT;
