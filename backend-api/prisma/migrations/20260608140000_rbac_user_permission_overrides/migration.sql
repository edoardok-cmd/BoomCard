-- Migration: 20260608140000_rbac_user_permission_overrides
-- Task: BC-ADMIN-RBAC-ROLES-019-DB — per-user permission overrides + configurable impersonation.
-- Date: 2026-06-08
--
-- This migration has THREE parts, ordered so the data backfill always succeeds:
--   1. DDL: create the "UserPermissionOverride" table (additive, no existing data touched).
--   2. Seed the "impersonate.partner" Permission row idempotently. Permission rows are normally
--      created by seedPermissions() at app boot, but the backfill below references it by key, so
--      we insert it here to guarantee it exists BEFORE the override backfill runs. seedPermissions()
--      will later upsert (key is UNIQUE) the same row harmlessly. We intentionally do NOT seed
--      "impersonate.user" here — no one is backfilled with it (see decision §5 / §3.1.4).
--   3. Backfill: grant "impersonate.partner" (allow=true) to every currently-eligible ADMIN so the
--      repurposed ADMIN template + the new permission gate does not regress their existing
--      partner-impersonation capability (task 018 gated /impersonate on role ADMIN|SUPER_ADMIN).
--
-- Backfill predicate (documented per §3.1.4):
--   - User.role = 'ADMIN'  (legacy coarse enum on User; these are the back-office admins that
--     could impersonate partners under task 018's authorize('ADMIN','SUPER_ADMIN') gate)
--   - User.status = 'ACTIVE'  (only active admins; suspended/inactive/deleted are not re-granted)
--   - SUPER_ADMIN is deliberately EXCLUDED — it bypasses all permission checks (requirePermission
--     SUPER_ADMIN bypass), so it needs no override row.
--   - impersonate.user is NOT granted to anyone (no default user-impersonation capability).
--
-- Idempotency: the table create uses IF NOT EXISTS; the Permission insert uses ON CONFLICT (key)
-- DO NOTHING; the override backfill uses ON CONFLICT (userId, permissionId) DO NOTHING against the
-- Prisma-generated unique constraint "UserPermissionOverride_userId_permissionId_key". Re-running
-- this migration is a no-op.

-- 1. DDL ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "UserPermissionOverride" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allow"        BOOLEAN NOT NULL,
    "grantedById"  TEXT,
    "grantedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionOverride_userId_permissionId_key"
    ON "UserPermissionOverride" ("userId", "permissionId");

CREATE INDEX IF NOT EXISTS "UserPermissionOverride_userId_idx"
    ON "UserPermissionOverride" ("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserPermissionOverride_userId_fkey'
    ) THEN
        ALTER TABLE "UserPermissionOverride"
            ADD CONSTRAINT "UserPermissionOverride_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserPermissionOverride_permissionId_fkey'
    ) THEN
        ALTER TABLE "UserPermissionOverride"
            ADD CONSTRAINT "UserPermissionOverride_permissionId_fkey"
            FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserPermissionOverride_grantedById_fkey'
    ) THEN
        ALTER TABLE "UserPermissionOverride"
            ADD CONSTRAINT "UserPermissionOverride_grantedById_fkey"
            FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Ensure the impersonate.partner Permission row exists (idempotent) -------
INSERT INTO "Permission" ("id", "key", "label", "category")
VALUES (gen_random_uuid(), 'impersonate.partner', 'Impersonate a partner', 'impersonation')
ON CONFLICT ("key") DO NOTHING;

-- 3. Backfill: grant impersonate.partner to every ACTIVE ADMIN --------------
-- Runs under concurrent writes safely: it is a single set-based INSERT...SELECT keyed on the
-- unique (userId, permissionId) constraint with ON CONFLICT DO NOTHING. grantedById is left NULL
-- (system backfill, no granting admin). The SELECT resolves the Permission id by key.
INSERT INTO "UserPermissionOverride" ("id", "userId", "permissionId", "allow", "grantedById", "grantedAt")
SELECT gen_random_uuid(), u."id", p."id", true, NULL, CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Permission" p
WHERE u."role" = 'ADMIN'
  AND u."status" = 'ACTIVE'
  AND p."key" = 'impersonate.partner'
ON CONFLICT ("userId", "permissionId") DO NOTHING;
