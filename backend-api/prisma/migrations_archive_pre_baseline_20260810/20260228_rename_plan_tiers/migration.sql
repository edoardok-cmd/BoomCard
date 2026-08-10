-- Rename SubscriptionPlan enum values: STANDARD→LIGHT, PREMIUM→BASIC, PLATINUM→PREMIUM
-- Order matters: rename PREMIUM before PLATINUM to avoid collision

-- Step 1: STANDARD → LIGHT (no collision)
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'STANDARD' TO 'LIGHT';

-- Step 2: PREMIUM → BASIC (frees up 'PREMIUM' name)
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'PREMIUM' TO 'BASIC';

-- Step 3: PLATINUM → PREMIUM (now 'PREMIUM' is available)
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'PLATINUM' TO 'PREMIUM';


-- Rename CardType enum values: same mapping
ALTER TYPE "CardType" RENAME VALUE 'STANDARD' TO 'LIGHT';
ALTER TYPE "CardType" RENAME VALUE 'PREMIUM' TO 'BASIC';
ALTER TYPE "CardType" RENAME VALUE 'PLATINUM' TO 'PREMIUM';

-- Update default value for Card.type column
ALTER TABLE "Card" ALTER COLUMN "type" SET DEFAULT 'LIGHT'::"CardType";

-- Update Plan table: only rename STANDARD → LIGHT
-- (BASIC and PREMIUM rows already exist from seed with correct codes)
UPDATE "plans" SET "planCode" = 'LIGHT' WHERE "planCode" = 'STANDARD';
