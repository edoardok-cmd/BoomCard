/**
 * Inbound email-to-ticket service — Spec §11.2 v1.1.
 *
 * Takes a normalized inbound email payload and threads it into the ticket
 * system using the priority ladder defined in §11.2 / §6.2 / Clash 7.1:
 *
 *   1. X-BoomCard-Ticket-ID custom header (canonical alias: X-BoomCard-Request-ID)
 *   2. In-Reply-To / References → TicketReply.messageId
 *   3. Subject `[#XXXX]` reference (4–32 hex)
 *   4. Fallback: create a new HelpTicket (source=EMAIL)
 *
 * L7 / Spec §6.2 + Clash 7.1: Plus-addressing (`support+<shortRef>@…`) is DEFERRED
 * to v1.3 and is OFF by default in v1.2. The plus-address match runs ONLY when the
 * `isPlusAddressingEnabled()` flag is explicitly turned on; the v1.2-canonical
 * threading relies solely on the header (primary) and the `[#XXXX]` subject pattern
 * (fallback). Do not treat plus-addressing as an active priority step.
 *
 * Spoof protection (§11.2): when matching to an existing ticket, the sender
 * email must match the ticket owner, captured externalEmail, or a prior
 * reply's externalFrom. Otherwise the inbound is captured as a NEW ticket
 * linked via `linkedTicketId` so the admin can merge manually.
 *
 * Out-of-office / bulk replies (`Auto-Submitted: auto-replied`): per spec,
 * "не създава message, само бележка" — recorded as an `isAutoReply` reply row
 * but no further side-effects (no reopen, no notification fan-out).
 */

