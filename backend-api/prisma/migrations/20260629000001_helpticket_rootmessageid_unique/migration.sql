-- Step 1: Remove duplicate rootMessageId rows, keeping the earliest-created ticket per message.
-- Required because the original bug allowed duplicate creation; running this migration
-- on a database that experienced the bug would fail without this dedup.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "rootMessageId" ORDER BY "createdAt" ASC
    ) AS rn
  FROM "HelpTicket"
  WHERE "rootMessageId" IS NOT NULL
)
DELETE FROM "HelpTicket" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Create the partial unique index.
-- IF NOT EXISTS makes this re-runnable if the migration was previously bypassed via resolve --applied.
-- NULL rootMessageId values are excluded so pre-existing tickets without a messageId are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "HelpTicket_rootMessageId_unique"
  ON "HelpTicket"("rootMessageId")
  WHERE "rootMessageId" IS NOT NULL;
