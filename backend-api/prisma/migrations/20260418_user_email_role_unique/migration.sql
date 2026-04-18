-- Drop the legacy single-column unique on User.email (pre-dating the
-- USER+PARTNER shared-email feature) and replace it with a composite
-- unique on (email, role).
--
-- Why this migration exists:
--   schema.prisma removed `@unique` from User.email when shared-email
--   support was introduced, but the index was patched only on dev-Neon
--   via `prisma db push` — no committed migration ever dropped it.
--   Result: prod (and any newly-bootstrapped env) still has
--   User_email_key, and partner-register on an email that already
--   has a USER account 500s with P2002. This migration fixes that.
--
-- IF EXISTS / IF NOT EXISTS so the migration is idempotent across
-- environments that may already have had the schema patched manually.

DROP INDEX IF EXISTS "User_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_role_key" ON "User"("email", "role");
