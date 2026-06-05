-- Migration: 20260602400000_bc_partner_schema_audit_fixes
-- Task: BC-PARTNER-CODE-AUDIT — schema HIGH/MEDIUM/LOW fixes (r2o + r2p findings)
-- Date: 2026-06-02
--
-- Covers changes that are DB-structural (not doc-comment/annotation-only):
--
--   1. VenueStatus enum — add INACTIVE value (FINDING-8 / r2o, F10 / r2p)
--      Spec §1.5, §4.2, §12.1 rule 1: partner deactivation cascade needs a
--      non-SUSPENDED target for venue status. INACTIVE is the new cascade target;
--      SUSPENDED remains for admin-penalty use only.
--      Backfill: none required — existing venue rows keep their current status.
--      New code must use INACTIVE (not SUSPENDED) when cascading from partner
--      status changes.
--
--   2. ActivationLink.createdById — make nullable, add FK to User (FINDING-10 / r2o)
--      Spec §9.3 audit trail: the admin who issued the link must be traceable.
--      The column is changed from NOT NULL to nullable so that:
--        (a) the FK can use ON DELETE SET NULL (preserving audit rows if admin deleted)
--        (b) historical rows that pre-date the FK can be accommodated
--      Backfill: no value change — existing non-null values are preserved.
--      The NOT VALID / VALIDATE pattern is used so the constraint is added without
--      a full table scan lock on a potentially non-empty table.
--
-- Changes NOT in this migration (already applied or documentation-only):
--   - Partner.statusReason: added in migration 20260602100000 (line 20)
--   - PartnerRequestStatus English @map values: existing enum values preserved;
--     @map directives are Prisma-layer only — no DB DDL needed
--   - NotificationType partner values: added in migration 20260602100000
--   - PartnerStatus 7-value enum: no DB change — scope is application-layer enforcement
--   - /// @ignore annotations: Prisma doc-comment convention — no DB DDL
--   - TicketStatus mapping comment: documentation-only — no DB DDL

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add INACTIVE to VenueStatus enum
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'INACTIVE'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'VenueStatus')
    ) THEN
        ALTER TYPE "VenueStatus" ADD VALUE 'INACTIVE';
    END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ActivationLink.createdById — make nullable + add FK to User
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: drop NOT NULL constraint if it exists (safe on empty or populated table
-- because the column already has values; we are only widening the constraint).
ALTER TABLE "ActivationLink" ALTER COLUMN "createdById" DROP NOT NULL;

-- Step 2: add the FK with NOT VALID so it does not acquire a long lock scanning
-- existing rows. The table is typically small but we follow the safe pattern.
ALTER TABLE "ActivationLink"
    ADD CONSTRAINT "ActivationLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;

-- Step 3: validate the constraint (takes ShareLock, not ExclusiveLock — safe concurrently).
ALTER TABLE "ActivationLink" VALIDATE CONSTRAINT "ActivationLink_createdById_fkey";
