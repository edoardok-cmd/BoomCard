-- GIN index on RefreshToken.accountGroup (TEXT[]) so the
-- `accountGroup: { has: userId }` filter used by password rotation /
-- account deletion doesn't seq-scan the table. Without this, every
-- changePassword / resetPassword / deleteAccount does an O(N) scan of
-- every refresh row in the DB — fine in dev, ugly in prod.
--
-- IF NOT EXISTS guard: dev/Neon may have this added via `prisma db push`
-- before the migration file was written; prod runs the real branch.
CREATE INDEX IF NOT EXISTS "RefreshToken_accountGroup_gin"
  ON "RefreshToken" USING GIN ("accountGroup");
