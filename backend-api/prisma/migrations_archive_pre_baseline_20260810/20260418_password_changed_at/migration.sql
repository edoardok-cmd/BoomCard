-- Track the last password rotation per user. Used by /auth/switch-account to
-- close the sibling-pivot window left open by the fact that access tokens are
-- not individually revocable: when sibling B rotates its password, sibling A's
-- already-minted access token (with ag=[A,B]) stays valid for up to ~15 min.
-- We compare target.passwordChangedAt against the caller token's iat and
-- refuse the switch if the password moved after the token was issued.
--
-- IF NOT EXISTS guard: dev/Neon may have this added via `prisma db push`
-- before the migration file was written; prod runs the real branch.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
