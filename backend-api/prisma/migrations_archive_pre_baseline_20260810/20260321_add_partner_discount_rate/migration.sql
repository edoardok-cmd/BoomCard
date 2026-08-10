-- Add discountRate column to Partner.
-- Stores the effective discount % offered to cardholders.
-- NULL means the tier default applies (BASIC=10%, LIGHT=20%, PREMIUM=20%).
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "discountRate" DOUBLE PRECISION;
