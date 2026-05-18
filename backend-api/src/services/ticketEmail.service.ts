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

function shortTicketRef(ticketId: string): string {
  // 8-char prefix is plenty for visual disambiguation; the full UUID stays in
  // headers and the database, so subject parsing only needs to be unique
  // *enough* to seed a DB lookup.
  return ticketId.replace(/-/g, '').slice(0, 8);
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
 */
export function buildTicketHeaders(args: {
  ticketId: string;
  inReplyTo?: string | null;
}): TicketEmailHeaders {
  const messageId = newMessageId(args.ticketId);
  const headers: Record<string, string> = {
    'X-BoomCard-Ticket-ID': args.ticketId,
    'Message-ID': messageId,
  };
  if (args.inReplyTo) {
    headers['In-Reply-To'] = args.inReplyTo;
    headers['References'] = args.inReplyTo;
  }
  return { headers, messageId };
}

