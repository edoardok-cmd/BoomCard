-- Spec §5.5 — add merchantNameVariations to VenueReceiptTemplate.
--
-- The spec lists "Вариации | Допустими различия" as a distinct receipt-profile
-- field for alternate merchant name spellings (e.g. "Кафе Централ" vs
-- "KAFE CENTRAL"). Previously only expectedKeywords was available; variations
-- are named merchant strings that the OCR matcher checks before falling back
-- to keyword matching.
--
-- IDEMPOTENT: the DO block checks for column existence before adding.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'VenueReceiptTemplate'
      AND column_name = 'merchantNameVariations'
  ) THEN
    ALTER TABLE "VenueReceiptTemplate"
      ADD COLUMN "merchantNameVariations" TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
