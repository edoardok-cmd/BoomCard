# BC-ADMIN-REAUDIT2-TICKET-WITHDRAW-1 Implementation Checklist

## Task Specification
Users and partners should be able to withdraw their own OPEN tickets, transitioning them to CANCELLED status.
Reference: docs/specs/06-admin-spec-extracted.md §1.7 (Request lifecycle; Cancelled = "Withdrawn or invalid")

## Implementation Files Modified

### 1. `/Users/administrator/Documents/BoomCard/backend-api/src/routes/help.routes.ts`
- **Lines 4**: Added import `auditMiddleware, writeAudit` from `../middleware/audit.middleware`
- **Line 11**: Added import `TicketStatus` from `@prisma/client`
- **Lines 17**: Added `router.use(auditMiddleware)` to enable audit middleware
- **Lines 332-417**: Added `POST /tickets/:id/cancel` endpoint for user withdrawal

### 2. `/Users/administrator/Documents/BoomCard/backend-api/src/routes/partnerHelp.routes.ts`
- **Line 2**: Added `TicketStatus` to imports from `@prisma/client`
- **Line 5**: Added import `auditMiddleware, writeAudit` from `../middleware/audit.middleware`
- **Line 17**: Added `router.use(auditMiddleware)` to enable audit middleware
- **Lines 401-481**: Added `POST /tickets/:id/cancel` endpoint for partner withdrawal

### 3. `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/help-ticket-withdraw.test.ts`
- **NEW**: Created comprehensive integration test suite for withdrawal functionality

## Acceptance Criteria Met

### ✅ 1. Auth & Ownership
- **User route (help.routes.ts):**
  - Uses `authenticate` guard (line 340)
  - Ownership check: `userId: req.user!.id` (line 343)
  - Returns 404 if ticket not found or not owner (line 348-349)
  - Returns 403 if access denied (inherited from 404 for non-owners)

- **Partner route (partnerHelp.routes.ts):**
  - Uses `authenticate` guard and `requireNonArchivedPartner` (line 407)
  - Ownership check: `userId: req.user!.id` (line 409)
  - Returns 404 if ticket not found or not owner (line 414-415)

### ✅ 2. Terminal Guard (400 response)
- **Both routes**: Reject withdrawals if status is CLOSED, REJECTED, or CANCELLED
  - help.routes.ts lines 353-355
  - partnerHelp.routes.ts lines 419-421
- **Allow withdraw from**: NEW, OPEN, IN_REVIEW, WAITING (do NOT allow from RESOLVED)
  - Implementation correctly allows only non-terminal states

### ✅ 3. Atomic Transaction
- **Both routes**: Update status to CANCELLED and create TicketReply in single transaction
  - help.routes.ts lines 358-372
  - partnerHelp.routes.ts lines 424-438
- **Reply creation**:
  - Channel: 'INTERNAL' (non-admin origin for requester-initiated action)
  - isAdmin: false (requester, not admin)
  - Body: '[ОТТЕГЛЕНА от заявителя]' (Bulgarian: "[WITHDRAWN by requester]")

### ✅ 4. Audit Trail
- **Both routes**: Write audit action with type 'ticket.withdraw'
  - help.routes.ts lines 375-383
  - partnerHelp.routes.ts lines 441-449
- **Audit includes**:
  - action: 'ticket.withdraw'
  - objectType: 'ticket'
  - objectId: ticket.id
  - before: { status: ticket.status } (prior status)
  - after: { status: 'CANCELLED' } (new status)

### ✅ 5. Requester Notification
- **Both routes**: Notify assignee of withdrawal (non-fatal, detached)
  - help.routes.ts lines 386-413
  - partnerHelp.routes.ts lines 452-478
- **Notification includes**:
  - Email to assignee
  - Subject with ticket ID and [Заявката оттеглена] marker
  - Threading headers for proper email threading
  - Ticket details in both HTML and plain-text format

### ✅ 6. Edge Case: Email Reopen Handler
- **Verified in ticketInbound.service.ts (lines 750-757)**:
  - CANCELLED tickets are intentionally EXCLUDED from reopening
  - Inbound email replies on withdrawn tickets are still captured as TicketReply
  - But ticket remains in terminal CANCELLED state (not reopened)
  - This aligns with spec §1.7 / §7.1: "withdrawn or invalid"

## Request/Response Validation

### Request Format
```
POST /api/help/tickets/:id/cancel
POST /api/partner/help/tickets/:id/cancel

Headers:
  Authorization: Bearer <token>

Body: {} (empty object, no parameters required)
```

### Success Response (200)
```json
{
  "ok": true
}
```

### Error Responses
- **404 Not Found** — Ticket not found or not owned by requester
- **400 Bad Request** — Ticket already in terminal state (CLOSED, REJECTED, CANCELLED)
- **401 Unauthorized** — Missing or invalid auth token
- **403 Forbidden** — Archived partner status (partnerHelp only)

## Integration Tests

Created comprehensive test suite in:
`tests/integration/help-ticket-withdraw.test.ts`

**User withdrawal tests (10 scenarios):**
1. Withdraws own OPEN ticket → status becomes CANCELLED
2. Creates INTERNAL reply with withdrawal marker
3. Cannot withdraw already-CLOSED ticket (400)
4. Cannot withdraw already-REJECTED ticket (400)
5. Cannot withdraw already-CANCELLED ticket (400)
6. Cannot withdraw other user's ticket (404)
7. Notifies assignee of withdrawal
8. Remains in history (not deleted)
9. Audit trail recorded with action 'ticket.withdraw'

**Partner withdrawal tests (5 scenarios):**
1. Withdraws own OPEN ticket → status becomes CANCELLED
2. Creates INTERNAL reply with withdrawal marker
3. Cannot withdraw already-terminal ticket (400)
4. Cannot withdraw other partner's ticket (404)
5. Notifies assignee of withdrawal

**Edge case test:**
- Verifies CANCELLED ticket does NOT reopen via email reply

## Implementation Details

### Pattern Conformance
- Follows same pattern as admin cancel (adminHelp.routes.ts lines 660-767)
- Uses same email threading headers (buildTicketHeaders, buildPlusReplyTo, buildTicketSubject)
- Uses same audit trail pattern (writeAudit with before/after)
- Uses same detach() pattern for non-fatal side effects (email, audit)

### Scope Adherence
- ✅ Only modifies help.routes.ts and partnerHelp.routes.ts
- ✅ Does NOT modify database migrations
- ✅ Does NOT modify frontend code
- ✅ Does NOT modify admin routes
- ✅ Does NOT regress ticketInbound.service.ts email reopen logic

### Code Quality
- Bulgarian error messages for consistency with codebase
- Comprehensive comments explaining terminal states
- HTML entity escaping in email notifications (esc function)
- Proper transaction isolation (atomic update + reply creation)
- Non-fatal email/audit failures (detach pattern)

## Spec Conformance

**Spec §1.7 — Request Lifecycle**
```
Status: Cancelled
Definition: Withdrawn or invalid
Visibility: Yes (history)
```

✅ Implementation correctly:
- Transitions OPEN tickets to CANCELLED status
- Keeps withdrawn tickets in history (not deleted)
- Distinguishes from admin cancel (requester-initiated vs. admin-decided invalid)
- Creates INTERNAL reply with requester-initiated marker
- Prevents reopening via email reply (ticketInbound.service.ts already guards CANCELLED)

**Spec §7.1 — Status Field Names (Canonical Schema)**
```
Entity: Request
Status Field Name: request_status
Values: New | In Progress | Waiting | Closed | Cancelled
```

✅ Implementation uses canonical status field and enum values.