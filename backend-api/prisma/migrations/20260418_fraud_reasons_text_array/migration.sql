-- Migrate fraudReasons from TEXT (holding JSON-encoded string arrays) to native TEXT[].
--
-- Why: the TEXT column forced every reason append to read-modify-write the JSON blob,
-- which races admin edits against async OCR enrichment (sticker.service.ts:910 — the
-- merchant-verification path). Switching to TEXT[] lets us use Postgres array_append
-- via Prisma's `{ push: x }`, which is atomic at the DB layer.
--
-- Existing data: a mix of NULL, JSON arrays like '["DUPLICATE_IMAGE_HASH"]',
-- '[]' (empty arrays), and bare strings like '["DUPLICATE_IMAGE_HASH_BACKFILL"]'
-- written by 20260417_sticker_scan_receipt_image_hash_unique. The USING clause must
-- handle all three plus malformed rows defensively (we never want a migration to
-- abort on bad data — log-and-default-to-empty is preferred).

-- Helper: parse a JSON-array TEXT into TEXT[], returning '{}' for null/empty/malformed.
-- We define it inside this migration's transaction so it doesn't pollute the schema.
CREATE OR REPLACE FUNCTION pg_temp.fraud_reasons_to_array(raw TEXT)
RETURNS TEXT[] AS $$
BEGIN
  IF raw IS NULL OR raw = '' THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  BEGIN
    RETURN ARRAY(SELECT json_array_elements_text(raw::json));
  EXCEPTION WHEN others THEN
    -- Bad JSON: keep the raw string as a single-element array so admins can still
    -- see it in the dashboard rather than silently dropping the signal.
    RETURN ARRAY[raw]::TEXT[];
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Receipt.fraudReasons: TEXT? -> TEXT[] (non-null, default '{}')
ALTER TABLE "Receipt"
  ALTER COLUMN "fraudReasons" DROP DEFAULT,
  ALTER COLUMN "fraudReasons" TYPE TEXT[] USING pg_temp.fraud_reasons_to_array("fraudReasons"),
  ALTER COLUMN "fraudReasons" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "fraudReasons" SET NOT NULL;

-- StickerScan.fraudReasons: TEXT? -> TEXT[] (non-null, default '{}')
ALTER TABLE "StickerScan"
  ALTER COLUMN "fraudReasons" DROP DEFAULT,
  ALTER COLUMN "fraudReasons" TYPE TEXT[] USING pg_temp.fraud_reasons_to_array("fraudReasons"),
  ALTER COLUMN "fraudReasons" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "fraudReasons" SET NOT NULL;
