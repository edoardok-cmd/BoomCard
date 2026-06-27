/**
 * Ticket-aware email helpers (Spec §11.2 v1.1).
 *
 * All outbound email tied to a HelpTicket must carry the threading markers the
 * inbound parser uses to reconstruct conversations:
 *   - Subject prefix `[#1234]` (visible signal + parser fallback)
 *   - X-BoomCard-Ticket-ID header (primary parser signal)
 *   - Message-ID header (so inbound replies' In-Reply-To resolves to a row)
 *   - In-Reply-To / References when responding to a prior message
 *
 * Generated Message-IDs are persisted to TicketReply.messageId so the inbound
 * parser can look them up in O(1) when an external client uses standard reply
 * threading instead of subject parsing.
 */

import crypto from 'crypto';
import { TicketStatus } from '@prisma/client';
import { SUBJECT_REF_RE } from './ticketInbound.service';

const DEFAULT_DOMAIN = 'mail.boomcard.bg';

// Inbound mailboxes for plus-addressing — must match the mail routing rules.
// Spec §12.1 follows 05-consolidated-unified-spec.md as the authoritative source,
// so office@boomcard.bg is the canonical inbound support address.
// Replies to subscriber tickets arrive at office+<shortRef>@boomcard.bg;
// replies to partner tickets arrive at office+<shortRef>@boomcard.bg.
const SUBSCRIBER_INBOUND = process.env.SUBSCRIBER_INBOUND_EMAIL ?? 'office@boomcard.bg';
const PARTNER_INBOUND = process.env.PARTNER_INBOUND_EMAIL ?? 'office@boomcard.bg';

/**
 * H3 (Spec Part 6 / Clash 7.1) — plus-addressing (`support+<ref>@`) is DEFERRED
 * to v1.3. v1.2 threading relies ONLY on the X-BoomCard-Request-ID header
 * (primary) and the `[#XXXX]` subject fallback. This flag gates BOTH the outbound
 * plus-addressed Reply-To AND the inbound plus-address resolver (see
 * ticketInbound.service.ts resolveTicket Priority 3). Default OFF — the only
 * spec-conformant v1.2 behavior. Set TICKET_PLUS_ADDRESSING_ENABLED=true to
 * re-enable the v1.3 preview behavior for testing.
 */
export function isPlusAddressingEnabled(): boolean {
  return process.env.TICKET_PLUS_ADDRESSING_ENABLED === 'true';
}

/**
 * M6 (Spec §1.7 / §7.1) — canonical `request_status` mapping.
 *
 * The spec defines exactly five request statuses: New | In Progress | Waiting |
 * Closed | Cancelled. The DB `TicketStatus` enum is a documented super-set
 * (NEW/OPEN/IN_REVIEW/WAITING/RESOLVED/CLOSED/REJECTED/CANCELLED). This maps the
 * raw enum to the canonical set so the admin API surface never leaks the
 * non-canonical operational states (IN_REVIEW/RESOLVED/REJECTED). The mapping is
 * applied additively as a `requestStatus` field; the raw `status` is preserved for
 * any caller that still keys on the stable enum token.
 *
 * BC-ADMIN-SPEC-REAUDIT3-HELP-NEWSTATUS-CLAIM-2 (Finding 1): Freshly-created,
 * unassigned OPEN tickets now map to canonical "New" status (OPEN + assigneeId=null).
 * This makes the canonical New bucket meaningful instead of dead.
 *
 *   NEW       → New              (legacy NEW status)
 *   OPEN      → New              (if assigneeId is null; unassigned + untouched)
 *   OPEN      → In Progress      (if assigneeId is not null; assigned)
 *   IN_REVIEW → In Progress      (assigned + actively worked)
 *   WAITING   → Waiting
 *   RESOLVED  → Closed           (admin-internal pre-close)
 *   CLOSED    → Closed
 *   REJECTED  → Cancelled        (Spec §1.7: Cancelled = "Withdrawn or invalid" — a rejected
 *                                 ticket is admin-declined/invalid, not resolved. Closed is
 *                                 reserved for successfully resolved tickets.)
 *   CANCELLED → Cancelled
 */
export type CanonicalRequestStatus = 'New' | 'In Progress' | 'Waiting' | 'Closed' | 'Cancelled';

