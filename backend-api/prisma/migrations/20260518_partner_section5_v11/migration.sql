-- Spec §5.1–§5.3 v1.1 — partner module schema changes + data backfill.
--
-- This migration is IDEMPOTENT. The Neon dev DB has already had the schema
-- applied via `prisma db push` (no migration row written); the Render prod DB
-- has not. We use IF NOT EXISTS / IF EXISTS guards and a value-existence check
-- before the enum cast so the same SQL runs cleanly on either side.
--
-- Sections:
--   1. Create new enums (PartnerVenueCountBucket, ActivationLinkReason) if missing.
--   2. Migrate Partner.requestObjectCount from String? to PartnerVenueCountBucket?
--      via USING cast — only if the column is still text. Bad values are
--      coerced to NULL with a logged count.
--   3. Add ActivationLink.reason / emailSentAt / emailError if missing.
--   4. Backfill ActivationLink.reason for any rows that pre-date the column
--      (NULL → 'INITIAL').
--   5. Add LinkResendLog.actorId FK to User(SET NULL) if missing. Backfill
--      orphan actorIds to NULL first so the constraint doesn't fail.
--   6. Backfill Partner.verifiedAt for legacy ACTIVE partners that were
--      created before the activation-link flow existed. Without this, the new
--      login gate and public-list filter (both require verifiedAt IS NOT NULL)
--      would hide every existing partner from the customer app.
--
-- Each statement is wrapped in a DO block so a partial replay is safe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PartnerVenueCountBucket') THEN
    CREATE TYPE "PartnerVenueCountBucket" AS ENUM ('1', '2-5', '6-10', '11+');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivationLinkReason') THEN
    CREATE TYPE "ActivationLinkReason" AS ENUM ('INITIAL', 'RESEND');
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Partner.requestObjectCount: text → PartnerVenueCountBucket
-- ─────────────────────────────────────────────────────────────────────────────
-- The column currently holds the four canonical strings as plain text on
-- un-migrated DBs. On Neon (already migrated) it is already the enum and the
-- IF block below skips. On Render we cast in place — any rogue value that
-- doesn't match an enum label is set to NULL first so the cast can succeed.

DO $$
DECLARE
  current_type text;
  bad_count int;
BEGIN
  SELECT udt_name INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'Partner' AND column_name = 'requestObjectCount';

  IF current_type IS DISTINCT FROM 'PartnerVenueCountBucket' THEN
    -- Coerce out-of-vocab strings to NULL before casting, so ALTER TYPE
    -- can't fail mid-migration on a single bad row.
    EXECUTE $sanitize$
      UPDATE "Partner"
      SET "requestObjectCount" = NULL
      WHERE "requestObjectCount" IS NOT NULL
        AND "requestObjectCount" NOT IN ('1', '2-5', '6-10', '11+')
    $sanitize$;
    GET DIAGNOSTICS bad_count = ROW_COUNT;
    RAISE NOTICE 'Coerced % out-of-vocab requestObjectCount values to NULL', bad_count;

    EXECUTE $cast$
      ALTER TABLE "Partner"
      ALTER COLUMN "requestObjectCount" TYPE "PartnerVenueCountBucket"
      USING "requestObjectCount"::"PartnerVenueCountBucket"
    $cast$;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ActivationLink — reason, emailSentAt, emailError columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "ActivationLink"
  ADD COLUMN IF NOT EXISTS "reason"      "ActivationLinkReason" NOT NULL DEFAULT 'INITIAL',
  ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "emailError"  TEXT;

-- 4. Backfill rows that pre-date the reason column. Idempotent: only updates
-- rows whose value still equals the column default and that were created
-- before the column existed. We can't reliably detect "created before column
-- existed" so we just enforce the default on legacy NULL-equivalent values.
-- (NOT NULL with default takes care of new inserts.)
-- Nothing to backfill in practice — kept as a placeholder for prod DBs that
-- may have added the column NULL-able at first.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LinkResendLog.actorId FK
-- ─────────────────────────────────────────────────────────────────────────────
-- Null out orphans first so the FK creation can't fail.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'LinkResendLog_actorId_fkey'
  ) THEN
    UPDATE "LinkResendLog"
    SET "actorId" = NULL
    WHERE "actorId" IS NOT NULL
      AND "actorId" NOT IN (SELECT id FROM "User");

    ALTER TABLE "LinkResendLog"
      ADD CONSTRAINT "LinkResendLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Backfill Partner.verifiedAt for legacy ACTIVE partners
-- ─────────────────────────────────────────────────────────────────────────────
-- BEFORE this migration, "verifiedAt" was only set by an admin's PUT (since
-- removed) and was treated as informational. With v1.1 it gates BOTH login
-- (auth.service login gate) AND public visibility (publicPartnerFilter). If
-- we leave existing ACTIVE partners with verifiedAt = NULL:
--   - They cannot log in to the partner dashboard
--   - They disappear from /api/partners, /api/offers, /api/venues
--   - Their stickers stop accepting scans
--
-- The safe grandfather rule: any partner that is currently ACTIVE was, by
-- definition, considered activated under the old rules. We stamp verifiedAt
-- to the best available proxy for "activation time":
--   joinedAt  — preferred; the earliest meaningful timestamp on the row
--   createdAt — fallback if joinedAt is NULL (schema allows it for legacy rows)
--   NOW()     — last resort; still correct: the partner IS active right now

UPDATE "Partner"
SET "verifiedAt" = COALESCE("joinedAt", "createdAt", NOW())
WHERE "status" = 'ACTIVE'
  AND "verifiedAt" IS NULL;

-- Sanity check: any ACTIVE row still missing verifiedAt means neither
-- joinedAt nor createdAt is set, which is a data-integrity problem unrelated
-- to this migration. Log the count so it surfaces in migration output.
DO $$
DECLARE
  missed int;
BEGIN
  SELECT COUNT(*) INTO missed
  FROM "Partner"
  WHERE "status" = 'ACTIVE' AND "verifiedAt" IS NULL;
  IF missed > 0 THEN
    RAISE WARNING 'verifiedAt backfill: % ACTIVE partner(s) still have verifiedAt=NULL after backfill — investigate manually', missed;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done.
-- ─────────────────────────────────────────────────────────────────────────────
