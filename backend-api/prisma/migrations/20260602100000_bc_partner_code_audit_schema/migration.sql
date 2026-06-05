-- Migration: 20260602100000_bc_partner_code_audit_schema
-- Task: BC-PARTNER-CODE-AUDIT schema fixes
-- Date: 2026-06-02
--
-- Summary of changes (all additive — no existing values removed):
--   1. Add Partner.statusReason (nullable String) — spec §1.1/§1.3 metadata field
--      for distinguishing Пауза vs Спрян within INACTIVE status.
--   2. Add English canonical values to PartnerRequestStatus enum — spec §2.1/§14.1.
--      Bulgarian transliteration values (NOVA, KOMUNIKACIYA, etc.) are preserved.
--   3. Add 8 partner NotificationType enum values — spec §9.1 / Clash 6.1.
--   4. Add PartnerApplicationStatus enum — spec §2.1 (distinct Application lifecycle).
--   5. Create PartnerApplication table — spec §2 (distinct entity from Partner Account).
--
-- Backfill strategy: All changes are additive. No non-empty column is made NOT NULL
-- without a default; no existing enum values are removed; no existing rows are modified.
-- The PartnerApplication table starts empty — no backfill required.
-- Partner.statusReason is nullable — existing rows safely get NULL.

-- 1. Add statusReason field to Partner table
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "statusReason" TEXT;

-- 2. Add English canonical values to PartnerRequestStatus enum
-- (additive only; existing NOVA/KOMUNIKACIYA/etc. values are preserved)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'NEW'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PartnerRequestStatus')
    ) THEN
        ALTER TYPE "PartnerRequestStatus" ADD VALUE 'NEW';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'COMMUNICATION'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PartnerRequestStatus')
    ) THEN
        ALTER TYPE "PartnerRequestStatus" ADD VALUE 'COMMUNICATION';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'NEGOTIATION'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PartnerRequestStatus')
    ) THEN
        ALTER TYPE "PartnerRequestStatus" ADD VALUE 'NEGOTIATION';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'APPROVED'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PartnerRequestStatus')
    ) THEN
        ALTER TYPE "PartnerRequestStatus" ADD VALUE 'APPROVED';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'REJECTED'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PartnerRequestStatus')
    ) THEN
        ALTER TYPE "PartnerRequestStatus" ADD VALUE 'REJECTED';
    END IF;
END$$;

-- 3. Add 8 partner-specific values to NotificationType enum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_ACTIVATION_LINK'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_ACTIVATION_LINK';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_ONBOARDING_FOLLOWUP'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_ONBOARDING_FOLLOWUP';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_NEW_TRANSACTION'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_NEW_TRANSACTION';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_MONTHLY_SUMMARY'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_MONTHLY_SUMMARY';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_REQUEST_UPDATE'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_REQUEST_UPDATE';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_STATUS_CHANGE'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_STATUS_CHANGE';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_CONTRACT_CHANGE'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_CONTRACT_CHANGE';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PARTNER_MARKETING'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')
    ) THEN
        ALTER TYPE "NotificationType" ADD VALUE 'PARTNER_MARKETING';
    END IF;
END$$;

-- 4. Create PartnerApplicationStatus enum
-- Spec §2.1 / §14.1 — canonical values for the PartnerApplication entity lifecycle.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PartnerApplicationStatus') THEN
        CREATE TYPE "PartnerApplicationStatus" AS ENUM (
            'NEW',
            'COMMUNICATION',
            'NEGOTIATION',
            'ONBOARDING',
            'APPROVED',
            'REJECTED'
        );
    END IF;
END$$;

-- 5. Create PartnerApplication table
-- Spec §2 — pre-sales application entity, distinct from Partner Account.
-- Stages 1–4 of the 9-stage lifecycle. Empty on creation; no backfill needed.
CREATE TABLE IF NOT EXISTS "PartnerApplication" (
    "id"                 TEXT         NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    "firstName"          TEXT         NOT NULL,
    "lastName"           TEXT         NOT NULL,
    "email"              TEXT         NOT NULL,
    "phone"              TEXT         NOT NULL,
    "businessName"       TEXT         NOT NULL,
    "categoryIds"        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "city"               TEXT         NOT NULL,
    "address"            TEXT         NOT NULL,
    "venueCount"         INTEGER      NOT NULL,
    "participationLevel" TEXT         NOT NULL,
    "additionalText"     TEXT,
    "termsConsent"       BOOLEAN      NOT NULL DEFAULT FALSE,
    "privacyConsent"     BOOLEAN      NOT NULL DEFAULT FALSE,
    "marketingConsent"   BOOLEAN      NOT NULL DEFAULT FALSE,
    "status"             "PartnerApplicationStatus" NOT NULL DEFAULT 'NEW',
    "assignedAdminId"    TEXT,
    "internalNotes"      TEXT,
    "history"            JSONB,
    "partnerId"          TEXT,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one application per Partner Account (once linked at Onboarding)
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApplication_partnerId_key"
    ON "PartnerApplication"("partnerId");

-- Indexes for admin "Партньори > Заявки" list queries (spec §2.5)
CREATE INDEX IF NOT EXISTS "PartnerApplication_status_idx"
    ON "PartnerApplication"("status");

CREATE INDEX IF NOT EXISTS "PartnerApplication_assignedAdminId_idx"
    ON "PartnerApplication"("assignedAdminId");

CREATE INDEX IF NOT EXISTS "PartnerApplication_email_idx"
    ON "PartnerApplication"("email");

CREATE INDEX IF NOT EXISTS "PartnerApplication_createdAt_idx"
    ON "PartnerApplication"("createdAt");

-- Foreign keys
ALTER TABLE "PartnerApplication"
    ADD CONSTRAINT "PartnerApplication_assignedAdminId_fkey"
    FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID; -- NOT VALID: table is empty; validated immediately below

ALTER TABLE "PartnerApplication" VALIDATE CONSTRAINT "PartnerApplication_assignedAdminId_fkey";

ALTER TABLE "PartnerApplication"
    ADD CONSTRAINT "PartnerApplication_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID;

ALTER TABLE "PartnerApplication" VALIDATE CONSTRAINT "PartnerApplication_partnerId_fkey";
