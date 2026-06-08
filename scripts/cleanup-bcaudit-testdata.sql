-- ============================================================================
-- cleanup-bcaudit-testdata.sql
-- ----------------------------------------------------------------------------
-- BoomCard task BC-PARTNER-FU1, item 1 — remove the throwaway accounts,
-- tickets and replies created on the shared Neon `boomcard` DB during the
-- BC-PARTNER-CODE-AUDIT Step-4 runtime audit.
--
-- *** DESTRUCTIVE AND IRREVERSIBLE ***
-- This script permanently DELETEs rows. There is NO undo.
--
-- MANDATORY BEFORE RUNNING:
--   1. Run this on a STAGING COPY of the DB first. Do NOT run against prod
--      until the staging run has been reviewed.
--   2. Run the PREVIEW section (Part 0 below) FIRST, on its own, and eyeball
--      the row counts. If any count is unexpectedly large, STOP — the LIKE
--      predicate or a ticket id may be matching real data.
--   3. The whole thing is wrapped in a single transaction. If anything looks
--      wrong AFTER the DELETEs but BEFORE you COMMIT, run ROLLBACK; (see the
--      commented line near the end) instead of COMMIT;.
--
-- WHY EXPLICIT, ORDERED CHILD DELETES:
--   Verified against backend-api/prisma/schema.prisma. NOT every child FK to
--   User is ON DELETE CASCADE. In particular Subscription -> User is
--   onDelete: Restrict, so a bare `DELETE FROM "User"` would FAIL with a FK
--   violation if any throwaway user ever created a subscription. Several other
--   relations (Booking, Transaction, Review, HelpTicket, Dispute, Message,
--   AuditLog, PartnerRequestNote, etc.) have NO onDelete clause, which in
--   Postgres means NO ACTION (== Restrict at statement end) and would also
--   block the delete. We therefore delete children explicitly, in FK order,
--   children-before-parents. Relations that ARE Cascade are still deleted
--   explicitly here for auditability (harmless / no-op if already gone).
--
--   NOTE: ReceiptAnalytics has a `userId` column but NO @relation / FK in the
--   schema, so it is neither cascaded nor does it block the User delete — but
--   its rows would be ORPHANED. We delete them explicitly by userId.
--
-- Table identifiers are quoted to match the exact Postgres names. Most models
-- use the Prisma default (PascalCase model name). @@map exceptions verified in
-- schema and used below: "subscriptions" (Subscription), "wallets" (Wallet),
-- "wallet_transactions" (WalletTransaction), "payment_methods"
-- (SavedPaymentMethod), "pending_super_admin_requests"
-- (PendingSuperAdminRequest), "critical_action_requests"
-- (CriticalActionRequest). All other tables here are unmapped.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The throwaway-user scope. Reused as a subquery throughout. The predicate is:
--   email LIKE 'bcaudit+%@example.test'
--   OR    email LIKE 'bcaudit-%@example.test'
--   OR    email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
-- ----------------------------------------------------------------------------

-- ============================================================================
-- PART 0 — PREVIEW (RUN THIS FIRST, BY ITSELF, BEFORE THE TRANSACTION BELOW)
-- These are read-only SELECTs. Review every count. Nothing is deleted here.
-- ============================================================================

-- 0a. The throwaway users themselves (the list you are about to delete).
SELECT id, email, role, status, "createdAt"
FROM "User"
WHERE email LIKE 'bcaudit+%@example.test'
   OR email LIKE 'bcaudit-%@example.test'
   OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
ORDER BY "createdAt";

-- 0b. Per-child-table row counts scoped to those users.
SELECT 'User'                    AS tbl, COUNT(*) FROM "User" u
  WHERE u.email LIKE 'bcaudit+%@example.test' OR u.email LIKE 'bcaudit-%@example.test' OR u.email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
