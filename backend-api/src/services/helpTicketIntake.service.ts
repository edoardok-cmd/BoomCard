/**
 * Help Ticket intake service — web form → Help Request creation (Spec §3.8 / §1.7).
 *
 * Takes a contact form submission and creates a unified Help Ticket, replacing
 * the prior one-shot email-only flow with proper ticketing + auto-reply.
 *
 * Spec: "Website form → Creates a unified Help Request" (§3.8).
 * "Form submissions create Partner Applications only when submitted via the
 * partner onboarding form. All other inbound forms and emails create Help Requests." (§1.7)
 *
 * This module delegates to helper functions in ticketInbound.service.ts but
 * does NOT modify that service. The inbound-email path remains unchanged.
 */

import { TicketStatus, TicketCategory, TicketPriority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { writeAudit } from '../middleware/audit.middleware';
import { emailService } from './email.service';
import { buildTicketSubject, buildTicketHeaders, buildPlusReplyTo, computeShortRef, computeShortRefOfLength } from './ticketEmail.service';
import { SUBJECT_REF_RE } from './ticketInbound.service';
import { inferRequestType } from './ticketInbound.service';
import { detach } from '../utils/detach';
import { notificationService } from './notification.service';

export interface HelpTicketIntakeArgs {
  /** Submitter's name (for audit trail) */
  name: string;
  /** Submitter's email address */
  externalEmail: string;
  /** Form subject line */
  subject: string;
  /** Form message body */
  body: string;
  /** Source identifier (default: 'WEB' for web form submissions) */
  source?: string;
  /** Form submission language (determines auto-reply template language) */
  language?: 'bg' | 'en';
}

/**
 * Resolve a "system" userId to own web-form tickets when no specific owner is assigned.
 * Mirrors the same pattern used in ticketInbound.service.ts.
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
 * BC-ADMIN-SPEC-REAUDIT5-SHORTREF-RETRY-1: Persist shortRef with collision handling.
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
        logger.info(`[helpTicketIntake] shortRef collision resolved on attempt ${attempt}: ${shortRef}`);
      }
      return shortRef;
    } catch (err) {
      const isUniqueViolation = (err as any)?.code === 'P2002';
      if (!isUniqueViolation || attempt === MAX_ATTEMPTS) {
        // Final attempt or non-collision error — escalate to ops.
        logger.error(
          `[helpTicketIntake] shortRef update failed for ticket ${ticketId} after ${attempt} attempt(s):`,
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
          logger.error('[helpTicketIntake] failed to notify ops of shortRef collision:', opsErr);
        }
        return null;
      }
      // Collision on non-final attempt — retry with longer ref
      logger.debug(`[helpTicketIntake] shortRef collision on attempt ${attempt}, retrying with longer ref`);
    }
  }
  return null;
}

/**
 * Send an auto-reply to the web form submitter, confirming receipt and providing
 * a ticket reference for future correspondence.
 *
 * Mirrors the sendInboundAutoReply pattern from ticketInbound.service but adapted
 * for web form submissions (no inReplyTo header, source='WEB').
 *
 * @param args.shortRef — the persisted shortRef from HelpTicket.shortRef
 */
async function sendWebFormAutoReply(args: {
  ticketId: string;
  to: string;
  originalSubject: string;
  language?: 'bg' | 'en';
  shortRef?: string;
}): Promise<void> {
  const threading = buildTicketHeaders({
    ticketId: args.ticketId,
    inReplyTo: null,
    references: [],
  });
  const subject = buildTicketSubject(args.ticketId, `Re: ${args.originalSubject}`, args.shortRef);
  const ref = subject.match(SUBJECT_REF_RE)?.[0] ?? '';

  const isBg = args.language === 'bg';

  let html: string;
  let text: string;

  if (isBg) {
    html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;color:#111;font-size:16px;">Здравейте,</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          Получихме вашата заявка и тя е регистрирана с референция
          <strong style="font-family:monospace;">${ref}</strong>.
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
    text = `Здравейте,\n\nПолучихме вашата заявка и тя е регистрирана с референция ${ref}. За да добавите информация, просто отговорете на този имейл — съобщението ще бъде прикачено автоматично.\n\nСпешен случай: support@boomcard.bg\n\n— Екипът на BoomCard`;
  } else {
    html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;color:#111;font-size:16px;">Hello,</p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          We've received your request and registered it with reference
          <strong style="font-family:monospace;">${ref}</strong>.
        </p>
        <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
          We'll be in touch as soon as possible. To add information to your request,
          simply reply to this email — your message will be attached automatically.
        </p>
        <p style="margin:0 0 16px;color:#666;font-size:14px;line-height:1.6;">
          If you need immediate assistance, please contact us at
          <a href="mailto:support@boomcard.bg" style="color:#1f2937;">support@boomcard.bg</a>.
        </p>
        <p style="margin:24px 0 0;color:#999;font-size:13px;">— The BoomCard Team</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    text = `Hello,\n\nWe've received your request and registered it with reference ${ref}. To add information to your request, simply reply to this email — your message will be attached automatically.\n\nUrgent matter: support@boomcard.bg\n\n— The BoomCard Team`;
  }

  // Persist the reply row FIRST (before sending email) so threading anchor exists
  // even if mailer fails. Mirror the pattern from ticketInbound.service.ts.
  await prisma.ticketReply.create({
    data: {
      ticketId: args.ticketId,
      authorId: null,
      body: '[auto-reply confirmation sent]',
      isAdmin: true,
      messageId: threading.messageId,
      inReplyTo: null,
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
    // Web forms are treated as 'subscriber' audience (safe default for unidentified sources).
    // If partner-specific forms are added in the future, this should become configurable.
    replyTo: buildPlusReplyTo(args.ticketId, 'subscriber'),
  });
}

/**
 * Main entry point: create a Help Ticket from a web form submission.
 *
 * Returns the created ticket ID. Fires auto-reply asynchronously (detached).
 */
export async function createHelpTicketFromInbound(
  args: HelpTicketIntakeArgs,
): Promise<{ ticketId: string }> {
  const normalizedEmail = args.externalEmail.toLowerCase();
  const source = args.source || 'WEB';

  // Resolve ticket owner: try to find a user by email, fall back to system admin
  const owner = await prisma.user.findFirst({ where: { email: normalizedEmail } });
  const ownerId = owner?.id ?? (await getSystemOwnerId());

  if (!ownerId) {
    logger.error(
      `[helpTicketIntake] no admin available to own web form submission from ${normalizedEmail}; persisting to OrphanInboundEmail`
    );
    // Fallback: persist as an orphan for manual replay
    try {
      await prisma.orphanInboundEmail.create({
        data: {
          fromEmail: normalizedEmail,
          fromName: args.name || null,
          subject: args.subject || null,
          bodyText: args.body || null,
          bodyHtml: null,
          messageId: null,
          rawPayload: { source, name: args.name },
          reason: 'NO_ADMIN',
        },
      });
    } catch (err) {
      logger.error('[helpTicketIntake] failed to persist orphan web form submission:', err);
    }
    throw new Error('Failed to create help ticket: no available admin');
  }

  // Create the Help Ticket
  const ticket = await prisma.helpTicket.create({
    data: {
      subject: args.subject || '(no subject)',
      body: args.body || '',
      category: TicketCategory.OTHER,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      userId: ownerId,
      source,
      externalEmail: normalizedEmail,
      rootMessageId: null,
      // Infer request type from subject + body (Spec §1.7 requirement)
      requestType: inferRequestType({
        subject: args.subject,
        text: args.body,
        html: undefined,
        to: '', // not applicable for web forms
      }),
    },
  });

  // Backfill shortRef (Gap 8 fix from ticketInbound.service.ts)
  // BC-ADMIN-SPEC-REAUDIT5-SHORTREF-RETRY-1: Retry with progressively longer refs on
  // collision, escalate to ops if all attempts fail.
  const persistedShortRef = await persistShortRefWithCollisionRetry(ticket.id);

  // CRITICAL: If all shortRef retry attempts fail, delete the ticket and return error.
  // Creating a ticket without shortRef breaks subject-prefix threading and causes
  // duplicates on subsequent inbound emails from the same sender.
  if (!persistedShortRef) {
    logger.error(
      `[helpTicketIntake] shortRef persistence failed for ticket ${ticket.id}; deleting orphan ticket`
    );
    await prisma.helpTicket.delete({ where: { id: ticket.id } }).catch(() => {});
    throw new Error(
      `Help ticket created but shortRef persistence failed after all retry attempts. Ticket creation rolled back.`
    );
  }

  // BC-ADMIN-SPEC-REAUDIT5-SHORTREF-RETRY-1: Defer audit until AFTER shortRef is
  // persisted. This ensures that if shortRef persistence fails and the ticket is
  // deleted (above), we do not create orphaned audit records. The caller (contact.routes)
  // will verify that shortRef is present before using it in downstream operations
  // (email notifications, etc.), ensuring consistency across all audit records and
  // ticket references (Acceptance Criteria #2 & #3).
  // Audit the ticket creation
  await writeAudit({
    actorUserId: null,
    action: 'TICKET_WEB_FORM_CREATED',
    objectType: 'HelpTicket',
    objectId: ticket.id,
    after: { from: normalizedEmail, source, name: args.name },
  }).catch(() => {});

  // Fire async auto-reply (don't block on this)
  // BC-ADMIN-SPEC-REAUDIT5-SHORTREF-RETRY-1: Pass the persisted shortRef to the auto-reply
  // so the subject uses the actual ref (may be longer than 8 chars on collision resolution).
  detach(
    sendWebFormAutoReply({
      ticketId: ticket.id,
      to: normalizedEmail,
      originalSubject: args.subject || '(no subject)',
      language: args.language,
      shortRef: persistedShortRef ?? undefined,
    }),
    (err) => logger.error(`[helpTicketIntake] failed to send auto-reply for ${ticket.id}:`, err)
  );

  logger.info(`[helpTicketIntake] created ticket ${ticket.id} from web form (${normalizedEmail})`);

  return { ticketId: ticket.id };
}