import { TicketStatus, TicketCategory, TicketPriority, TicketRequestType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { writeAudit } from '../middleware/audit.middleware';
import { emailService } from './email.service';
import { buildTicketSubject, buildTicketHeaders, buildPlusReplyTo, computeShortRef, computeShortRefOfLength, isPlusAddressingEnabled } from './ticketEmail.service';
import { notificationService } from './notification.service';
import { detach } from '../utils/detach';

export interface InboundEmailPayload {
  /** RFC 5321 sender — bare email or "Name <email@host>" */
  from: string;
  /** Recipient mailbox the email hit (support@ / office@) */
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** RFC 5322 Message-ID of the inbound message */
  messageId: string;
  /** RFC 5322 In-Reply-To */
  inReplyTo?: string;
  /** RFC 5322 References chain */
  references?: string[];
  /**
   * Our custom threading header, when the email is a reply to a system-sent
   * message. The system emits/reads `X-BoomCard-Ticket-ID` (field
   * `xBoomCardTicketId`). Spec §6.2 / Clash 7.1 name the canonical marker
   * `X-BoomCard-Request-ID`; a spec-literal external integrator may emit that
   * instead. The webhook layer normalizes `xBoomCardRequestId` → this field, and
   * `resolveTicket` falls back to it directly so the alias also threads when the
   * service is called outside the webhook (e.g. internal callers / tests).
   */
  xBoomCardTicketId?: string;
  /** Canonical spec alias (§6.2 / Clash 7.1) for `xBoomCardTicketId`. */
  xBoomCardRequestId?: string;
  /** RFC 3834 Auto-Submitted ("auto-replied" → out-of-office) */
  autoSubmitted?: string;
  /**
   * CC recipient addresses on the inbound message (bare email or "Name <email>").
   * Spec §11.2 lists "cc-нати админи" (CC'd admins) as an allowed inbound-sender
   * group. When this inbound threads into an existing ticket, the addresses here
   * that resolve to an ADMIN/SUPER_ADMIN account are persisted to TicketCC so a
   * later reply from that admin threads into the ticket instead of being treated
   * as a spoofer. Non-admin CC addresses are intentionally NOT recorded — that
   * would let any sender authorise arbitrary addresses to thread (spoof bypass).
   */
  cc?: string[];
}

// M5 / Spec §6.2 + Clash 7.1: the canonical subject-fallback marker is `[#XXXX]`
// (a 4-char-and-up hex reference). The threshold was previously 8, which silently
// failed to thread the spec's literal `[#XXXX]` notation. Widen to {4,32}.
export const SUBJECT_REF_RE = /\[#([a-f0-9]{4,32})\]/i;
const BOUNCE_SUBJECT_RE = /delivery (status|failure)|undeliverable|mailer[- ]daemon/i;
// Spec §11.2 edge case: forwarded emails break header threading and must always
// create a new ticket regardless of any [#ref] present in the subject. The
// forward prefix (Fwd: / Fw: and their locale variants) is the canonical signal.
const FWD_SUBJECT_RE = /^(fwd?|wg|vd|tr|fw|pf|enc|rv|inoltrato)\s*:/i;

/** Extract a bare lowercase email from a "Name <addr>" or plain `addr` value. */
function normalizeAddress(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

// Basic RFC 5322-ish syntactic email check — enough to reject obvious junk
// (empty, no @, whitespace) before persisting. Address authority/role is
// validated separately at the call site (admin filter); this is purely a
// shape guard so we never write a malformed row.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Persist shortRef with collision handling.
 *
 * The shortRef is a unique indexed column used by the inbound parser to thread
 * subject-prefix replies. With UUIDv4, birthday-collision risk is non-trivial at
 * scale (low tens of thousands). On unique constraint violation, retry with a
 * progressively longer ref: 8 → 12 → 16 → 32 chars (guaranteed unique, full UUID).
 *
 * Returns the persisted shortRef on success. On all retries exhausted, logs an
 * error, notifies ops, and returns null (the ticket is still created, but without
 * shortRef threading will fail and create duplicates). The inbound parser will
 * recover via Priority 2 (In-Reply-To) or Priority 3 (header), so this is bounded
 * damage (threading broken only for subject-prefix fallback).
 *
 * UUID collision assumptions:
 * - We rely on UUIDs being globally unique (UUID v4 generation in Prisma).
 * - P2002 violations on shortRef updates are always collisions with DIFFERENT tickets.
 * - Idempotent re-calls with the same ticketId will NOT occur because each ingestInboundEmail() creates a new ticket.
 * - The WHERE shortRef IS NULL guard below ensures this function is idempotent: if called twice on the same
 *   ticket, the second call will encounter shortRef already populated and the update will be skipped.
 *
 * @param ticketId — the newly created ticket UUID
 * @returns The persisted shortRef string, or null on failure (after all retries)
 */
async function persistShortRefWithCollisionRetry(ticketId: string): Promise<string | null> {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const shortRef = computeShortRefOfLength(ticketId, attempt);
      await prisma.helpTicket.update({
        where: { id: ticketId, shortRef: null }, // Only update if shortRef is not already set (idempotent guard)
        data: { shortRef },
      });
      if (attempt > 1) {
        logger.info(`[ticketInbound] shortRef collision resolved on attempt ${attempt}: ${shortRef}`);
      }
      return shortRef;
    } catch (err) {
      const isUniqueViolation = (err as any)?.code === 'P2002';
      if (!isUniqueViolation || attempt === MAX_ATTEMPTS) {
        // Final attempt or non-collision error — escalate to ops.
        logger.error(
          `[ticketInbound] shortRef update failed for ticket ${ticketId} after ${attempt} attempt(s):`,
          err,
        );
        try {
          // Sanitize error message to avoid leaking database internals
          const sanitizedMsg = isUniqueViolation ? 'Unique constraint violation' : 'Database error';
          detach(notificationService
            .notifyAdminOps({
              opsType: `ticket_shortref_collision_${ticketId}`,
              title: 'Help-Ticket shortRef persistence failed — manual intervention required',
              message: `Help-Ticket ${ticketId.slice(0, 8)} — shortRef collision unresolved after 4 attempts. Inbound reply threading will fail; subject-prefix matching will create duplicate tickets. Manual intervention required.`,
              severity: 'critical',
              fields: [
                { label: 'Ticket ID', value: ticketId },
                { label: 'Status', value: 'Requires immediate investigation' },
              ],
            }), () => {});
        } catch (opsErr) {
          logger.error('[ticketInbound] failed to notify ops of shortRef collision:', opsErr);
        }
        return null;
      }
      // Collision on non-final attempt — retry with longer ref
      logger.debug(`[ticketInbound] shortRef collision on attempt ${attempt}, retrying with longer ref`);
    }
  }
  return null;
}

/**
 * Spec §11.2 — persist a set of CC addresses against a ticket so a later inbound
 * reply from one of those addresses threads into the original ticket (it is added
 * to the spoof-protection allow-set, see the matched-ticket branch below).
 *
 * Generic normalize+persist helper: it does NOT itself decide WHO is authorised
 * to be recorded — the caller is responsible for restricting the input list
 * (e.g. to CC'd admins). It normalizes each address via {@link normalizeAddress}
 * (bare addr from "Name <addr>", trimmed, lowercased), drops syntactically
 * invalid addresses, de-dupes, and writes via createMany({ skipDuplicates }) so
 * it is idempotent against the @@unique([ticketId, email]) constraint.
 *
 * Returns the number of rows submitted to createMany (post-normalize/dedupe).
 * No-op (returns 0) on empty/whitespace-only input.
 */
export async function recordTicketCcs(ticketId: string, emails: string[]): Promise<number> {
  if (!ticketId || !emails?.length) return 0;
  const normalized = Array.from(
    new Set(
      emails
        .map((e) => normalizeAddress(e))
        .filter((e) => EMAIL_RE.test(e))
    )
  );
  if (!normalized.length) return 0;
  await prisma.ticketCC.createMany({
    data: normalized.map((email) => ({ ticketId, email })),
    skipDuplicates: true,
  });
  return normalized.length;
}

/**
 * Resolve which of the given CC addresses belong to an ADMIN/SUPER_ADMIN account.
 * Mirrors the role set used by getSystemOwnerId(). Returns lowercased emails of
 * the matched admin accounts (deduped). Used to gate TicketCC population so only
 * CC'd admins — not arbitrary CC recipients — can be authorised to thread.
 */
async function resolveAdminCcEmails(ccEmails: string[]): Promise<string[]> {
  const normalized = Array.from(
    new Set(ccEmails.map((e) => normalizeAddress(e)).filter((e) => EMAIL_RE.test(e)))
  );
  if (!normalized.length) return [];
  const admins = await prisma.user.findMany({
    where: { email: { in: normalized }, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { email: true },
  });
  return Array.from(new Set(admins.map((a) => a.email.toLowerCase())));
}

/** Detect bounce / DSN messages by subject or sender heuristics. */
function isBounce(payload: InboundEmailPayload): boolean {
  if (BOUNCE_SUBJECT_RE.test(payload.subject || '')) return true;
  const from = normalizeAddress(payload.from);
  if (from.includes('mailer-daemon') || from.startsWith('postmaster@')) return true;
  return false;
}

/**
 * Detect forwarded emails (Fwd: / Fw: and locale variants).
 *
 * Spec §11.2 edge case: "Препратен имейл (Fwd:) от трета страна. → Headers не
 * match-ват (forward break-ва threading). → Създава се нов тикет, който може да
 * бъде merge-нат ръчно от админ."
 *
 * A forwarded email may carry a [#ref] subject prefix from the original message.
 * Without this guard, Priority 4 (subject-prefix) would incorrectly attach the
 * forward to the original ticket instead of creating a new one for manual review.
 * We only suppress subject-prefix matching — headers (priorities 1-3) still work
 * for the rare case where a mail client forwards AND preserves custom headers.
 */
function isForwarded(subject: string): boolean {
  return FWD_SUBJECT_RE.test(subject.trimStart());
}

/**
 * Spec §11.2 priority ladder. Returns the matched HelpTicket (if any) and
 * how it was matched (for audit logging).
 */
async function resolveTicket(payload: InboundEmailPayload): Promise<{
  ticket: Awaited<ReturnType<typeof prisma.helpTicket.findUnique>> | null;
  matchedBy: 'header' | 'in-reply-to' | 'plus-address' | 'subject-prefix' | null;
}> {
  // Priority 1: X-BoomCard-Ticket-ID (system header) OR its canonical spec
  // alias X-BoomCard-Request-ID (§6.2 / Clash 7.1). Prefer whichever is present;
  // the ticket-id header wins when both are supplied.
  const headerTicketId = payload.xBoomCardTicketId || payload.xBoomCardRequestId;
  if (headerTicketId) {
    const t = await prisma.helpTicket.findUnique({
      where: { id: headerTicketId },
    });
    if (t) return { ticket: t, matchedBy: 'header' };
  }

  // Priority 2: In-Reply-To / References → TicketReply.messageId
  const candidates: string[] = [];
  if (payload.inReplyTo) candidates.push(payload.inReplyTo);
  if (payload.references?.length) candidates.push(...payload.references);
  if (candidates.length) {
    const reply = await prisma.ticketReply.findFirst({
      where: { messageId: { in: candidates } },
      select: { ticketId: true },
    });
    if (reply) {
      const t = await prisma.helpTicket.findUnique({ where: { id: reply.ticketId } });
      if (t) return { ticket: t, matchedBy: 'in-reply-to' };
    }
    // Also try rootMessageId fallback (first message of an email-originated thread).
    const root = await prisma.helpTicket.findFirst({
      where: { rootMessageId: { in: candidates } },
    });
    if (root) return { ticket: root, matchedBy: 'in-reply-to' };
  }

  // Priority 3 (spec §11.2): plus-addressing in the To header.
  // When the system sends an outbound ticket email it sets Reply-To to
  // support+<shortRef>@boomcard.bg (or office+...). If the recipient replies,
  // their mail client's To field contains that plus-address. We extract the
  // shortRef from the local-part and resolve the ticket via the indexed column.
  // This path survives forwarding chains that strip custom headers.
  //
  // Spec §11.2 also lists "cc-нати админи" (CC'd admins) as an allowed sender
  // group in the spoof-protection check (matched-ticket branch below). That is
  // now implemented via the TicketCC table: when an inbound threads into an
  // existing ticket, any CC addresses that resolve to an ADMIN/SUPER_ADMIN
  // account are recorded against the ticket (see ingestInboundEmail), and the
  // spoof check folds those addresses into the allowed set.
  // H3 (Spec Part 6 / Clash 7.1): plus-addressing is DEFERRED to v1.3. In v1.2
  // (the default, flag OFF) this resolution path is disabled entirely so threading
  // relies ONLY on the header (Priority 1) and subject (Priority 4) fallbacks.
  // The path is preserved behind TICKET_PLUS_ADDRESSING_ENABLED for v1.3 preview.
  if (isPlusAddressingEnabled() && payload.to) {
    const plusMatch = /\+([a-f0-9]{4,32})@/i.exec(payload.to);
    if (plusMatch) {
      const ref = plusMatch[1].toLowerCase();
      // Try exact UUID lookup first (full 32-char hex or hyphenated form).
      if (ref.length === 32 || ref.includes('-')) {
        const t = await prisma.helpTicket.findUnique({ where: { id: ref } });
        if (t) return { ticket: t, matchedBy: 'plus-address' };
      }
      // Short-ref O(1) indexed lookup via the indexed shortRef column.
      // Support any length 4-32 per the regex pattern.
      if (ref.length >= 4 && ref.length <= 32) {
        const t = await prisma.helpTicket.findUnique({ where: { shortRef: ref } });
        if (t) return { ticket: t, matchedBy: 'plus-address' };
      }
    }
  }

  // Priority 4 (spec §11.2): subject [#XXXXXXXX] prefix — match either full UUID
  // or 4-32 char short form via the indexed shortRef column (Gap 8 fix).
  // SKIPPED for forwarded emails (Fwd: / Fw: prefix detected) per spec §11.2
  // edge case: "Препратен имейл → Създава се нов тикет." The subject prefix
  // survives forwarding but header threading does not; we must not treat the
  // forwarded copy as a new reply on the original ticket.
  const m = !isForwarded(payload.subject ?? '') && payload.subject?.match(SUBJECT_REF_RE);
  if (m) {
    const ref = m[1].toLowerCase();
    // Try exact UUID lookup first (full 32-char hex or hyphenated form).
    if (ref.length === 32 || ref.includes('-')) {
      const t = await prisma.helpTicket.findUnique({ where: { id: ref } });
      if (t) return { ticket: t, matchedBy: 'subject-prefix' };
    }
    // Short-ref O(1) indexed lookup via the indexed shortRef column.
    // BC-REAUDIT-TICKET-SHORTREF-BACKFILL-2: all rows now have shortRef populated.
    // Support collision-widened refs: 4–32 chars per SUBJECT_REF_RE pattern.
    if (ref.length >= 4 && ref.length <= 32) {
      const t = await prisma.helpTicket.findUnique({ where: { shortRef: ref } });
      if (t) return { ticket: t, matchedBy: 'subject-prefix' };
    }
  }

  // Priority 5 (spec §11.2 fallback): no match → caller creates a new ticket.
  return { ticket: null, matchedBy: null };
}

/**
 * Resolve a "system" userId to own inbound-email tickets when the sender
 * doesn't map to a known User. Spec §11.1 mandates one ticket regardless
 * of channel, and HelpTicket.userId is non-nullable, so we park orphan
 * inbound emails under an admin account.
 *
 * NOTE: this is a holding pattern. The admin can re-assign ownership once
 * the sender is identified. We pick the oldest admin so the choice is
 * deterministic across deploys.
 */
async function getSystemOwnerId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Derive the inbound audience from the SENDER's account role, not the recipient
 * mailbox. Since BC-USER-SPEC-FIX-013 collapsed both subscriber and partner
 * inbound to office@boomcard.bg (spec §12.1), the old `to.includes('office@')`
 * heuristic always returned true and mislabeled every subscriber inbound as a
 * partner. We now look up the sender by email: a PARTNER-role account → 'partner'
 * (Partner support queue); everything else — USER, ADMIN/SUPER_ADMIN (internal),
 * and unidentified/no-account senders — defaults to 'subscriber' (User support),
 * the safe default for an inbound we can't positively attribute to a partner.
 */
async function resolveInboundAudience(
  fromEmail: string
): Promise<'partner' | 'subscriber'> {
  // NB: `email` alone is not a unique key on User (the unique constraint is the
  // compound email_role), so the same address can have both a USER and a PARTNER
  // row. Query specifically for a PARTNER row (at most one per email under the
  // email_role constraint) so the result is deterministic and a genuine partner
  // is never mislabeled 'subscriber' by an incidental USER row on the same email.
  const partnerRow = await prisma.user
    .findFirst({ where: { email: fromEmail, role: 'PARTNER' }, select: { id: true } })
    .catch(() => null);
  return partnerRow ? 'partner' : 'subscriber';
}

/**
 * M5 (Spec §1.7 / §3.8) — classify an inbound email into the canonical Request
 * Type set: Support / Dispute / Change / Other. The earlier implementation always
 * returned SUPPORT; the spec requires office@/support@ inbounds be parsed into a
 * typed Help Request. Classification is a best-effort keyword heuristic over the
 * subject + body (BG + EN terms); the admin can always reclassify later (§7.2 the
 * type only affects the suggested team, all tickets land in the shared queue).
 *
 * Precedence: Dispute > Change > Support, with Other reserved for inbounds that
 * match no signal AND carry no usable text. The destination mailbox is retained
 * as a tie-break input (office@ → partner-leaning, but type is still text-driven).
 *
 * Keep keyword lists conservative and high-precision: a false SUPPORT default is
 * cheap to fix in the UI, a false DISPUTE/CHANGE mis-routes the suggested team.
 */
const DISPUTE_KEYWORDS = [
  // EN
  'dispute', 'chargeback', 'fraud', 'unauthori', 'refund', 'complaint', 'wrong charge',
  'incorrect cashback', 'not received', "didn't receive", 'did not receive', 'missing cashback',
  // BG
  'оспор', 'измам', 'възражение', 'жалба', 'не получих', 'грешна сума', 'грешно начислен',
  'неоторизиран', 'възстановяване на сум', 'рекламация', 'спор',
];
const CHANGE_KEYWORDS = [
  // EN
  'change', 'update', 'modify', 'edit my', 'amend', 'cancel my subscription', 'contract',
  'commission', 'new address', 'change iban', 'update iban', 'change bank', 'rename',
  // BG
  'промян', 'промен', 'актуализ', 'редактир', 'смяна', 'смени', 'обнови', 'договор',
  'комисион', 'нов адрес', 'смяна на iban', 'промяна на iban', 'анекс',
];

function classifyKeywords(haystack: string, keywords: string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw));
}