UNION ALL SELECT 'Partner',            COUNT(*) FROM "Partner"            WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'Receipt',            COUNT(*) FROM "Receipt"            WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'Card',               COUNT(*) FROM "Card"               WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'HelpTicket(user)',   COUNT(*) FROM "HelpTicket"         WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'ReceiptAnalytics',   COUNT(*) FROM "ReceiptAnalytics"   WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'RefreshToken',       COUNT(*) FROM "RefreshToken"       WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'LoginHistory',       COUNT(*) FROM "LoginHistory"       WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'Subscription',       COUNT(*) FROM "subscriptions"      WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'Transaction',        COUNT(*) FROM "Transaction"        WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'StickerScan',        COUNT(*) FROM "StickerScan"        WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')
UNION ALL SELECT 'WalletTransaction',  COUNT(*) FROM "wallet_transactions" WHERE "walletId" IN (SELECT id FROM "wallets" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg')) OR "stickerScanId" IN (SELECT id FROM "StickerScan" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'bcaudit+%@example.test' OR email LIKE 'bcaudit-%@example.test' OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'));

-- 0c. The named seed-partner audit tickets (Part 2 cleanup) and their replies.
SELECT 'HelpTicket(seed ids)' AS tbl, COUNT(*) FROM "HelpTicket"
  WHERE id IN (
    '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
    'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
    '1daf2100-c7c1-4f63-a824-89a83086aba6')
UNION ALL SELECT 'TicketReply(seed ids)', COUNT(*) FROM "TicketReply"
  WHERE "ticketId" IN (
    '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
    'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
    '1daf2100-c7c1-4f63-a824-89a83086aba6');


-- ============================================================================
-- PART 1 — DELETION TRANSACTION
-- Everything below runs as one atomic unit. Review, then COMMIT (or ROLLBACK).
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 1a. Grandchildren / deep children that hang off the throwaway users via an
--     intermediate table. Delete these first.
-- ----------------------------------------------------------------------------

-- TicketReply -> HelpTicket -> User (TicketReply.ticket is Cascade; explicit
-- anyway). Covers replies on tickets the throwaway users OWN.
DELETE FROM "TicketReply"
WHERE "ticketId" IN (
  SELECT id FROM "HelpTicket"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
);

-- TicketReply rows AUTHORED by a throwaway user on someone else's ticket
-- (TicketReply.author is the default/NoAction "TicketReplies" relation -> would
-- block the User delete; authorId is nullable so we could null it, but these
-- are test rows, so delete them).
DELETE FROM "TicketReply"
WHERE "authorId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- DisputeNote -> Dispute (Cascade) and DisputeNote.author -> User (NoAction).
-- Delete notes authored by throwaway users and notes on their disputes.
DELETE FROM "DisputeNote"
WHERE "authorId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
)
OR "disputeId" IN (
  SELECT id FROM "Dispute"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
);

-- ----------------------------------------------------------------------------
-- 1b. Direct children of the throwaway User. Ordered so that anything that is
--     itself a parent of the rows deleted in 1a comes after them.
-- ----------------------------------------------------------------------------

-- Dispute MUST be deleted BEFORE HelpTicket: Dispute.ticket -> HelpTicket
-- (relation "DisputeTicket") has NO onDelete (= NoAction), so a referencing
-- Dispute would block the HelpTicket delete below. Dispute.user and
-- Dispute.assignee are also NoAction and would block the User delete.
-- DisputeNote children were already removed in 1a. Scope covers disputes
-- owned/assigned by throwaway users AND disputes pointing at a throwaway-scoped
-- HelpTicket (so the HelpTicket delete that follows cannot be blocked).
DELETE FROM "Dispute"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
)
OR "assignedTo" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
)
OR "ticketId" IN (
  SELECT id FROM "HelpTicket"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
  OR "assigneeId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
);

-- HelpTicket.linkedTicketId is a self-FK with NO onDelete (NoAction): if a
-- throwaway-scoped ticket is referenced as another ticket's linkedTicketId, the
-- delete below would block. Null those back-references first (nullable column).
UPDATE "HelpTicket"
SET "linkedTicketId" = NULL
WHERE "linkedTicketId" IN (
  SELECT id FROM "HelpTicket"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
  OR "assigneeId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
);