export function toCanonicalRequestStatus(status: string | null | undefined, assigneeId?: string | null): CanonicalRequestStatus {
  switch (status) {
    case 'NEW':
      return 'New';
    case 'OPEN':
      // BC-ADMIN-SPEC-REAUDIT3-HELP-NEWSTATUS-CLAIM-2: unassigned OPEN → New
      return assigneeId === null ? 'New' : 'In Progress';
    case 'IN_REVIEW':
      return 'In Progress';
    case 'WAITING':
      return 'Waiting';
    case 'RESOLVED':
    case 'CLOSED':
      return 'Closed';
    case 'REJECTED':
      // Spec §1.7 — REJECTED = "Withdrawn or invalid" maps to Cancelled (not Closed).
      // Closed = "Resolved" (§1.7); Cancelled = "Withdrawn or invalid" (§1.7).
      return 'Cancelled';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      // Unknown/legacy value — surface as In Progress (operationally open) rather
      // than inventing a sixth canonical value.
      return 'In Progress';
  }
}

/** Attach the canonical `requestStatus` to a ticket-shaped object without mutating the raw `status`. */
export function withCanonicalRequestStatus<T extends { status: string; assigneeId?: string | null }>(
  ticket: T,
): T & { requestStatus: CanonicalRequestStatus } {
  return { ...ticket, requestStatus: toCanonicalRequestStatus(ticket.status, ticket.assigneeId) };
}

/**
 * M8 (Spec §1.7 / §7.1) — canonical-status → raw-enum expansion for filtering.
 *
 * The filter must agree with the canonical projection (toCanonicalRequestStatus)
 * so that filtering by a canonical bucket returns ALL rows that display under
 * that bucket. Mirrors the M7 fix applied to requestType.
 *
 * Accepts both canonical names ("Cancelled") and raw enum tokens ("CANCELLED")
 * for back-compat. Raw tokens that don't map to a canonical bucket are returned
 * as a single-element array (passthrough).
 *
 * Returns a where clause shaped for Prisma filtering. Most return { in: TicketStatus[] },
 * but some require complex OR conditions (e.g., New = NEW enum OR unassigned OPEN).
 *
 * BC-ADMIN-SPEC-REAUDIT3-HELP-NEWSTATUS-CLAIM-2: Filtering by "New" now includes
 * both legacy NEW enum rows AND freshly-created unassigned OPEN tickets. Callers
 * must apply the returned filter as-is to their WHERE clause.
 */
export function toRawStatusFilter(status: string): any {
  switch (status) {
    case 'Cancelled':
    case 'CANCELLED':
      return { status: { in: ['CANCELLED', 'REJECTED'] as TicketStatus[] } };
    case 'Closed':
    case 'CLOSED':
      return { status: { in: ['CLOSED', 'RESOLVED'] as TicketStatus[] } };
    case 'In Progress':
    case 'IN_PROGRESS':
    case 'OPEN':
      // BC-ADMIN-SPEC-REAUDIT3-HELP-NEWSTATUS-CLAIM-2: In Progress = OPEN+assigned OR IN_REVIEW
      // (excludes unassigned OPEN, which maps to "New")
      return {
        OR: [
          { AND: [{ status: 'OPEN' }, { assigneeId: { not: null } }] },
          { status: 'IN_REVIEW' }
        ]
      };
    case 'IN_REVIEW':
      return { status: { in: ['IN_REVIEW'] as TicketStatus[] } };
    case 'New':
    case 'NEW':
      // BC-ADMIN-SPEC-REAUDIT3-HELP-NEWSTATUS-CLAIM-2: New = NEW enum OR (OPEN + assigneeId=null)
      return { OR: [{ status: 'NEW' }, { AND: [{ status: 'OPEN' }, { assigneeId: null }] }] };
    case 'Waiting':
    case 'WAITING':
      return { status: { in: ['WAITING'] as TicketStatus[] } };
    case 'RESOLVED':
      return { status: { in: ['CLOSED', 'RESOLVED'] as TicketStatus[] } };
    case 'REJECTED':
      return { status: { in: ['CANCELLED', 'REJECTED'] as TicketStatus[] } };
    default:
      // Unknown token — pass through as-is so unknown values simply match nothing rather than 400.
      return { status: { in: [status as TicketStatus] } };
  }
}

