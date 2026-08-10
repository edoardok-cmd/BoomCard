-- Migration: 20260626120000_ticket_cc
-- Task: BC-REAUDIT-TICKET-CC-1 — CC'd-admin inbound spoof-allowlist (TicketCC storage).
-- Date: 2026-06-26
--
-- Spec §11.2 lists "cc-нати админи" (CC'd admins) as an allowed inbound-sender group
-- in the spoof-protection check. The HelpTicket model previously had no CC field, so an
-- inbound reply from a legitimately CC'd admin was treated as a spoofer and shunted to a
-- linked ticket. This migration adds the "TicketCC" join table that stores per-ticket CC
-- addresses (lowercased) so the inbound spoof check can thread those replies into the
-- original ticket.
--
-- This migration is additive only (no existing data touched).
--   - DDL: create the "TicketCC" table.
--   - Unique (ticketId, email) so duplicate CC entries cannot accumulate; the population
--     helper relies on this for idempotent upsert / skipDuplicates.
--   - FK to HelpTicket with ON DELETE CASCADE so CC rows are removed with their ticket.
--
-- Idempotency: table create uses IF NOT EXISTS; indexes use IF NOT EXISTS; the FK is added
-- inside a guarded DO block. Re-running this migration is a no-op.

CREATE TABLE IF NOT EXISTS "TicketCC" (
    "id"        TEXT NOT NULL,
    "ticketId"  TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketCC_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TicketCC_ticketId_email_key"
    ON "TicketCC" ("ticketId", "email");

CREATE INDEX IF NOT EXISTS "TicketCC_ticketId_idx"
    ON "TicketCC" ("ticketId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TicketCC_ticketId_fkey'
    ) THEN
        ALTER TABLE "TicketCC"
            ADD CONSTRAINT "TicketCC_ticketId_fkey"
            FOREIGN KEY ("ticketId") REFERENCES "HelpTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
