-- Migration: 20260606120000_backfill_partner_requeststatus_sla
-- Task:      BC-PARTNER-SLA-BACKFILL
-- Date:      2026-06-06
--
-- INTENT
--   Legacy Partner rows with requestStatus IS NULL are invisible to the §2.4 24h
--   SLA escalation scheduler (src/jobs/scheduler.ts ~line 1231), whose hourly query
--   filters `requestStatus: { notIn: [APPROVED, REJECTED], not: null }`. A NULL
--   requestStatus is excluded by `not: null`, so genuinely-pending legacy
--   applications never enter SLA monitoring. This migration backfills the correct
--   legacy applications to the NEW state so they are picked up by the scheduler.
--   The scheduler — not this migration — applies the 24h age cutoff, so there is
--   deliberately NO createdAt / age filter here.
--
-- EXACT PREDICATE (decided by the user — do NOT widen or narrow)
--     SET    "requestStatus" = 'NOVA'        -- DB @map value of PartnerRequestStatus.NEW
--     WHERE  "requestStatus" IS NULL
--       AND  "status"        = 'PENDING'     -- PartnerStatus.PENDING (no @map → literal 'PENDING')
--   Every other row is left untouched: any non-null requestStatus, and any
--   operational status other than PENDING (ACTIVE, INACTIVE, SUSPENDED, PAUSED,
--   ARCHIVED, REJECTED).
--
-- SCHEMA IDENTIFIERS (verified against prisma/schema.prisma AND the live DB)
--   - Model `Partner`     has NO @@map           → table  "Partner"        (schema.prisma:174)
--   - `requestStatus`     has NO @map            → column "requestStatus"  (schema.prisma:209)
--                         type PartnerRequestStatus? (nullable)            (information_schema: udt PartnerRequestStatus, is_nullable=YES)
--   - `status`            has NO @map            → column "status"         (schema.prisma:184)
--                         type PartnerStatus @default(PENDING) (NOT NULL)
--   - PartnerRequestStatus.NEW @map("NOVA")      → DB enum label 'NOVA'    (schema.prisma:1955)
--   - PartnerStatus.PENDING (no @map)            → DB value 'PENDING'      (schema.prisma:2011)
--
--   NOTE on the enum value: the live "PartnerRequestStatus" type currently carries
--   BOTH the canonical Bulgarian labels (NOVA, KOMUNIKACIYA, ...) AND a parallel set
--   of English labels (NEW, COMMUNICATION, ...) that were appended by migration
--   20260602100000. The schema.prisma @map directives are authoritative: Prisma
--   reads/writes the `NEW` enum member as the DB label 'NOVA'. Writing 'NEW' here
--   would create rows the Prisma Client cannot map back to its NEW member. We
--   therefore use 'NOVA', matching how the application and the scheduler read the row.
--
-- DATA SAFETY
--   - DML only: a single UPDATE. No DDL, no schema change, no full-table rewrite.
--   - Locking: row-level locks on ONLY the matched (requestStatus IS NULL AND
--     status = 'PENDING') rows for the duration of the statement. No table lock.
--     Matched set is tiny (5 rows at authoring time, of 24 total), so the lock
--     window is sub-millisecond. Safe under concurrent writes — concurrent inserts
--     of new applications are unaffected, and any concurrent UPDATE of a matched row
--     simply serializes on its row lock.
--   - IDEMPOTENT by construction: the WHERE clause excludes rows whose
--     requestStatus is already non-null, so re-running this migration matches zero
--     rows and is a no-op.
--
-- ROLLBACK (reversible, with caveat)
--   The logical inverse is:
--       UPDATE "Partner"
--          SET "requestStatus" = NULL
--        WHERE "requestStatus" = 'NOVA'
--          AND "status"        = 'PENDING';
--   CAVEAT: this inverse is only faithful if NO genuinely-new partner applications
--   have been created (or transitioned) into requestStatus = 'NOVA' / status =
--   'PENDING' since this migration ran. Once the application starts writing real
--   NOVA applications, the inverse can no longer distinguish backfilled rows from
--   legitimate new ones and would incorrectly null them out. If a precise rollback
--   is required after that point, restrict it to the specific partner ids captured
--   at backfill time. In practice rollback should rarely be needed: leaving these
--   rows as NEW only makes them visible to SLA monitoring, which is the intended
--   correct behavior.

BEGIN;

UPDATE "Partner"
   SET "requestStatus" = 'NOVA'::"PartnerRequestStatus"
 WHERE "requestStatus" IS NULL
   AND "status" = 'PENDING'::"PartnerStatus";

COMMIT;
