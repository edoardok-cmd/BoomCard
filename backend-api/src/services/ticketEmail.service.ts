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

const DEFAULT_DOMAIN = 'mail.boomcard.bg';

// Inbound mailboxes for plus-addressing — must match the mail routing rules.
// Replies to subscriber tickets arrive at support+<shortRef>@boomcard.bg;
// replies to partner tickets arrive at office+<shortRef>@boomcard.bg.
const SUBSCRIBER_INBOUND = process.env.SUBSCRIBER_INBOUND_EMAIL ?? 'support@boomcard.bg';
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
 *   NEW       → New
 *   OPEN      → In Progress   (received + first contact made / being acted upon)
 *   IN_REVIEW → In Progress   (assigned + actively worked)
 *   WAITING   → Waiting
 *   RESOLVED  → Closed        (admin-internal pre-close)
 *   CLOSED    → Closed
 *   REJECTED  → Closed        (F4 — align with the schema convention + the existing
 *                              partner-facing serializers, which map REJECTED→Closed.
 *                              Spec §1.7's canonical set lists both Closed and
 *                              Cancelled but does not dictate which REJECTED takes;
 *                              the schema comment is authoritative: "Not in spec
 *                              canonical enum — map to 'Closed'". Keeping admin and
 *                              partner surfaces consistent.)
 *   CANCELLED → Cancelled
 */
export type CanonicalRequestStatus = 'New' | 'In Progress' | 'Waiting' | 'Closed' | 'Cancelled';

export function toCanonicalRequestStatus(status: string | null | undefined): CanonicalRequestStatus {
  switch (status) {
    case 'NEW':
      return 'New';
    case 'OPEN':
    case 'IN_REVIEW':
      return 'In Progress';
    case 'WAITING':
      return 'Waiting';
    case 'RESOLVED':
    case 'CLOSED':
    case 'REJECTED':
      // F4 — REJECTED maps to Closed to match the schema convention and the
      // existing partner-facing serializers (consistent labelling across surfaces).
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      // Unknown/legacy value — surface as In Progress (operationally open) rather
      // than inventing a sixth canonical value.
      return 'In Progress';
  }
}

/** Attach the canonical `requestStatus` to a ticket-shaped object without mutating the raw `status`. */
export function withCanonicalRequestStatus<T extends { status: string }>(
  ticket: T,
): T & { requestStatus: CanonicalRequestStatus } {
  return { ...ticket, requestStatus: toCanonicalRequestStatus(ticket.status) };
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
 */
export function computeShortRef(ticketId: string): string {
  return shortTicketRef(ticketId);
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
 */
export function buildTicketSubject(ticketId: string, subject: string): string {
  const ref = shortTicketRef(ticketId);
  const marker = `[#${ref}]`;
  if (subject.includes(marker)) return subject;
  return `${marker} ${subject}`.trim();
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

