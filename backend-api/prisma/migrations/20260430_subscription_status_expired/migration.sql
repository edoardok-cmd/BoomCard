-- prisma:no-transaction
-- Spec §4.2: distinguish natural billing-period lapse from user-initiated cancel.
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction block,
-- so the no-transaction directive above tells `prisma migrate deploy` to skip
-- the implicit BEGIN/COMMIT wrapper for this file.
--
-- Note: this repo currently deploys schema with `prisma db push`, which IGNORES
-- the migrations/ folder entirely (it diffs schema.prisma directly). The new
-- enum value is therefore applied via the schema diff on `db push`, and this
-- file exists for the day we switch to `migrate deploy` (or for manual psql
-- replay against a fresh PG instance).

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
