-- BC-ADMIN-AUDIT-FIX-006 — Transaction.subscriptionId FK for per-subscription payment history
--
-- Scope: Add subscriptionId FK to Transaction table to enable attribution of subscription
-- payments to their corresponding Subscription records. Previously, Transaction rows of
-- type SUBSCRIPTION carried no FK, blocking per-subscription payment display in the admin
-- subscriptions history view (spec §3.3 "Payment history").
--
-- Backfill strategy: Payment transactions (type=SUBSCRIPTION) are matched to Subscription
-- rows by:
--   1. Same user (Transaction.userId = Subscription.userId)
--   2. Temporal overlap: Transaction createdAt falls within a Subscription's billing period
--      (createdAt >= currentPeriodStart AND createdAt < currentPeriodEnd)
--   3. Latest matching subscription in case of multiple overlaps (ORDER BY currentPeriodStart DESC)
--
-- Rationale for safety under concurrent writes:
--   - ADD COLUMN with nullable default is fast; PostgreSQL 11+ executes it catalog-only
--     (no full-table rewrite or blocking lock).
--   - Backfill uses a deterministic window-based match, idempotent on replay.
--   - Rows not matched by the window heuristic keep NULL (safe — payments not derivably
--     attributed remain unattributed rather than incorrectly guessed).
--   - FK constraint uses onDelete: SetNull, so Subscription deletions preserve payment audit.
--
-- Idempotency: All steps use IF NOT EXISTS or DROP IF EXISTS guards for replay safety.

-- Step 1: Add subscriptionId column if not present. The column is nullable
-- by design — payments not derivably matched keep NULL rather than guessing.
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;

-- Step 2: Drop any pre-existing FK constraint (safe with IF EXISTS)
ALTER TABLE "Transaction"
  DROP CONSTRAINT IF EXISTS "Transaction_subscriptionId_fkey";

-- Step 3: Add the foreign key constraint. SetNull on delete preserves the payment row
-- if the Subscription is deleted, maintaining audit trail.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
  ON DELETE SET NULL;

-- Step 4: Backfill Transaction rows with type='SUBSCRIPTION' by matching their
-- createdAt against overlapping Subscription billing periods.
-- This is a deterministic, idempotent operation (matches same rows on replay).
UPDATE "Transaction" t
  SET "subscriptionId" = (
    SELECT s.id
    FROM "Subscription" s
    WHERE s."userId" = t."userId"
      AND t."type" = 'SUBSCRIPTION'
      AND t."createdAt" >= s."currentPeriodStart"
      AND t."createdAt" < s."currentPeriodEnd"
    ORDER BY s."currentPeriodStart" DESC
    LIMIT 1
  )
WHERE t."type" = 'SUBSCRIPTION'
  AND t."subscriptionId" IS NULL;

-- Step 5: Create index on subscriptionId for faster lookups in the history route.
-- IF NOT EXISTS makes this idempotent.
CREATE INDEX IF NOT EXISTS "Transaction_subscriptionId_idx"
  ON "Transaction"("subscriptionId");