/**
 * M7 (Spec §1.7 / Clash 8.2) — canonical `request_type` mapping.
 *
 * The spec defines exactly four request types: Support | Dispute | Change | Other.
 * The DB `TicketRequestType` enum includes three additional sub-types for Change:
 * DATA_CHANGE, LOCATION_CHANGE, CONTRACT_CHANGE. All three map back to the
 * canonical CHANGE so the admin API surface never fragments the canonical type —
 * when filtering by "Change", all *_CHANGE variants are returned.
 *
 *   SUPPORT         → Support
 *   DISPUTE         → Dispute
 *   CHANGE          → Change         (bare canonical Change)
 *   DATA_CHANGE     → Change         (Change sub-type: data)
 *   LOCATION_CHANGE → Change         (Change sub-type: location)
 *   CONTRACT_CHANGE → Change         (Change sub-type: contract)
 *   OTHER           → Other
 */
export type CanonicalRequestType = 'Support' | 'Dispute' | 'Change' | 'Other';

export function toCanonicalRequestType(requestType: string | null | undefined): CanonicalRequestType {
  switch (requestType) {
    case 'SUPPORT':
      return 'Support';
    case 'DISPUTE':
      return 'Dispute';
    case 'CHANGE':
    case 'DATA_CHANGE':
    case 'LOCATION_CHANGE':
    case 'CONTRACT_CHANGE':
      return 'Change';
    case 'OTHER':
      return 'Other';
    default:
      // Unknown/legacy value — surface as Support (safest default).
      return 'Support';
  }
}

/** Attach the canonical `requestType` to a ticket-shaped object without mutating the raw `requestType`. */
export function withCanonicalRequestType<T extends { requestType: string }>(
  ticket: T,
): T & { canonicalRequestType: CanonicalRequestType } {
  return { ...ticket, canonicalRequestType: toCanonicalRequestType(ticket.requestType) };
}

function shortTicketRef(ticketId: string): string {
  // 8-char prefix is plenty for visual disambiguation; the full UUID stays in
  // headers and the database, so subject parsing only needs to be unique
  // *enough* to seed a DB lookup.
  return ticketId.replace(/-/g, '').slice(0, 8);
}

/**
 * Compute the shortRef value to persist on HelpTicket.shortRef.
 * Exported so all ticket creation paths can populate the indexed column
 * used by the inbound subject-prefix resolver (Gap 8 fix).
 *
 * BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: This function returns the base 8-char
 * shortRef. In case of collision on unique constraint, callers must retry with a
 * longer length via computeShortRefOfLength().
 */
export function computeShortRef(ticketId: string): string {
  return shortTicketRef(ticketId);
}

/**
 * BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Compute a shortRef of a specific length.
 * Supports progressive widening on collision: 8 → 12 → 16 → 32 (full UUID).
 *
 * Callers use this in a retry loop when a unique constraint violation occurs:
 * 1. Try attempt=1 (8 chars)
 * 2. On collision, retry with attempt=2 (12 chars)
 * 3. On collision, retry with attempt=3 (16 chars)
 * 4. On collision, retry with attempt=4 (32 chars, guaranteed unique)
 */
export function computeShortRefOfLength(ticketId: string, attempt: number = 1): string {
  const hex = ticketId.replace(/-/g, '');
  const lengths = [8, 12, 16, 32];
  // Defensive: assert valid range to catch infinite retry loops from caller bugs
  if (attempt < 1 || attempt > lengths.length) {
    throw new Error(
      `computeShortRefOfLength: invalid attempt number ${attempt}; must be 1-${lengths.length}`
    );
  }
  const length = lengths[attempt - 1];
  return hex.slice(0, length);
}

/**
 * Build the plus-addressed Reply-To for an outbound ticket email.
 *
 * When a recipient replies to a ticket email, their mail client sends the
 * reply to the plus-addressed mailbox (e.g. support+abc12345@boomcard.bg).
 * The inbound parser (resolveTicket, Priority 2.5) extracts the shortRef
 * from the To header and resolves the ticket without relying on header
 * preservation — the fallback that survives forwarding and webmail.
 */
