-- Manual migration: run BEFORE `prisma db push` for the audit-fix changes.
-- These DDL statements require explicit SQL because prisma db push cannot
-- safely rename enum values or columns without data loss.
--
-- Run order matters: rename enums/columns first, then push the schema.
--
-- ─── C3: Rename SubscriptionPlan.LIGHT → PREMIUM_WEEKLY ──────────────────────
-- Renames the enum value in place — no row rewrite needed (PostgreSQL 10+).
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'LIGHT' TO 'PREMIUM_WEEKLY';

-- ─── C3: Rename CardType.LIGHT → PREMIUM_WEEKLY ──────────────────────────────
ALTER TYPE "CardType" RENAME VALUE 'LIGHT' TO 'PREMIUM_WEEKLY';

-- ─── C3: Update Plan.planCode string values (not an enum — plain text column) ─
UPDATE plans SET "planCode" = 'PREMIUM_WEEKLY' WHERE "planCode" = 'LIGHT';

-- ─── C2: Add subscriptionId FK to transactions ────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;
ALTER TABLE transactions
  ADD CONSTRAINT "transactions_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES subscriptions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX IF NOT EXISTS "transactions_subscriptionId_idx" ON transactions("subscriptionId");

-- ─── C1: Add marginAmount to transactions ────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "marginAmount" DOUBLE PRECISION;

-- ─── m2: Rename gracePeriodEndsAt → pauseEndsAt on subscriptions ──────────────
ALTER TABLE subscriptions RENAME COLUMN "gracePeriodEndsAt" TO "pauseEndsAt";

-- ─── m3: Restrict hard-delete cascade on subscriptions / wallet_transactions ──
-- Protects subscription and cashback history from accidental hard-deletes.
-- Only the explicit soft-delete pattern (setting deletedAt) is permitted.
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS "subscriptions_userId_fkey";
ALTER TABLE subscriptions
  ADD CONSTRAINT "subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES users(id)
  ON DELETE RESTRICT;

ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS "wallet_transactions_walletId_fkey";
ALTER TABLE wallet_transactions
  ADD CONSTRAINT "wallet_transactions_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES wallets(id)
  ON DELETE RESTRICT;