-- HelpTicket owned by / assigned to throwaway users.
-- HelpTicket.user (NoAction) and HelpTicket.assignee (NoAction) would both
-- block the User delete. (Replies removed in 1a, disputes removed just above.)
DELETE FROM "HelpTicket"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
)
OR "assigneeId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- ----------------------------------------------------------------------------
-- WalletTransaction -> StickerScan -> Transaction chain. ALL three FKs here are
-- onDelete: Restrict (none declare onDelete in schema => NO ACTION). They MUST
-- be torn down child-first BEFORE the Transaction delete (below) and BEFORE the
-- User delete, in this exact order:
--   (i)   WalletTransaction  (holds FKs to StickerScan + Transaction, both
--                             Restrict) -> delete first.
--   (ii)  StickerScan        (holds FK to Transaction (Restrict) and User
--                             (Restrict)) -> delete after WalletTransaction,
--                             before Transaction and before User.
--   (iii) Transaction        (deleted by the existing statement just below).
--
-- NOTE: this WalletTransaction delete supersedes the old Part-1b "wallets'
-- wallet_transactions" delete that used to sit just before the User delete.
-- It MUST run here (before Transaction) because WalletTransaction.transactionId
-- -> Transaction is Restrict: leaving it until after the Transaction delete
-- would let a throwaway WalletTransaction block the Transaction delete. We widen
-- the scope to cover BOTH wallet ownership AND any wallet_transaction that
-- references a throwaway StickerScan or throwaway Transaction, so nothing is
-- left dangling on either FK side.
DELETE FROM "wallet_transactions"
WHERE "walletId" IN (
  SELECT id FROM "wallets"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
)
OR "stickerScanId" IN (
  SELECT id FROM "StickerScan"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
)
OR "transactionId" IN (
  SELECT id FROM "Transaction"
  WHERE "userId" IN (
    SELECT id FROM "User"
    WHERE email LIKE 'bcaudit+%@example.test'
       OR email LIKE 'bcaudit-%@example.test'
       OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
  )
);

-- StickerScan.user (Restrict) would block the User delete; StickerScan
-- .transaction (Restrict) would block the Transaction delete below. Its
-- WalletTransaction back-refs were just removed above, so this is now safe.
-- Scoped to throwaway users via userId. (StickerScan.card/sticker/venue are
-- Restrict the OTHER direction -- StickerScan is the child there -- so they do
-- not block; we leave those parent rows untouched.)
DELETE FROM "StickerScan"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- Transaction (Transaction.user is default/NoAction -> blocks User delete).
-- Safe now: its StickerScan (Restrict) and WalletTransaction (Restrict)
-- back-refs were removed in the two statements above.
DELETE FROM "Transaction"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- Subscription -> User is onDelete: Restrict. This is the one the handover
-- explicitly worried about — must be deleted before the User row.
DELETE FROM "subscriptions"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- Booking (Booking.user is default/NoAction -> blocks User delete).
DELETE FROM "Booking"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- Review (Review.user is default/NoAction -> blocks User delete).
DELETE FROM "Review"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- Message (Message.user is default/NoAction -> blocks User delete).
DELETE FROM "Message"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- PartnerRequestNote (author FK is default/NoAction -> blocks User delete).
DELETE FROM "PartnerRequestNote"
WHERE "authorId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- PendingSuperAdminRequest (requestedBy is default/NoAction -> blocks delete).
DELETE FROM "pending_super_admin_requests"
WHERE "requestedById" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- CriticalActionRequest (requestedBy default/NoAction; resolvedBy is nullable
-- NoAction). Delete rows requested by throwaway users; null the resolver where
-- a throwaway user happened to resolve a real request (keep that real row).
DELETE FROM "critical_action_requests"
WHERE "requestedById" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);
UPDATE "critical_action_requests"
SET "resolvedById" = NULL
WHERE "resolvedById" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- AuditLog.actor is nullable + default/NoAction. Null the actor on real audit
-- rows rather than deleting history. (Required: NoAction would block delete.)
UPDATE "AuditLog"
SET "actorUserId" = NULL
WHERE "actorUserId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- UserAdminRole.grantedBy is nullable + default/NoAction (the user's OWN
-- adminRoles row is Cascade, handled by the User delete; the grantedBy back-ref
-- is not). Null grantedBy where a throwaway user granted a real role.
UPDATE "UserAdminRole"
SET "grantedById" = NULL
WHERE "grantedById" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- ReceiptAnalytics has a userId column but NO FK to User. Not cascaded and not
-- blocking, but would orphan. Delete explicitly.
DELETE FROM "ReceiptAnalytics"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email LIKE 'bcaudit+%@example.test'
     OR email LIKE 'bcaudit-%@example.test'
     OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg'
);

