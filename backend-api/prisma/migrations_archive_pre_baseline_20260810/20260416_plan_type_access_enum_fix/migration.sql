-- Finding #3 fix: PlanTypeAccess.plan was created as TEXT in an earlier migration but the
-- Prisma schema declares it as the SubscriptionPlan enum. Prisma 7 with adapter-pg now emits
-- `WHERE plan = $1::"SubscriptionPlan"` which fails with "operator does not exist: text = SubscriptionPlan".
--
-- This migration converts the column to the proper enum type. Safe because all existing values
-- ('LIGHT' / 'BASIC' / 'PREMIUM') are already valid enum labels.
--
-- Idempotent: only runs the ALTER when the column is still TEXT.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'PlanTypeAccess'
      AND column_name = 'plan'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE "PlanTypeAccess"
      ALTER COLUMN "plan" TYPE "SubscriptionPlan"
      USING "plan"::"SubscriptionPlan";
  END IF;
END $$;
