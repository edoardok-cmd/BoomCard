-- Add accountGroup (sibling-account IDs) to RefreshToken so users with
-- multiple accounts on the same email+password can switch between them
-- without re-authenticating. The group is computed at login time from
-- AuthService.login's bcrypt match set and copied on token rotation
-- (services/auth.service.ts).
--
-- IF NOT EXISTS guard: dev/Neon may have this added via `prisma db push`
-- before the migration file was written; prod runs the real branch.
ALTER TABLE "RefreshToken"
  ADD COLUMN IF NOT EXISTS "accountGroup" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
