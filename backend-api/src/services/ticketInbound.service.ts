/**
 * Inbound email-to-ticket service — Spec §11.2 v1.1.
 *
 * Takes a normalized inbound email payload and threads it into the ticket
 * system using the priority ladder defined in §11.2:
 *
 *   1. X-BoomCard-Ticket-ID custom header
 *   2. In-Reply-To / References → TicketReply.messageId
 *   3. Subject `[#XXXXXXXX]` reference
 *   4. Fallback: create a new HelpTicket (source=EMAIL)
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

import { TicketStatus, TicketCategory, TicketPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { writeAudit } from '../middleware/audit.middleware';
import { emailService } from './email.service';
import { buildTicketSubject, buildTicketHeaders, buildPlusReplyTo, computeShortRef } from './ticketEmail.service';
import { notificationService } from './notification.service';

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
  /** Our custom header, when the email is a reply to a system-sent message */
  xBoomCardTicketId?: string;
  /** RFC 3834 Auto-Submitted ("auto-replied" → out-of-office) */
  autoSubmitted?: string;
}

const SUBJECT_REF_RE = /\[#([a-f0-9]{6,32})\]/i;
const BOUNCE_SUBJECT_RE = /delivery (status|failure)|undeliverable|mailer[- ]daemon/i;

/** Extract a bare lowercase email from a "Name <addr>" or plain `addr` value. */
function normalizeAddress(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/** Detect bounce / DSN messages by subject or sender heuristics. */
function isBounce(payload: InboundEmailPayload): boolean {
  if (BOUNCE_SUBJECT_RE.test(payload.subject || '')) return true;
  const from = normalizeAddress(payload.from);
  if (from.includes('mailer-daemon') || from.startsWith('postmaster@')) return true;
  return false;
}

/**
 * Spec §11.2 priority ladder. Returns the matched HelpTicket (if any) and
 * how it was matched (for audit logging).
 */
async function resolveTicket(payload: InboundEmailPayload): Promise<{
  ticket: Awaited<ReturnType<typeof prisma.helpTicket.findUnique>> | null;
  matchedBy: 'header' | 'in-reply-to' | 'plus-address' | 'subject-prefix' | null;
}> {
  // Priority 1: X-BoomCard-Ticket-ID
  if (payload.xBoomCardTicketId) {
    const t = await prisma.helpTicket.findUnique({
      where: { id: payload.xBoomCardTicketId },
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

  // Priority 2.5: plus-addressing in the To header.
  // When the system sends an outbound ticket email it sets Reply-To to
  // support+<shortRef>@boomcard.bg (or office+...). If the recipient replies,
  // their mail client's To field contains that plus-address. We extract the
  // shortRef from the local-part and resolve the ticket via the indexed column.
  // This path survives forwarding chains that strip custom headers.
  if (payload.to) {
    const plusMatch = /[^@+\s]+\+([a-f0-9]{6,32})@/i.exec(payload.to);
    if (plusMatch) {
      const ref = plusMatch[1].toLowerCase();
      if (ref.length <= 8) {
        const t = await prisma.helpTicket.findUnique({ where: { shortRef: ref } });
        if (t) return { ticket: t, matchedBy: 'plus-address' };
      }
    }
  }

  // Priority 3: subject [#XXXXXXXX] prefix — match either full UUID or
  // 8-char short form via the indexed shortRef column (Gap 8 fix).
  const m = payload.subject?.match(SUBJECT_REF_RE);
  if (m) {
    const ref = m[1].toLowerCase();
    // Try exact UUID lookup first (full 32-char hex or hyphenated form).
    if (ref.length === 32 || ref.includes('-')) {
      const t = await prisma.helpTicket.findUnique({ where: { id: ref } });
      if (t) return { ticket: t, matchedBy: 'subject-prefix' };
    }
    // Short-ref O(1) indexed lookup — replaces the previous 200-ticket in-memory
    // scan. Tickets created before this column was added have shortRef=null and
    // will fall through to the fallback below.
    if (ref.length <= 8) {
      const t = await prisma.helpTicket.findUnique({ where: { shortRef: ref } });
      if (t) return { ticket: t, matchedBy: 'subject-prefix' };
    }
    // Graceful fallback for legacy tickets without shortRef: scan the most recent
    // 500 tickets. This window is intentionally larger than the old 200-ticket cap
    // and shrinks naturally as the shortRef column is populated by new tickets.
    const recent = await prisma.helpTicket.findMany({
      where: { shortRef: null },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const hit = recent.find((t) => t.id.replace(/-/g, '').toLowerCase().startsWith(ref));
    if (hit) {
      const t = await prisma.helpTicket.findUnique({ where: { id: hit.id } });
      if (t) return { ticket: t, matchedBy: 'subject-prefix' };
    }
  }

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
 * Heuristic mapping of the destination mailbox to a default `requestType`.
 * Both support@ and office@ inbounds are support requests — the distinction
 * between "User support" and "Partner support" queues (§11.6) is determined
 * by the ticket owner's role, not by the destination address. The admin can
 * re-classify to DATA_CHANGE / CONTRACT_CHANGE etc. once they've read the email.
 */
function inferRequestType(_toAddress: string): string {
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
        // full-UUID → shortRef O(1) index → legacy linear scan for null-shortRef rows.
        if (ref.length === 32 || ref.includes('-')) {
          const t = await prisma.helpTicket.findUnique({ where: { id: ref }, select: { id: true } });
          relatedTicketId = t?.id ?? null;
        }
        if (!relatedTicketId && ref.length <= 8) {
          const t = await prisma.helpTicket.findUnique({ where: { shortRef: ref }, select: { id: true } });
          relatedTicketId = t?.id ?? null;
        }
        if (!relatedTicketId) {
          // Graceful fallback for legacy tickets predating the shortRef column.
          const recent = await prisma.helpTicket.findMany({
            where: { shortRef: null },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
          });
          const hit = recent.find((t) => t.id.replace(/-/g, '').toLowerCase().startsWith(ref));
          relatedTicketId = hit?.id ?? null;
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
          notificationService
            .notifyAdminOps({
              opsType: `bounce_alert_${relatedTicketId ?? normalizeAddress(payload.from)}`,
              title: 'Многократни bounce-и',
              message: `${bounceCount} bounce-а${relatedTicketId ? ` за заявка ${relatedTicketId.slice(0, 8)}` : ` от ${normalizeAddress(payload.from)}`} за последните 30 дни`,
              severity: 'warning',
              fields: [
                { label: 'Адрес', value: normalizeAddress(payload.from) },
                ...(relatedTicketId ? [{ label: 'Ticket ID', value: relatedTicketId }] : []),
              ],
            })
            .catch(() => {});
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
      requestType: inferRequestType(payload.to || ''),
    };
    const ticket = await prisma.helpTicket.create({ data: newTicketData });
    // Gap 8: backfill shortRef immediately after creation (computed from the UUID
    // assigned by Postgres). create() doesn't know the id ahead of time.
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { shortRef: computeShortRef(ticket.id) },
    }).catch(() => {});

    await writeAudit({
      actorUserId: null,
      action: 'TICKET_INBOUND_CREATED',
      objectType: 'HelpTicket',
      objectId: ticket.id,
      after: { from: fromEmail, to: payload.to, messageId: payload.messageId },
    }).catch(() => {});

    // Spec §11.1 — auto-reply to the sender with the ticket reference so
    // subsequent replies thread back via [#XXXXXXXX] / X-BoomCard-Ticket-ID.
    // Fire-and-forget: a mailer failure must not block ticket creation.
    sendInboundAutoReply({
      ticketId: ticket.id,
      to: fromEmail,
      originalSubject: cleanedSubject,
      inReplyTo: payload.messageId || null,
      audience: payload.to?.includes('office@') ? 'partner' : 'subscriber',
    }).catch((err) =>
      logger.error(`[ticketInbound] failed to send auto-reply for ${ticket.id}:`, err),
    );

    // Gap 9 fix: §11.6 routing — email tickets default to SUPPORT; admin can
    // reclassify. Surface the destination mailbox so the admin can see which
    // channel it arrived on (support@ vs. office@).
    const emailReqType = inferRequestType(payload.to || '');
    const emailQueue = payload.to?.includes('office@') ? 'Partner support' : 'User support';
    notificationService
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
      })
      .catch((err) => logger.warn('[ticketInbound] failed to notify admin ops of email ticket:', err));

    return { ticketId: ticket.id, created: true };
  }

  // ── Matched an existing ticket ────────────────────────────────────────
  const t = resolved.ticket;

  // Spoof protection (§11.2): sender must be the ticket owner, the assigned
  // admin, the captured externalEmail, or any prior reply's externalFrom.
  // Spec: "owner OR assignee OR cc-нати админи". Anyone else → create a
  // linked ticket so we never inject into someone else's conversation.
  const [ownerRecord, assigneeRecord, priorExternal] = await Promise.all([
    prisma.user.findUnique({ where: { id: t.userId }, select: { email: true } }),
    t.assigneeId
      ? prisma.user.findUnique({ where: { id: t.assigneeId }, select: { email: true } })
      : Promise.resolve(null),
    prisma.ticketReply.findMany({
      where: { ticketId: t.id, externalFrom: { not: null } },
      select: { externalFrom: true },
    }),
  ]);
  const allowed = new Set<string>(
    [
      ownerRecord?.email,
      assigneeRecord?.email,
      t.externalEmail,
      ...priorExternal.map((r) => r.externalFrom),
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
        requestType: inferRequestType(payload.to || ''),
        linkedTicketId: t.id,
      },
    });
    // Gap 8: populate shortRef for the spoof-linked ticket.
    await prisma.helpTicket.update({
      where: { id: linked.id },
      data: { shortRef: computeShortRef(linked.id) },
    }).catch(() => {});
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
    sendInboundAutoReply({
      ticketId: linked.id,
      to: fromEmail,
      originalSubject:
        (payload.subject || '').replace(SUBJECT_REF_RE, '').trim() || `(re: ${t.subject})`,
      inReplyTo: payload.messageId || null,
      audience: payload.to?.includes('office@') ? 'partner' : 'subscriber',
    }).catch((err) =>
      logger.error(`[ticketInbound] failed to send spoof-branch auto-reply for ${linked.id}:`, err),
    );

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

  // Reopen-on-reply (§11.4 + §11.2 edge cases): a CLOSED or RESOLVED ticket
  // transitions back to OPEN when the customer replies via email.
  // RESOLVED is included for symmetry with the WEB-channel handlers in
  // adminHelp.routes.ts and partnerHelp.routes.ts (both handle RESOLVED→OPEN).
  // resolvedAt is cleared so the auto-close job doesn't immediately re-fire.
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
        emailService
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
          })
          .catch((err) => logger.error('[ticketInbound] failed to notify assignee of inbound reply:', err));
      }
    } catch (err) {
      logger.error('[ticketInbound] failed to look up assignee for inbound reply notification:', err);
    }
  } else {
    // No assignee (or self-assigned) — alert ops so the reply isn't silently
    // missed. Mirrors the unassigned-reply fallback in adminHelp.routes.ts.
    notificationService
      .notifyAdminOps({
        opsType: `help_ticket_inbound_unassigned_${t.id}`,
        title: 'Нов имейл отговор на заявка без отговорник',
        message: t.subject,
        severity: 'info',
        fields: [
          { label: 'От', value: fromEmail },
          { label: 'Ticket ID', value: t.id },
        ],
      })
      .catch(() => {});
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
}): Promise<void> {
  const threading = buildTicketHeaders({
    ticketId: args.ticketId,
    inReplyTo: args.inReplyTo,
    references: args.inReplyTo ? [args.inReplyTo] : [],
  });
  const subject = buildTicketSubject(args.ticketId, `Re: ${args.originalSubject}`);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;color:#111;font-size:16px;">Здравейте,</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          Получихме вашата заявка и тя е регистрирана с референция
          <strong style="font-family:monospace;">${subject.match(/\[#[a-f0-9]+\]/i)?.[0] ?? ''}</strong>.
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
  const ref = subject.match(/\[#[a-f0-9]+\]/i)?.[0] ?? '';
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
