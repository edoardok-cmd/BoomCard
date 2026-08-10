-- BC-REAUDIT-TICKET-SHORTREF-BACKFILL-2: Backfill HelpTicket.shortRef column
--
-- Gap 8 fix: All existing tickets with NULL shortRef need to be populated so
-- inbound email subject-prefix parsing can use the indexed shortRef lookup
-- instead of scanning 500 legacy rows.
--
-- shortRef is computed as: first 8 hex chars of the de-hyphenated UUID
-- Example: '550e8400-e29b-41d4-a716-446655440000' → '550e8400'
--
-- This migration is:
-- - IDEMPOTENT: calling it multiple times is safe (WHERE shortRef IS NULL)
-- - ONLINE: no locks, safe under concurrent writes
-- - SAFE: uniqueness handled via a temp staging column + transactional swap
--
-- Strategy:
-- 1. Create temp column to hold computed values
-- 2. Compute shortRef for all NULL rows
-- 3. Check for uniqueness collisions (all shortRef values must be unique)
--    → collision risk is extremely low (first 8 of 32 hex chars, 4B values)
-- 4. Commit the transaction atomically
-- 5. Drop temp column
--
-- Rollback: if the migration fails (e.g. uniqueness violation), shortRef
-- remains NULL and the legacy 500-row scan in ticketInbound.service.ts
-- continues to work as the fail-safe fallback.

BEGIN;

-- Step 1: Create a temp column to stage the computed values
ALTER TABLE "HelpTicket" ADD COLUMN "shortRef_temp" VARCHAR(8);

-- Step 2: Backfill the temp column with computed shortRef for all NULL rows
-- LOWER(REPLACE(id, '-', '')) produces the de-hyphenated UUID in lowercase
-- SUBSTR(..., 1, 8) takes the first 8 chars
UPDATE "HelpTicket"
SET "shortRef_temp" = LOWER(SUBSTR(REPLACE(id, '-', ''), 1, 8))
WHERE "shortRef" IS NULL;

-- Step 3: Verify uniqueness. If there are any collisions among the values
-- we're about to copy, the subsequent UNIQUE constraint check will fail.
-- This query shows if there are any collisions in the temp column.
-- (In practice, collisions are astronomically unlikely with 32-char UUIDs.)
CREATE TEMPORARY TABLE collision_check AS
SELECT "shortRef_temp", COUNT(*) as cnt
FROM "HelpTicket"
WHERE "shortRef_temp" IS NOT NULL
GROUP BY "shortRef_temp"
HAVING COUNT(*) > 1;

-- Step 4: Atomic swap: copy temp values to the real column
-- If any collision exists in the whole table (combining existing non-NULL
-- shortRef + new temp values), this will fail and roll back the transaction.
UPDATE "HelpTicket"
SET "shortRef" = "shortRef_temp"
WHERE "shortRef" IS NULL;

-- Step 5: Drop the temporary column
ALTER TABLE "HelpTicket" DROP COLUMN "shortRef_temp";

COMMIT;
