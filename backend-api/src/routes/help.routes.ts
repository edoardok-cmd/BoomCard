import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders, buildPlusReplyTo, computeShortRef } from '../services/ticketEmail.service';
import { logger } from '../utils/logger';
import { getSystemSettingStr } from '../utils/systemSettings';
import { DisputeSubjectType } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// Spec §11.3 — valid requestTypes for subscribers (DISPUTE per §7.3 link)
const USER_REQUEST_TYPES = ['SUPPORT', 'DISPUTE', 'OTHER'] as const;

const submitTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  body: z.string().min(10).max(5000),
  category: z.enum(['CASHBACK', 'ACCOUNT', 'PAYMENT', 'TECHNICAL', 'OTHER']),
  // Bug fix §11.3: users may file DISPUTE type tickets (linked to §7.3 Спорове)
  requestType: z.enum(USER_REQUEST_TYPES).optional(),
});

/**
 * POST /api/help/ticket
 * Submit a support ticket from the mobile app.
 */
router.post(
  '/ticket',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parseResult = submitTicketSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
        errors: parseResult.error.issues,
      });
    }

    const { subject, body, category, requestType } = parseResult.data;
    const userId = req.user!.id;

    // Bug 1 fix: explicitly set status OPEN (spec §11.4 — initial status = "Отворена").
    // Without this the DB default NEW is used, which breaks admin queue counts and
    // filtering since NEW is a legacy-only status.
    const ticket = await prisma.helpTicket.create({
      data: {
        subject,
        body,
        category,
        userId,
        status: 'OPEN' as any,
        requestType: requestType ?? 'SUPPORT',
      },
      select: { id: true, subject: true, category: true, status: true, requestType: true, createdAt: true },
    });

    // Spec §11.6: auto-link to Dispute model when type=DISPUTE.
    if (ticket.requestType === 'DISPUTE') {
      prisma.dispute.create({
        data: {
          userId,
          ticketId: ticket.id,
          subjectType: DisputeSubjectType.RECEIPT, // default; admin updates as needed
        },
      }).catch((err) => logger.error('[help] failed to create linked Dispute for DISPUTE ticket:', err));
    }

    notificationService
      .notifyAdminOps({
        opsType: 'help_ticket_created',
        title: `New support ticket: ${category}`,
        message: subject,
        severity: 'info',
        fields: [
          { label: 'Category', value: category },
          { label: 'Type', value: requestType ?? 'SUPPORT' },
          { label: 'User', value: userId },
          { label: 'Ticket ID', value: ticket.id },
        ],
      })
      .catch((err) => logger.error('[help] Failed to notify admin of new ticket:', err));

    // Fire-and-forget: set rootMessageId + send confirmation email + persist reply row.
    // IMPORTANT: call buildTicketHeaders() once and use threading.messageId for
    // rootMessageId. Two separate newMessageId() calls produce different IDs,
    // which breaks Priority-2 In-Reply-To threading for any subsequent email reply.
    (async () => {
      try {
        const threading = buildTicketHeaders({ ticketId: ticket.id });
        await prisma.helpTicket.update({
          where: { id: ticket.id },
          data: { rootMessageId: threading.messageId, shortRef: computeShortRef(ticket.id) },
        });
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
        if (user?.email) {
          const emailSubject = buildTicketSubject(ticket.id, 'Вашата заявка е получена');
          const ref = emailSubject.match(/\[#[a-f0-9]+\]/i)?.[0] ?? '';
          // Persist the auto-reply row BEFORE sending — ensures the Message-ID is
          // anchored in the DB so an inbound In-Reply-To resolves via Priority-2
          // even if the mailer subsequently fails.
          await prisma.ticketReply.create({
            data: {
              ticketId: ticket.id,
              authorId: null,
              body: '[auto-reply confirmation sent]',
              isAdmin: true,
              messageId: threading.messageId,
              channel: 'EMAIL',
              isAutoReply: true,
            },
          });
          const supportEmail = await getSystemSettingStr('support_email', 'support@boomcard.bg');
          await emailService.sendEmail({
            to: user.email,
            subject: emailSubject,
            headers: threading.headers,
            replyTo: buildPlusReplyTo(ticket.id, 'subscriber'),
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><tr><td style="padding:28px"><p style="margin:0 0 16px;color:#111;font-size:16px">Здравейте${user.firstName ? ', ' + user.firstName : ''},</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Получихме вашата заявка и тя е регистрирана с референция <strong style="font-family:monospace">${ref}</strong>.</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Ще се свържем с вас възможно най-скоро. За допълнителна информация напишете ни на <a href="mailto:${supportEmail}">${supportEmail}</a>.</p><p style="margin:24px 0 0;color:#999;font-size:13px">— Екипът на BoomCard</p></td></tr></table></td></tr></table></body></html>`,
            text: `Здравейте${user.firstName ? ', ' + user.firstName : ''},\n\nПолучихме вашата заявка с референция ${ref}.\n\nЩе се свържем с вас възможно най-скоро.\n\nПри нужда: ${supportEmail}\n\n— Екипът на BoomCard`,
          });
        }
      } catch (err) {
        logger.error('[help] failed to send ticket confirmation email:', err);
      }
    })();

    return res.status(201).json({ success: true, data: ticket });
  })
);

/**
 * GET /api/help/tickets
 * List the current user's own tickets with pagination.
 * Gap 7 fix: was hardcoded take:20 with no pagination params.
 */
router.get(
  '/tickets',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page as string) || '1') || 1);
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '20') || 20));
    const skip = (page - 1) * limit;

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({
        where: { userId: req.user!.id },
        select: {
          id: true, subject: true, category: true, status: true,
          requestType: true, createdAt: true, updatedAt: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.helpTicket.count({ where: { userId: req.user!.id } }),
    ]);

    return res.json({ success: true, data: { tickets, total, page, limit } });
  })
);

/**
 * GET /api/help/tickets/:id
 * View full detail of a single ticket (Bug 3 fix — was missing entirely).
 */
router.get(
  '/tickets/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const ticket = await prisma.helpTicket.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: {
        id: true, subject: true, body: true, category: true,
        status: true, priority: true, requestType: true, source: true,
        reopenedAt: true, resolvedAt: true, createdAt: true, updatedAt: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!ticket) {
      return res.status(404).json({ error: 'Заявката не е намерена или нямате достъп' });
    }
    return res.json({ success: true, data: ticket });
  })
);

/**
 * GET /api/help/tickets/:id/replies
 * List replies for a user's own ticket (Bug 3 fix — was missing entirely).
 */
router.get(
  '/tickets/:id/replies',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const ticket = await prisma.helpTicket.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      select: { id: true },
    });
    if (!ticket) {
      return res.status(404).json({ error: 'Заявката не е намерена или нямате достъп' });
    }

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId: req.params.id, isAutoReply: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, body: true, isAdmin: true, createdAt: true,
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return res.json({ success: true, data: replies });
  })
);

/**
 * POST /api/help/tickets/:id/reply
 * User sends a follow-up message on their own ticket (Bug 3 fix — was missing entirely).
 * Mirrors partnerHelp reply behaviour: WAITING/RESOLVED → OPEN, notify assignee.
 */
router.post(
  '/tickets/:id/reply',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { body } = req.body as { body?: string };
    if (!body?.trim() || body.trim().length < 10) {
      return res.status(400).json({ error: 'Съобщението е задължително (минимум 10 символа)' });
    }
    if (body.trim().length > 5000) {
      return res.status(400).json({ error: 'Съобщението е твърде дълго (максимум 5000 символа)' });
    }

    const ticket = await prisma.helpTicket.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { assignee: { select: { email: true, firstName: true } } },
    });
    if (!ticket) {
      return res.status(404).json({ error: 'Заявката не е намерена или нямате достъп' });
    }
    if (ticket.status === 'CLOSED' || ticket.status === 'REJECTED') {
      return res.status(400).json({ error: 'Не може да се отговаря на заявка в крайно състояние' });
    }

    // Build threading headers BEFORE creating the reply row so the messageId is
    // both persisted on TicketReply and sent in the outbound notification email.
    // This anchors Priority-2 In-Reply-To lookup when the assignee replies to
    // the notification email — mirrors the pattern used by the admin reply handler.
    const priorMessages = await prisma.ticketReply.findMany({
      where: { ticketId: ticket.id, messageId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { messageId: true },
    });
    const refChain: string[] = [
      ticket.rootMessageId,
      ...priorMessages.map((r: { messageId: string | null }) => r.messageId as string),
    ].filter((id): id is string => !!id);
    const threading = buildTicketHeaders({
      ticketId: ticket.id,
      inReplyTo: refChain.at(-1) ?? null,
      references: refChain,
    });

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.id,
        body: body.trim(),
        isAdmin: false,
        messageId: threading.messageId,
        inReplyTo: refChain.at(-1) ?? null,
        channel: 'WEB',
      },
      select: { id: true, body: true, isAdmin: true, createdAt: true },
    });

    // Reopen ticket when user replies on WAITING or RESOLVED.
    // Stamp reopenedAt so the audit trail shows WEB-channel reopens, not just
    // email-inbound ones (parity with ticketInbound.service.ts:516).
    if (ticket.status === 'WAITING' || ticket.status === 'RESOLVED') {
      await prisma.helpTicket.update({
        where: { id: ticket.id },
        data: { status: 'OPEN' as any, resolvedAt: null, reopenedAt: new Date() },
      });
    }

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const replyBodyText = body.trim();
    const replyHeaders = threading.headers;

    if (ticket.assignee?.email) {
      emailService
        .sendEmail({
          to: ticket.assignee.email,
          subject: buildTicketSubject(ticket.id, `[Отговор от потребител] ${ticket.subject}`),
          headers: replyHeaders,
          html: `<p>Потребителят изпрати отговор на заявка, назначена на вас.</p>
<hr/>
<p>${esc(replyBodyText).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id}</p>`,
          text: `Потребителят изпрати отговор на заявка, назначена на вас.\n\n${replyBodyText}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[help] failed to notify assignee of user reply:', err));
    } else {
      // Unassigned — alert support inbox so the reply isn't silently missed.
      getSystemSettingStr('support_email', 'support@boomcard.bg')
        .then((supportEmail) =>
          emailService.sendEmail({
            to: supportEmail,
            subject: buildTicketSubject(ticket.id, `[Потребителски отговор без отговорник] ${ticket.subject}`),
            headers: replyHeaders,
            html: `<p>Потребител изпрати отговор на заявка без назначен отговорник.</p>
<hr/>
<p>${esc(replyBodyText).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id}</p>`,
            text: `Потребител изпрати отговор на заявка без назначен отговорник.\n\n${replyBodyText}\n\nTicket ID: ${ticket.id}`,
          })
        )
        .catch((err) => logger.error('[help] failed to alert support of unassigned user reply:', err));
    }

    return res.status(201).json({ success: true, data: reply });
  })
);

export default router;