export function inferRequestType(payload: Pick<InboundEmailPayload, 'subject' | 'text' | 'html' | 'to'>): TicketRequestType {
  const subject = (payload.subject || '').toLowerCase();
  const bodyText = (payload.text || (payload.html ? payload.html.replace(/<[^>]+>/g, ' ') : '')).toLowerCase();
  const haystack = `${subject} ${bodyText}`.trim();

  // No usable text to classify → Other (admin triages from the raw email).
  if (!haystack) return 'OTHER';

  // Dispute has the highest mis-route cost downstream, so it wins on overlap.
  if (classifyKeywords(haystack, DISPUTE_KEYWORDS)) return 'DISPUTE';
  // Generic Change classification — admin narrows to DATA_CHANGE / CONTRACT_CHANGE
  // / LOCATION_CHANGE sub-types once they read the email.
  if (classifyKeywords(haystack, CHANGE_KEYWORDS)) return 'CHANGE';

  // Default: Support (the safe, lowest-cost default for any operational question).
  return 'SUPPORT';
}

export interface IngestResult {
  ticketId: string;
  replyId?: string;
  created: boolean;
}

/**
 * Main entry point. Ingest a normalized inbound email and thread it into
 * the ticket system. Returns the matched/created ticket id and (if a reply
 * was attached) the reply id. `created=true` means a brand new HelpTicket
 * row was written.
 */
