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
import { buildTicketSubject, buildTicketHeaders } from './ticketEmail.service';

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
  matchedBy: 'header' | 'in-reply-to' | 'subject-prefix' | null;
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

  // Priority 3: subject [#XXXXXXXX] prefix — match either full UUID or
  // first-8-hex-chars short form.
  const m = payload.subject?.match(SUBJECT_REF_RE);
  if (m) {
    const ref = m[1].toLowerCase();
    // Try exact UUID lookup first.
    if (ref.length === 32 || ref.includes('-')) {
      const t = await prisma.helpTicket.findUnique({ where: { id: ref } });
      if (t) return { ticket: t, matchedBy: 'subject-prefix' };
    }
    // Short-ref scan: last 200 tickets is a safe O(N) ceiling. A future
    // optimisation would denormalize the short ref to its own column.
    const recent = await prisma.helpTicket.findMany({
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
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
 * `office@boomcard.bg` is primarily used for partner/data-change traffic;
 * everything else defaults to SUPPORT. Admin can re-classify in the UI.
 */
function inferRequestType(toAddress: string): string {
  return toAddress.toLowerCase().includes('office') ? 'OTHER' : 'SUPPORT';
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
  // Bounce / DSN: never create a ticket, never reply. Just log.
  if (isBounce(payload)) {
    logger.warn(
      `[ticketInbound] bounce/DSN detected from=${payload.from} subject="${payload.subject}" — dropped`
    );
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

    const ticket = await prisma.helpTicket.create({
      data: {
        subject: cleanedSubject,
        // Prefer plain text; strip HTML if that's all we got. Simple and
        // adequate for MVP.
        body: payload.text || (payload.html ? payload.html.replace(/<[^>]+>/g, '') : ''),
        category: TicketCategory.OTHER,
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.NEW,
        userId: ownerId,
        source: 'EMAIL',
        externalEmail: fromEmail,
        rootMessageId: payload.messageId || null,
        requestType: inferRequestType(payload.to || ''),
      },
    });

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
    }).catch((err) =>
      logger.error(`[ticketInbound] failed to send auto-reply for ${ticket.id}:`, err),
    );

    return { ticketId: ticket.id, created: true };
  }

  // ── Matched an existing ticket ────────────────────────────────────────
  const t = resolved.ticket;

  // Spoof protection (§11.2): sender must be the ticket owner, the captured
  // externalEmail, or any prior reply's externalFrom. Anyone else → create a
  // NEW linked ticket so we never inject into someone else's conversation.
  const ownerRecord = await prisma.user.findUnique({
    where: { id: t.userId },
    select: { email: true },
  });
  const priorExternal = await prisma.ticketReply.findMany({
    where: { ticketId: t.id, externalFrom: { not: null } },
    select: { externalFrom: true },
  });
  const allowed = new Set<string>(
    [
      ownerRecord?.email,
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
    const linked = await prisma.helpTicket.create({
      data: {
        subject:
          (payload.subject || '').replace(SUBJECT_REF_RE, '').trim() ||
          `(re: ${t.subject})`,
        body: payload.text || '',
        category: TicketCategory.OTHER,
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.NEW,
        userId: t.userId,
        source: 'EMAIL',
        externalEmail: fromEmail,
        rootMessageId: payload.messageId || null,
        requestType: inferRequestType(payload.to || ''),
        linkedTicketId: t.id,
      },
    });
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

  // Reopen-on-reply (§11.4): a CLOSED ticket transitions back to OPEN when
  // the customer replies, with a reopenedAt watermark for audit.
  if (t.status === TicketStatus.CLOSED) {
    await prisma.helpTicket.update({
      where: { id: t.id },
      data: { status: TicketStatus.OPEN, reopenedAt: new Date() },
    });
    await writeAudit({
      actorUserId: null,
      action: 'TICKET_REOPENED_VIA_EMAIL',
      objectType: 'HelpTicket',
      objectId: t.id,
      after: { replyId: reply.id, from: fromEmail },
    }).catch(() => {});
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
}): Promise<void> {
  const threading = buildTicketHeaders({
    ticketId: args.ticketId,
    inReplyTo: args.inReplyTo,
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
  const text =
    `Здравейте,\n\n` +
    `Получихме вашата заявка и тя е регистрирана. ` +
    `За да добавите информация, просто отговорете на този имейл — съобщението ще бъде прикачено автоматично.\n\n` +
    `Спешен случай: support@boomcard.bg\n\n` +
    `— Екипът на BoomCard`;

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
  });
}