export function buildPlusReplyTo(ticketId: string, audience: 'partner' | 'subscriber'): string {
  const base = audience === 'partner' ? PARTNER_INBOUND : SUBSCRIBER_INBOUND;
  // H3 (Clash 7.1): plus-addressing is deferred to v1.3. In v1.2 (flag OFF, the
  // default) we emit the PLAIN inbound mailbox (support@ / office@) as Reply-To.
  // Threading then relies solely on the X-BoomCard-Request-ID header and the
  // [#XXXX] subject prefix (both still emitted by buildTicketHeaders /
  // buildTicketSubject). The `+<shortRef>` suffix is only added when the v1.3
  // preview flag is explicitly enabled.
  if (!isPlusAddressingEnabled()) {
    return base;
  }
  const atIdx = base.lastIndexOf('@');
  const shortRef = shortTicketRef(ticketId);
  return `${base.slice(0, atIdx)}+${shortRef}${base.slice(atIdx)}`;
}

/**
 * Build the `[#abcd1234] Subject` prefix. Idempotent: re-prefixing a subject
 * that already carries the marker is a no-op (so admin "edit and resend"
 * flows don't pile up multiple prefixes).
 *
 * BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: When a shortRef collision is resolved,
 * the persisted shortRef may be longer than 8 chars. Pass the actual persisted
 * shortRef (if available) to ensure the subject uses the same ref as the inbound
 * resolver will look up. Idempotency is preserved by stripping any existing [#...]
 * marker before checking for the new marker.
 */
export function buildTicketSubject(ticketId: string, subject: string, shortRef?: string): string {
  const ref = shortRef ?? shortTicketRef(ticketId);
  const marker = `[#${ref}]`;
  // Strip any existing [#...] marker to ensure idempotency when shortRef changes
  const cleanedSubject = subject.replace(SUBJECT_REF_RE, '').trim();
  if (cleanedSubject.includes(marker)) return subject; // Already has the exact marker
  return `${marker} ${cleanedSubject}`.trim();
}

/**
 * Generate a new RFC 5322 Message-ID for an outbound message. Format:
 *   <ticket-<ticketId>-<random>@mail.boomcard.bg>
 *
 * Embedding the ticket UUID provides a fast fallback when an inbound reply's
 * In-Reply-To header arrives but the messageId lookup misses (e.g. cache miss
 * after a DB restore).
 */
export function newMessageId(ticketId: string, domain: string = DEFAULT_DOMAIN): string {
  const rand = crypto.randomBytes(8).toString('hex');
  return `<ticket-${ticketId}-${rand}@${domain}>`;
}

export interface TicketEmailHeaders {
  /** Header object ready to merge into EmailOptions.headers */
  headers: Record<string, string>;
  /** The Message-ID this outbound email carries — persist to TicketReply.messageId */
  messageId: string;
}

/**
 * Compose the full header set for a ticket email.
 *
 * `inReplyTo` — when set, populates In-Reply-To + References so the recipient's
 * mail client visually threads the response under their original message.
 *
 * `references` — full RFC 5322 ancestry chain (oldest first). If provided,
 * used as-is for the References header. If omitted but `inReplyTo` is set,
 * falls back to `[inReplyTo]` as a single-element chain.
 */
export function buildTicketHeaders(args: {
  ticketId: string;
  inReplyTo?: string | null;
  references?: string[];  // full chain of prior Message-IDs, oldest first
}): TicketEmailHeaders {
  const messageId = newMessageId(args.ticketId);
  // Threading headers only — Reply-To is resolved audience-aware by email.service.ts
  // (partner → partner_reply_to_email / subscriber → reply_to_email) so callers
  // must pass `audience` to emailService.sendEmail() rather than relying on this
  // function to hard-code an inbound address.
  const headers: Record<string, string> = {
    // §6.2 / Clash 7.1: X-BoomCard-Request-ID is the canonical PRIMARY threading
    // marker. Emit it on every outbound message so a spec-literal external
    // integrator threading on X-BoomCard-Request-ID resolves at Priority 1.
    // X-BoomCard-Ticket-ID is retained (same value) as the legacy alias the
    // system has historically emitted — kept for backward compatibility.
    'X-BoomCard-Request-ID': args.ticketId,
    'X-BoomCard-Ticket-ID': args.ticketId,
    'Message-ID': messageId,
  };
  if (args.inReplyTo) {
    headers['In-Reply-To'] = args.inReplyTo;
    const refs = args.references?.length ? args.references : [args.inReplyTo];
    headers['References'] = refs.join(' ');
  }
  return { headers, messageId };
}