export async function ingestInboundEmail(
  payload: InboundEmailPayload
): Promise<IngestResult> {
  // Bounce / DSN: never create a ticket, never reply.
  if (isBounce(payload)) {
    logger.warn(`[ticketInbound] bounce/DSN from=${payload.from} subject="${payload.subject}" — dropped`);

    // Persist for multi-bounce tracking. Try to associate the bounce with a
    // ticket by extracting a [#XXXX] reference from the bounce subject — the
    // original outbound email (which bounced) carried this in its subject.
    try {
      // Attempt to resolve the ticket the bounce relates to.
      let relatedTicketId: string | null = null;
      const subjectMatch = (payload.subject || '').match(SUBJECT_REF_RE);
      if (subjectMatch) {
        const ref = subjectMatch[1].toLowerCase();
        // Mirror the same priority ladder used by resolveTicket (Gap-8 fix):
        // full-UUID → shortRef O(1) indexed lookup (all tickets backfilled).
        if (ref.length === 32 || ref.includes('-')) {
          const t = await prisma.helpTicket.findUnique({ where: { id: ref }, select: { id: true } });
          relatedTicketId = t?.id ?? null;
        }
        if (!relatedTicketId && ref.length >= 4 && ref.length <= 32) {
          // BC-REAUDIT-TICKET-SHORTREF-BACKFILL-2: Use indexed shortRef lookup.
          // All tickets now have shortRef populated (backfill migration applied).
          const t = await prisma.helpTicket.findUnique({ where: { shortRef: ref }, select: { id: true } });
          relatedTicketId = t?.id ?? null;
        }
      }

      await prisma.inboundBounce.create({
        data: {
          fromEmail: normalizeAddress(payload.from),
          toEmail: payload.to || null,
          subject: payload.subject || null,
          messageId: payload.messageId || null,
          ticketId: relatedTicketId,
        },
      });

      // Alert the assignee if we matched a ticket, otherwise fall back to ops.
      // Threshold: 3+ unalerted bounces in the last 30 days.
      const bounceCount = await prisma.inboundBounce.count({
        where: {
          ...(relatedTicketId ? { ticketId: relatedTicketId } : { fromEmail: normalizeAddress(payload.from) }),
          alerted: false,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      if (bounceCount >= 3) {
        await prisma.inboundBounce.updateMany({
          where: {
            ...(relatedTicketId ? { ticketId: relatedTicketId } : { fromEmail: normalizeAddress(payload.from) }),
            alerted: false,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          data: { alerted: true },
        });

        // If we resolved a ticket, alert the assignee (spec §11.2 "alert assignee").
        let alertedAssignee = false;
        if (relatedTicketId) {
          try {
            const ticket = await prisma.helpTicket.findUnique({
              where: { id: relatedTicketId },
              include: { assignee: { select: { email: true, firstName: true } } },
            });
            if (ticket?.assignee?.email) {
              await emailService.sendEmail({
                to: ticket.assignee.email,
                subject: `[Bounce Alert] Неуспешна доставка за заявка #${relatedTicketId.slice(0, 8)}`,
                html: `<p>Здравей, ${ticket.assignee.firstName || ticket.assignee.email},</p><p>${bounceCount} bounce-а бяха засечени за заявка <strong>${ticket.subject}</strong>. Адресът на подателя може да е невалиден.</p><p>Ticket ID: ${relatedTicketId}</p>`,
                text: `${bounceCount} bounce-а за заявка ${ticket.subject}. Адресът може да е невалиден. Ticket ID: ${relatedTicketId}`,
              });
              alertedAssignee = true;
            }
          } catch (alertErr) {
            logger.error('[ticketInbound] failed to alert assignee of bounces:', alertErr);
          }
        }

        // Fall back to ops notification if no assignee or no ticket resolved.
        if (!alertedAssignee) {
          detach(notificationService
            .notifyAdminOps({
              opsType: `bounce_alert_${relatedTicketId ?? normalizeAddress(payload.from)}`,
              title: 'Многократни bounce-и',
              message: `${bounceCount} bounce-а${relatedTicketId ? ` за заявка ${relatedTicketId.slice(0, 8)}` : ` от ${normalizeAddress(payload.from)}`} за последните 30 дни`,
              severity: 'warning',
              fields: [
                { label: 'Адрес', value: normalizeAddress(payload.from) },
                ...(relatedTicketId ? [{ label: 'Ticket ID', value: relatedTicketId }] : []),
              ],
            }), () => {});
        }
      }
    } catch (err) {
      logger.error('[ticketInbound] failed to persist bounce record:', err);
    }

    return { ticketId: '', replyId: undefined, created: false };
  }

  const fromEmail = normalizeAddress(payload.from);
  const resolved = await resolveTicket(payload);

  // ── No match → create a new ticket ─────────────────────────────────────
  if (!resolved.ticket) {
    // Try to find an owner by sender email. Multiple users can share an
    // email (per project memory), so use findFirst.
    const owner = await prisma.user.findFirst({ where: { email: fromEmail } });

    // Without an owner User, default to a system admin so the inbound is
    // captured rather than dropped. Admin re-assigns ownership in the UI.
    const ownerId = owner?.id ?? (await getSystemOwnerId());
    if (!ownerId) {
      // Audit-pass [5.2]: persist the orphan inbound instead of silently
      // dropping it. A follow-up job replays these once an admin is seeded.
      logger.error(
        `[ticketInbound] no admin available to own orphan inbound email from ${fromEmail}; persisting to OrphanInboundEmail`
      );
      try {
        await prisma.orphanInboundEmail.create({
          data: {
            fromEmail,
            fromName: payload.from || null,
            subject: payload.subject || null,
            bodyText: payload.text || null,
            bodyHtml: payload.html || null,
            messageId: payload.messageId || null,
            rawPayload: payload as any,
            reason: 'NO_ADMIN',
          },
        });
      } catch (err) {
        logger.error('[ticketInbound] failed to persist orphan inbound email:', err);
      }
      return { ticketId: '', replyId: undefined, created: false };
    }

    // Drop a leading [#XXXX] prefix from the subject if present — the match
    // ladder already failed, so the marker is just noise.
    const cleanedSubject =
      (payload.subject || '').replace(SUBJECT_REF_RE, '').trim() || '(no subject)';

    const newTicketData = {
      subject: cleanedSubject,
      // Prefer plain text; strip HTML if that's all we got. Simple and
      // adequate for MVP.
      body: payload.text || (payload.html ? payload.html.replace(/<[^>]+>/g, '') : ''),
      category: TicketCategory.OTHER,
      priority: TicketPriority.MEDIUM,
      // Spec §11.4 initial status is "Отворена" (OPEN). NEW is legacy-only.
      status: TicketStatus.OPEN,
      userId: ownerId,
      source: 'EMAIL',
      externalEmail: fromEmail,
      rootMessageId: payload.messageId || null,
      requestType: inferRequestType(payload),
    };
    const ticket = await prisma.helpTicket.create({ data: newTicketData });
    // Gap 8: backfill shortRef immediately after creation (computed from the UUID
    // assigned by Postgres). create() doesn't know the id ahead of time.
    // BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Retry with progressively longer
    // refs on collision, escalate to ops if all attempts fail.
    const persistedShortRef = await persistShortRefWithCollisionRetry(ticket.id);

    // CRITICAL: If all shortRef retry attempts fail, delete the ticket and return error.
    // Creating a ticket without shortRef breaks subject-prefix threading and causes
    // duplicates on subsequent inbound emails from the same sender.
    if (!persistedShortRef) {
      logger.error(
        `[ticketInbound] shortRef persistence failed for ticket ${ticket.id}; deleting orphan ticket`
      );
      await prisma.helpTicket.delete({ where: { id: ticket.id } }).catch(() => {});
      throw new Error(
        `Help ticket created but shortRef persistence failed after all retry attempts. Ticket creation rolled back. Sender should retry.`
      );
    }

    await writeAudit({
      actorUserId: null,
      action: 'TICKET_INBOUND_CREATED',
      objectType: 'HelpTicket',
      objectId: ticket.id,
      after: { from: fromEmail, to: payload.to, messageId: payload.messageId },
    }).catch(() => {});

    // Audience is derived from the SENDER's role (PARTNER → partner) — the
    // recipient mailbox can no longer distinguish audiences now that all inbound
    // lands on office@ (BC-USER-SPEC-FIX-013). Computed once, reused for the
    // auto-reply and the admin-ops queue label below.
    const isPartnerSender = (await resolveInboundAudience(fromEmail)) === 'partner';

    // Spec §11.1 — auto-reply to the sender with the ticket reference so
    // subsequent replies thread back via [#XXXXXXXX] / X-BoomCard-Ticket-ID.
    // Fire-and-forget: a mailer failure must not block ticket creation.
    // BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Pass the persisted shortRef
    // to sendInboundAutoReply so the subject uses the actual ref.
    detach(sendInboundAutoReply({
      ticketId: ticket.id,
      to: fromEmail,
      originalSubject: cleanedSubject,
      inReplyTo: payload.messageId || null,
      audience: isPartnerSender ? 'partner' : 'subscriber',
      shortRef: persistedShortRef ?? undefined,
    }), (err) =>
      logger.error(`[ticketInbound] failed to send auto-reply for ${ticket.id}:`, err));

    // Gap 9 fix: §11.6 routing — email tickets default to SUPPORT; admin can
    // reclassify. Surface the destination mailbox so the admin can see which
    // channel it arrived on (support@ vs. office@).
    const emailReqType = inferRequestType(payload);
    const emailQueue = isPartnerSender ? 'Partner support' : 'User support';
    detach(notificationService
      .notifyAdminOps({
        opsType: `help_ticket_created_email_${ticket.id}`,
        title: `Имейл заявка [${emailReqType}]: ${emailQueue}`,
        message: cleanedSubject,
        severity: 'info',
        fields: [
          { label: 'Опашка', value: emailQueue },
          { label: 'От', value: fromEmail },
          { label: 'До', value: payload.to || '' },
          { label: 'Ticket ID', value: ticket.id },
        ],
      }), (err) => logger.warn('[ticketInbound] failed to notify admin ops of email ticket:', err));

    return { ticketId: ticket.id, created: true };
  }

  // ── Matched an existing ticket ────────────────────────────────────────
  const t = resolved.ticket;

  // ── Record CC'd admins (§11.2) BEFORE the spoof check ─────────────────────
  // Spec §11.2 authorises "cc-нати админи" (CC'd ADMINS) to thread into the
  // ticket. We persist only CC addresses that resolve to an ADMIN/SUPER_ADMIN
  // account — recording arbitrary CC recipients would let any sender authorise
  // arbitrary addresses to thread, defeating the spoof guard. The filter +
  // population run here (on the matched-ticket path) so a reply CC'ing an admin
  // makes that admin's address an allowed sender for subsequent inbounds.
  if (payload.cc?.length) {
    try {
      const adminCcEmails = await resolveAdminCcEmails(payload.cc);
      if (adminCcEmails.length) {
        await recordTicketCcs(t.id, adminCcEmails);
      }
    } catch (err) {
      // CC population is best-effort: a failure must not block threading the reply.
      logger.error(`[ticketInbound] failed to record CC admins for ticket ${t.id}:`, err);
    }
  }

  // Spoof protection (§11.2): sender must be the ticket owner, the assigned
  // admin, the captured externalEmail, any prior reply's externalFrom, or a
  // recorded CC'd admin (TicketCC). Spec: "owner OR assignee OR cc-нати админи".
  // Anyone else → create a linked ticket so we never inject into someone else's
  // conversation. All entries are lowercased and fromEmail is lowercased upstream
  // by normalizeAddress, so matching is case-insensitive.
  const [ownerRecord, assigneeRecord, priorExternal, ccRecords] = await Promise.all([
    prisma.user.findUnique({ where: { id: t.userId }, select: { email: true } }),
    t.assigneeId
      ? prisma.user.findUnique({ where: { id: t.assigneeId }, select: { email: true } })
      : Promise.resolve(null),
    prisma.ticketReply.findMany({
      where: { ticketId: t.id, externalFrom: { not: null } },
      select: { externalFrom: true },
    }),
    prisma.ticketCC.findMany({
      where: { ticketId: t.id },
      select: { email: true },
    }),
  ]);
  const allowed = new Set<string>(
    [
      ownerRecord?.email,
      assigneeRecord?.email,
      t.externalEmail,
      ...priorExternal.map((r) => r.externalFrom),
      ...ccRecords.map((c) => c.email),
    ]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase())
  );

  if (!allowed.has(fromEmail)) {
    logger.warn(
      `[ticketInbound] spoof guard: from=${fromEmail} not in allowed set for ticket=${t.id}; creating linked ticket`
    );
    // Assign the linked ticket to a system admin rather than to the original
    // ticket's owner. Using t.userId as owner caused the original ticket creator
    // to see phantom tickets in "My tickets" that they never submitted. A system
    // admin owns the linked ticket and can re-assign once the sender is identified.
    const linkedOwnerId = await getSystemOwnerId();
    if (!linkedOwnerId) {
      logger.error(
        `[ticketInbound] spoof guard: no admin available to own linked ticket for original=${t.id} from=${fromEmail}; dropping inbound`
      );
      return { ticketId: t.id, created: false };
    }
    const linked = await prisma.helpTicket.create({
      data: {
        subject:
          (payload.subject || '').replace(SUBJECT_REF_RE, '').trim() ||
          `(re: ${t.subject})`,
        body: payload.text || '',
        category: TicketCategory.OTHER,
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        userId: linkedOwnerId,
        source: 'EMAIL',
        externalEmail: fromEmail,
        rootMessageId: payload.messageId || null,
        requestType: inferRequestType(payload),
        linkedTicketId: t.id,
      },
    });
    // Gap 8: populate shortRef for the spoof-linked ticket.
    // BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Retry with progressively longer
    // refs on collision, escalate to ops if all attempts fail.
    const linkedPersistedShortRef = await persistShortRefWithCollisionRetry(linked.id);

    // CRITICAL: If all shortRef retry attempts fail, delete the linked ticket and return error.
    if (!linkedPersistedShortRef) {
      logger.error(
        `[ticketInbound] shortRef persistence failed for linked ticket ${linked.id}; deleting orphan ticket`
      );
      await prisma.helpTicket.delete({ where: { id: linked.id } }).catch(() => {});
      throw new Error(
        `Spoof-linked ticket created but shortRef persistence failed after all retry attempts. Ticket creation rolled back. Sender should retry.`
      );
    }
    await writeAudit({
      actorUserId: null,
      action: 'TICKET_INBOUND_SPOOF_BLOCKED',
      objectType: 'HelpTicket',
      objectId: t.id,
      after: { from: fromEmail, newTicketId: linked.id, originalTicketId: t.id },
    }).catch(() => {});

    // Audit-pass [5.1]: send a neutral confirmation with the NEW ticket's
    // reference. The sender may be legitimate (e.g. a colleague on a shared
    // address); silence would push them to resend or escalate. The reply
    // does NOT reveal that the original ticket existed — just acknowledges
    // their inbound was received and gives them a way to thread replies.
    // BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Pass the persisted shortRef
    // to sendInboundAutoReply so the subject uses the actual ref.
    detach(sendInboundAutoReply({
      ticketId: linked.id,
      to: fromEmail,
      originalSubject:
        (payload.subject || '').replace(SUBJECT_REF_RE, '').trim() || `(re: ${t.subject})`,
      inReplyTo: payload.messageId || null,
      audience: await resolveInboundAudience(fromEmail),
      shortRef: linkedPersistedShortRef ?? undefined,
    }), (err) =>
      logger.error(`[ticketInbound] failed to send spoof-branch auto-reply for ${linked.id}:`, err));

    return { ticketId: linked.id, created: true };
  }

  // Out-of-office / vacation auto-reply: log as a metadata-only note via
  // isAutoReply=true. No reopen, no fan-out.
  const isAutoReply =
    (payload.autoSubmitted || '').toLowerCase().includes('auto-replied');
  if (isAutoReply) {
    const note = await prisma.ticketReply.create({
      data: {
        ticketId: t.id,
        authorId: null,
        body: `Auto-reply received from ${fromEmail}`,
        isAdmin: false,
        messageId: payload.messageId || null,
        inReplyTo: payload.inReplyTo || null,
        channel: 'EMAIL',
        isAutoReply: true,
        externalFrom: fromEmail,
      },
    });
    return { ticketId: t.id, replyId: note.id, created: false };
  }

  // Regular reply.
  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: t.id,
      authorId: null,
      body: payload.text || (payload.html ? payload.html.replace(/<[^>]+>/g, '') : ''),
      isAdmin: false,
      messageId: payload.messageId || null,
      inReplyTo: payload.inReplyTo || null,
      channel: 'EMAIL',
      externalFrom: fromEmail,
    },
  });

  // Reopen-on-reply (§11.4 + §11.2 edge cases): a CLOSED, RESOLVED or WAITING
  // ticket transitions back to OPEN when the customer replies via email.
  // RESOLVED is included for symmetry with the WEB-channel handlers in
  // adminHelp.routes.ts and partnerHelp.routes.ts (both handle RESOLVED→OPEN).
  // resolvedAt is cleared so the auto-close job doesn't immediately re-fire.
  // CANCELLED and REJECTED are intentionally EXCLUDED — they are terminal
  // (spec §1.7/§7.1: "withdrawn or invalid" / rejected). An inbound reply on a
  // withdrawn ticket must NOT silently revive it; the message is still captured
  // as a TicketReply for the record, but the ticket stays terminal.
  // Capture previousStatus before the update — the in-memory object may be
  // mutated by the ORM layer before writeAudit reads t.status.
  const previousStatus = t.status;
  if (previousStatus === TicketStatus.CLOSED || previousStatus === TicketStatus.RESOLVED || previousStatus === TicketStatus.WAITING) {
    await prisma.helpTicket.update({
      where: { id: t.id },
      data: { status: TicketStatus.OPEN, reopenedAt: new Date(), resolvedAt: null },
    });
    await writeAudit({
      actorUserId: null,
      action: 'TICKET_REOPENED_VIA_EMAIL',
      objectType: 'HelpTicket',
      objectId: t.id,
      after: { replyId: reply.id, from: fromEmail, previousStatus },
    }).catch(() => {});
  }

  // Notify the assignee when an inbound email reply arrives. Without this,
  // email replies are invisible to the assigned admin until they open the list.
  // Skip self-assigned tickets to avoid an admin emailing themselves.
  if (t.assigneeId && t.assigneeId !== t.userId) {
    try {
      const assignee = await prisma.user.findUnique({
        where: { id: t.assigneeId },
        select: { email: true, firstName: true },
      });
      if (assignee?.email) {
        // Build the full RFC 5322 threading chain from the ticket's prior
        // system-sent messages — same approach as adminHelp.routes.ts reply handler.
        // Using the inbound's own messageId as In-Reply-To was wrong: it would
        // make the notification appear as a child of the customer's email in mail
        // clients rather than continuing the ticket's existing thread.
        // Query is deferred until here so it's skipped when assignee has no email.
        const priorMessages = await prisma.ticketReply.findMany({
          where: { ticketId: t.id, messageId: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { messageId: true },
        });
        const refChain: string[] = [
          t.rootMessageId,
          ...priorMessages.map((r) => r.messageId as string),
        ].filter((id): id is string => !!id);

        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const threading = buildTicketHeaders({
          ticketId: t.id,
          inReplyTo: refChain.at(-1) ?? null,
          references: refChain,
        });
        detach(emailService
          .sendEmail({
            to: assignee.email,
            subject: buildTicketSubject(t.id, `[Нов отговор от заявител] ${t.subject}`),
            headers: threading.headers,
            html: `<p><strong>Здравей, ${esc(assignee.firstName || assignee.email)},</strong></p>
<p>Заявителят отговори на заявка, назначена на вас, чрез имейл.</p>
<table cellpadding="4">
  <tr><td><strong>От:</strong></td><td>${esc(fromEmail)}</td></tr>
  <tr><td><strong>Тема:</strong></td><td>${esc(t.subject)}</td></tr>
</table>
<p style="color:#999;font-size:12px;">Ticket ID: ${t.id}</p>`,
            text: `Здравей, ${assignee.firstName || assignee.email},\n\nЗаявителят отговори на заявка, назначена на вас.\n\nОт: ${fromEmail}\nТема: ${t.subject}\n\nTicket ID: ${t.id}`,
          }), (err) => logger.error('[ticketInbound] failed to notify assignee of inbound reply:', err));
      }
    } catch (err) {
      logger.error('[ticketInbound] failed to look up assignee for inbound reply notification:', err);
    }
  } else {
    // No assignee (or self-assigned) — alert ops so the reply isn't silently
    // missed. Mirrors the unassigned-reply fallback in adminHelp.routes.ts.
    detach(notificationService
      .notifyAdminOps({
        opsType: `help_ticket_inbound_unassigned_${t.id}`,
        title: 'Нов имейл отговор на заявка без отговорник',
        message: t.subject,
        severity: 'info',
        fields: [
          { label: 'От', value: fromEmail },
          { label: 'Ticket ID', value: t.id },
        ],
      }), () => {});
  }

  return { ticketId: t.id, replyId: reply.id, created: false };
}

/**
 * Spec §11.1 — auto-reply confirmation when an inbound email creates a new
 * ticket. Carries the same threading headers as any other system email so
 * the recipient's reply lands back on the same ticket. Also persists the
 * Message-ID on a new TicketReply so subsequent In-Reply-To matches resolve.
 */
async function sendInboundAutoReply(args: {
  ticketId: string;
  to: string;
  originalSubject: string;
  inReplyTo: string | null;
  audience: 'partner' | 'subscriber';
  /** BC-ADMIN-SPEC-REAUDIT-TICKET-SHORTREF-1: Actual persisted shortRef (if available) */
  shortRef?: string;
}): Promise<void> {
  const threading = buildTicketHeaders({
    ticketId: args.ticketId,
    inReplyTo: args.inReplyTo,
    references: args.inReplyTo ? [args.inReplyTo] : [],
  });
  const subject = buildTicketSubject(args.ticketId, `Re: ${args.originalSubject}`, args.shortRef);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;color:#111;font-size:16px;">Здравейте,</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          Получихме вашата заявка и тя е регистрирана с референция
          <strong style="font-family:monospace;">${subject.match(SUBJECT_REF_RE)?.[0] ?? ''}</strong>.
        </p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          Ще се свържем с вас възможно най-скоро. За да добавите информация
          по същата заявка, просто отговорете на този имейл — съобщението ще
          бъде прикачено автоматично.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:14px;line-height:1.6;">
          Ако имате нужда от незабавна помощ, напишете ни на
          <a href="mailto:support@boomcard.bg" style="color:#1f2937;">support@boomcard.bg</a>.
        </p>
        <p style="margin:24px 0 0;color:#999;font-size:13px;">— Екипът на BoomCard</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const ref = subject.match(SUBJECT_REF_RE)?.[0] ?? '';
  const text = `Здравейте,\n\nПолучихме вашата заявка и тя е регистрирана с референция ${ref}. За да добавите информация, просто отговорете на този имейл — съобщението ще бъде прикачено автоматично.\n\nСпешен случай: support@boomcard.bg\n\n— Екипът на BoomCard`;

  // Audit-pass [5.4]: persist the reply row FIRST. If we sent the email
  // before recording the Message-ID and the DB write failed, a user reply
  // (In-Reply-To: <our-mid>) would not resolve and would create a brand-new
  // ticket instead of threading to this one. Recording first ensures the
  // threading anchor exists even if the mailer subsequently fails (the
  // mailer failure is logged but doesn't poison threading).
  await prisma.ticketReply.create({
    data: {
      ticketId: args.ticketId,
      authorId: null,
      body: '[auto-reply confirmation sent]',
      isAdmin: true,
      messageId: threading.messageId,
      inReplyTo: args.inReplyTo,
      channel: 'EMAIL',
      isAutoReply: true,
    },
  });

  await emailService.sendEmail({
    to: args.to,
    subject,
    html,
    text,
    headers: threading.headers,
    // Plus-addressed Reply-To: threads the reply via To-header parsing (Priority 2.5)
    // even when X-BoomCard-Ticket-ID is stripped by forwarding chains.
    replyTo: buildPlusReplyTo(args.ticketId, args.audience),
  });
}