-- ----------------------------------------------------------------------------
-- The following User children are ON DELETE CASCADE and will be removed
-- automatically by the User delete below. Deleting them explicitly first is
-- harmless and improves auditability:
--   Card, Favorite, LoginHistory, Notification, OfferRedemption, PushToken,
--   Receipt (-> cascades Receipt's Dispute/WalletTransaction children),
--   ReceiptUploadToken, RefreshToken, SavedPaymentMethod (payment_methods),
--   Wallet (wallets -> wallet_transactions is Restrict; see note*),
--   ConversationParticipant, MarketingListMember, Partner (-> cascades Offer,
--   Venue, Review, Transaction(partner), PartnerStatusChange, ActivationLink,
--   PartnerRequestNote, PartnerCashbackPayment, MarketingListMember, Booking,
--   HelpTicket.partnerId SetNull).
--
--   * Wallet -> WalletTransaction is onDelete: Restrict. If a throwaway user's
--     wallet has wallet_transactions, the Wallet cascade-from-User would FAIL.
--     This is already pre-empted: the wallet_transactions delete now runs EARLIER
--     (in Part 1b, just before the StickerScan/Transaction deletes) because
--     WalletTransaction.transactionId -> Transaction is also Restrict and had to
--     be cleared before the Transaction delete. So by the time the User delete
--     fires here, the throwaway wallets have no wallet_transactions left.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1c. The throwaway User rows themselves. Remaining Cascade children
--     (listed above) are removed automatically by this statement.
-- ----------------------------------------------------------------------------
DELETE FROM "User"
WHERE email LIKE 'bcaudit+%@example.test'
   OR email LIKE 'bcaudit-%@example.test'
   OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg';

-- ============================================================================
-- PART 2 — Audit tickets created on REAL seed partners (winedine@/grandhotel@).
-- These are NOT owned by bcaudit users, so Part 1 does not touch them. Delete
-- replies first (TicketReply.ticket is Cascade, but explicit for auditability),
-- then the tickets. Ids are from the handover doc — verify with PREVIEW 0c.
-- ============================================================================
DELETE FROM "TicketReply" WHERE "ticketId" IN (
  '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
  'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
  '1daf2100-c7c1-4f63-a824-89a83086aba6'
);
-- Remove any Dispute pointing at these tickets (Dispute.ticket is NoAction and
-- would block the HelpTicket delete). "Account closure request" tickets are the
-- likely source of a closure dispute.
DELETE FROM "DisputeNote" WHERE "disputeId" IN (
  SELECT id FROM "Dispute" WHERE "ticketId" IN (
    '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
    'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
    '1daf2100-c7c1-4f63-a824-89a83086aba6')
);
DELETE FROM "Dispute" WHERE "ticketId" IN (
  '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
  'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
  '1daf2100-c7c1-4f63-a824-89a83086aba6'
);
-- Null any HelpTicket.linkedTicketId pointing at these tickets (self-FK,
-- NoAction).
UPDATE "HelpTicket" SET "linkedTicketId" = NULL WHERE "linkedTicketId" IN (
  '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
  'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
  '1daf2100-c7c1-4f63-a824-89a83086aba6'
);
DELETE FROM "HelpTicket" WHERE id IN (
  '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
  'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
  '1daf2100-c7c1-4f63-a824-89a83086aba6'
);

-- ============================================================================
-- COMMIT or ROLLBACK
-- If the PREVIEW counts matched and nothing errored, commit:
COMMIT;
-- To abort instead (e.g. counts looked wrong), comment out the COMMIT above
-- and run this single statement instead:
-- ROLLBACK;
-- ============================================================================


-- ============================================================================
-- TRAILING NOTES — MANUAL / APP-LEVEL ACTIONS (NOT executed by this script)
-- ----------------------------------------------------------------------------
-- CREDENTIAL ROTATION (handover §1):
--   A few REUSED seed/test partner accounts had their passwordHash reset to
--   throwaway values during auth-flow testing. They are NOT bcaudit throwaways
--   and are NOT deleted here. If they are kept, rotate/reset their credentials
--   through the application (admin password-reset flow), NOT by editing the DB:
--     - bcaudit+plsac-task-...   (also may carry a harmless pendingChanges='{}'
--                                  blob on its Partner row — clear via the app
--                                  / admin tooling if desired)
--     - bcaudit+partner-r9a@...
--     - bcaudit+r5activate@...
--   (Credential rotation is an application action — issuing a fresh hash via the
--   normal reset flow — so it is intentionally left out of this SQL.)
--
-- ----------------------------------------------------------------------------
-- FK-CASCADE VERIFICATION SUMMARY (verified against schema.prisma)
-- Each User-child relation and how this script handles it:
--
--   CASCADE (auto-removed by User delete; also listed explicitly where noted):
--     Card, Favorite, LoginHistory, Notification, OfferRedemption, PushToken,
--     Receipt, ReceiptUploadToken, RefreshToken, SavedPaymentMethod,
--     Wallet, ConversationParticipant, MarketingListMember,
--     Partner (+ all Partner children cascade), UserAdminRole (own row).
--
--   RESTRICT (MUST delete child first — would block User delete):
--     Subscription            -> explicit DELETE (Part 1b)
--     StickerScan (user)       -> Restrict (no onDelete in schema, l.1368).
--                                  Would block the User delete. explicit DELETE
--                                  scoped by userId, in Part 1b, AFTER its
--                                  WalletTransaction back-refs and BEFORE both
--                                  the Transaction and User deletes.
--     StickerScan (transaction)-> Restrict (no onDelete, l.1367). StickerScan
--                                  holds this FK, so it would block the
--                                  Transaction delete; handled by deleting
--                                  StickerScan before Transaction (Part 1b).
--     WalletTransaction (wallet)-> Restrict on Wallet, not User. explicit DELETE
--                                  of throwaway wallets' tx in Part 1b, before
--                                  the Wallet cascade-from-User fires.
--     WalletTransaction (stickerScanId) -> Restrict (no onDelete, l.675).
--                                  WalletTransaction holds this FK -> would block
--                                  the StickerScan delete. Handled: the Part-1b
--                                  WalletTransaction delete is widened to also
--                                  match stickerScanId IN (throwaway scans), so
--                                  no wallet_transaction references a scan we are
--                                  about to delete.
--     WalletTransaction (transactionId) -> Restrict (no onDelete, l.676).
--                                  WalletTransaction holds this FK -> would block
--                                  the Transaction delete. Handled: same Part-1b
--                                  WalletTransaction delete also matches
--                                  transactionId IN (throwaway transactions).
--                                  This is WHY the wallet_transactions delete had
--                                  to move EARLIER (before Transaction), not stay
--                                  just before the User/Wallet-cascade.
--
--   NO onDelete = NO ACTION / Restrict (MUST delete or null child first):
--     Transaction (user)       -> explicit DELETE
--     Booking (user)           -> explicit DELETE
--     Review (user)            -> explicit DELETE
--     Message (user)           -> explicit DELETE
--     HelpTicket (user+assignee) -> explicit DELETE
--     Dispute (user+assignee)  -> explicit DELETE
--     DisputeNote (author)     -> explicit DELETE
--     TicketReply (author)     -> explicit DELETE
--     PartnerRequestNote (author) -> explicit DELETE
--     PendingSuperAdminRequest (requestedBy) -> explicit DELETE
--     CriticalActionRequest (requestedBy) -> explicit DELETE;
--                              (resolvedBy) -> UPDATE SET NULL
--     AuditLog (actor, nullable) -> UPDATE SET NULL (preserve history)
--     UserAdminRole (grantedBy, nullable) -> UPDATE SET NULL
--
--   SETNULL (handled by cascade/automatically; no explicit action needed):
--     PartnerStatusChange.changedBy, ActivationLink.createdBy,
--     LinkResendLog.actor, HelpTicket.partnerId — all SetNull, so the User /
--     Partner delete nulls them automatically.
--
--   NO FK at all (orphan risk, not blocking):
--     ReceiptAnalytics (userId column, no @relation) -> explicit DELETE.
-- ============================================================================
