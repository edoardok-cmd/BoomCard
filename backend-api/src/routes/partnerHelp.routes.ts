import { Router } from 'express';
import { TicketCategory, TicketPriority, DisputeSubjectType } from '@prisma/client';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders, buildPlusReplyTo, computeShortRef } from '../services/ticketEmail.service';
import { getSystemSettingStr } from '../utils/systemSettings';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'));

// Spec §11.3: all types a partner may submit, including DISPUTE (§7.3).
const VALID_REQUEST_TYPES = ['SUPPORT', 'DATA_CHANGE', 'LOCATION_CHANGE', 'CONTRACT_CHANGE', 'DISPUTE', 'OTHER'];

// POST /api/partner/help/ticket — partner creates a help ticket
router.post('/ticket', asyncHandler(async (req: AuthRequest, res) => {
  const { subject, body, category, requestType, priority } = req.body as {
    subject?: string; body?: string; category?: string; requestType?: string; priority?: string;
  };

  if (!subject?.trim() || subject.trim().length < 5) {
    return res.status(400).json({ error: 'Темата е задължителна (минимум 5 символа)' });
  }
  if (subject.trim().length > 200) {
    return res.status(400).json({ error: 'Темата е твърде дълга (максимум 200 символа)' });
  }
  if (!body?.trim() || body.trim().length < 10) {
    return res.status(400).json({ error: 'Съобщението е задължително (минимум 10 символа)' });
  }
  if (body.trim().length > 5000) {
    return res.status(400).json({ error: 'Съобщението е твърде дълго (максимум 5000 символа)' });
  }
  if (!category || !Object.values(TicketCategory).includes(category as TicketCategory)) {
    return res.status(400).json({ error: 'Невалидна категория' });
  }
  if (requestType && !VALID_REQUEST_TYPES.includes(requestType)) {
    return res.status(400).json({ error: 'Невалиден тип заявка' });
  }

  const resolvedPriority: TicketPriority =
    priority && Object.values(TicketPriority).includes(priority as TicketPriority)
      ? (priority as TicketPriority)
      : 'MEDIUM';

  const ticket = await prisma.helpTicket.create({
    data: {
      subject: subject.trim(),
      body: body.trim(),
      category: category as TicketCategory,
      priority: resolvedPriority,
      status: 'OPEN',
      source: 'WEB',
      requestType: VALID_REQUEST_TYPES.includes(requestType ?? '') ? requestType! : 'SUPPORT',
      userId: req.user!.id,
    },
    select: { id: true, subject: true, category: true, priority: true, status: true, requestType: true, createdAt: true },
  });

  // Spec §11.6: "Спор → автоматична връзка със §7.3 Спорове." When the partner
  // files a DISPUTE-type ticket, create a linked Dispute record immediately so
  // the admin sees it in the Disputes queue without a manual linking step. The
  // admin fills in receipt/payout details once they've reviewed the ticket.
  if (ticket.requestType === 'DISPUTE') {
    prisma.dispute.create({
      data: {
        userId: req.user!.id,
        ticketId: ticket.id,
        subjectType: DisputeSubjectType.RECEIPT, // default; admin updates as needed
      },
    }).catch((err) => logger.error('[partnerHelp] failed to create linked Dispute for DISPUTE ticket:', err));
  }

  // §11.6 per-type routing notifications.
  // CONTRACT_CHANGE → escalate to SUPER_ADMIN with warning severity.
  // DISPUTE → flag in ops notification with §7.3 link reference.
  // DATA_CHANGE / LOCATION_CHANGE → route to "Partner changes" queue.
  const resolvedType = ticket.requestType ?? 'SUPPORT';
  const routingSeverity: 'info' | 'warning' =
    resolvedType === 'CONTRACT_CHANGE' || resolvedType === 'DISPUTE' ? 'warning' : 'info';
  const routingQueue =
    resolvedType === 'CONTRACT_CHANGE' ? 'Contract changes (→ SUPER_ADMIN)' :
    resolvedType === 'DISPUTE'         ? 'Disputes (→ §7.3 Спорове)' :
    resolvedType === 'DATA_CHANGE' || resolvedType === 'LOCATION_CHANGE'
                                       ? 'Partner changes' :
    resolvedType === 'SUPPORT'         ? 'Partner support' : 'General';

  notificationService
    .notifyAdminOps({
      opsType: `partner_help_ticket_${ticket.id}`,
      title: `Партньорска заявка [${resolvedType}]: ${routingQueue}`,
      message: subject.trim(),
      severity: routingSeverity,
      fields: [
        { label: 'Тип', value: resolvedType },
        { label: 'Опашка', value: routingQueue },
        { label: 'Партньор', value: req.user!.email },
        { label: 'Ticket ID', value: ticket.id },
      ],
    })
    .catch((err) => logger.error('[partnerHelp] failed to notify admin ops:', err));

  // CONTRACT_CHANGE: additionally email the office inbox (spec §11.6).
  if (resolvedType === 'CONTRACT_CHANGE') {
    getSystemSettingStr('office_email', 'office@boomcard.bg')
      .then((superAdminEmail) =>
        emailService.sendEmail({
          to: superAdminEmail,
          subject: `[Договорна промяна] ${subject.trim()}`,
          html: `<p><strong>Нова заявка за промяна на договорни параметри</strong></p>
<table cellpadding="4">
  <tr><td><strong>Партньор:</strong></td><td>${req.user!.email}</td></tr>
  <tr><td><strong>Тема:</strong></td><td>${subject.trim()}</td></tr>
</table>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id} — изисква одобрение и анекс (§11.3)</p>`,
          text: `Нова заявка за промяна на договорни параметри\n\nПартньор: ${req.user!.email}\nТема: ${subject.trim()}\n\nTicket ID: ${ticket.id} — изисква одобрение и анекс (§11.3)`,
        })
      )
      .catch((err) => logger.error('[partnerHelp] failed to escalate CONTRACT_CHANGE to SUPER_ADMIN:', err));
  }

  // Fire-and-forget: set rootMessageId + persist TicketReply anchor + send confirmation email
  (async () => {
    try {
      const subject_built = buildTicketSubject(ticket.id, 'Вашата заявка е получена');
      const ref = subject_built.match(/\[#[a-f0-9]+\]/i)?.[0] ?? '';
      // Generate threading headers first so rootMessageId matches the actual
      // Message-ID sent in the email (a second newMessageId() call would
      // produce a different value, breaking Priority-2 In-Reply-To threading).
      const threading = buildTicketHeaders({ ticketId: ticket.id });
      await prisma.helpTicket.update({
        where: { id: ticket.id },
        data: { rootMessageId: threading.messageId, shortRef: computeShortRef(ticket.id) },
      });
      // Persist the reply row BEFORE sending so Priority-2 In-Reply-To threading
      // resolves via TicketReply.messageId lookup even if the mailer later fails.
      // Mirrors the same pattern in help.routes.ts (user ticket creation).
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
      const officeEmail = await getSystemSettingStr('office_email', 'office@boomcard.bg');
      await emailService.sendEmail({
        to: req.user!.email,
        audience: 'partner',
        subject: subject_built,
        headers: threading.headers,
        replyTo: buildPlusReplyTo(ticket.id, 'partner'),
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><tr><td style="padding:28px"><p style="margin:0 0 16px;color:#111;font-size:16px">Здравейте,</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Получихме вашата заявка с референция <strong style="font-family:monospace">${ref}</strong>.</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Ще се свържем с вас възможно най-скоро. За допълнителна информация: <a href="mailto:${officeEmail}">${officeEmail}</a>.</p><p style="margin:24px 0 0;color:#999;font-size:13px">— Екипът на BoomCard</p></td></tr></table></td></tr></table></body></html>`,
        text: `Здравейте,\n\nПолучихме вашата заявка с референция ${ref}.\n\nЩе се свържем с вас възможно най-скоро.\n\nПри нужда: ${officeEmail}\n\n— Екипът на BoomCard`,
      });
    } catch (err) {
      logger.error('[partnerHelp] failed to send confirmation email:', err);
    }
  })();

  return res.status(201).json({ success: true, data: ticket });
}));

// GET /api/partner/help/tickets — list own tickets (paginated)
router.get('/tickets', asyncHandler(async (req: AuthRequest, res) => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1') || 1);
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '20') || 20));
  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    prisma.helpTicket.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true, subject: true, category: true, status: true, priority: true,
        requestType: true, source: true, createdAt: true, updatedAt: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.helpTicket.count({ where: { userId: req.user!.id } }),
  ]);

  return res.json({ success: true, data: { tickets, total, page, limit } });
}));

// GET /api/partner/help/tickets/:id — full ticket detail for own ticket
router.get('/tickets/:id', asyncHandler(async (req: AuthRequest, res) => {
  // Single query: filter by id + userId so partners can only see their own tickets.
  // Replaces the previous two-query pattern (findUnique then findFirst ownership check).
  const ticket = await prisma.helpTicket.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    select: {
      id: true, subject: true, body: true, category: true, status: true, priority: true,
      requestType: true, source: true, externalEmail: true, reopenedAt: true, resolvedAt: true,
      createdAt: true, updatedAt: true,
      assignee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена или нямате достъп' });

  return res.json({ success: true, data: ticket });
}));

// POST /api/partner/help/tickets/:id/reply — partner sends a follow-up message
router.post('/tickets/:id/reply', asyncHandler(async (req: AuthRequest, res) => {
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
  if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена или нямате достъп' });
  if (ticket.status === 'CLOSED' || ticket.status === 'REJECTED') {
    return res.status(400).json({ error: 'Не може да се отговаря на заявка в крайно състояние' });
  }

  // Build threading headers BEFORE creating the reply row so the messageId is
  // both persisted on TicketReply and sent in the outbound notification email.
  // This anchors Priority-2 In-Reply-To lookup when the assignee replies to
  // the notification email — mirrors the pattern used by the admin reply handler.
  const partnerPriorMessages = await prisma.ticketReply.findMany({
    where: { ticketId: ticket.id, messageId: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { messageId: true },
  });
  const partnerRefChain: string[] = [
    ticket.rootMessageId,
    ...partnerPriorMessages.map((r: { messageId: string | null }) => r.messageId as string),
  ].filter((id): id is string => !!id);
  const partnerThreading = buildTicketHeaders({
    ticketId: ticket.id,
    inReplyTo: partnerRefChain.at(-1) ?? null,
    references: partnerRefChain,
  });

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: ticket.id,
      authorId: req.user!.id,
      body: body.trim(),
      isAdmin: false,
      messageId: partnerThreading.messageId,
      inReplyTo: partnerRefChain.at(-1) ?? null,
      channel: 'WEB',
    },
    select: { id: true, body: true, isAdmin: true, createdAt: true },
  });

  // Move ticket back to OPEN when partner replies on a WAITING/RESOLVED ticket.
  // Stamp reopenedAt for WEB-channel parity with email-inbound reopens.
  if (ticket.status === 'WAITING' || ticket.status === 'RESOLVED') {
    await prisma.helpTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN', resolvedAt: null, reopenedAt: new Date() } });
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const replyBodyText = body.trim();
  const partnerReplyHeaders = partnerThreading.headers;

  // Notify the assignee if one is set.
  if (ticket.assignee?.email) {
    emailService
      .sendEmail({
        to: ticket.assignee.email,
        subject: buildTicketSubject(ticket.id, `[Отговор от партньор] ${ticket.subject}`),
        headers: partnerReplyHeaders,
        html: `<p>Партньорът изпрати отговор на заявка, назначена на вас.</p>
<hr/>
<p>${esc(replyBodyText).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id}</p>`,
        text: `Партньорът изпрати отговор на заявка, назначена на вас.\n\n${replyBodyText}\n\nTicket ID: ${ticket.id}`,
      })
      .catch((err) => logger.error('[partnerHelp] failed to notify assignee of reply:', err));
  } else {
    // Unassigned — alert the partner office inbox (spec §9.5: partner correspondence → office_email).
    getSystemSettingStr('office_email', 'office@boomcard.bg')
      .then((officeEmail) =>
        emailService.sendEmail({
          to: officeEmail,
          subject: buildTicketSubject(ticket.id, `[Партньорски отговор без отговорник] ${ticket.subject}`),
          headers: partnerReplyHeaders,
          html: `<p>Партньор изпрати отговор на заявка без назначен отговорник.</p>
<hr/>
<p>${esc(replyBodyText).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id}</p>`,
          text: `Партньор изпрати отговор на заявка без назначен отговорник.\n\n${replyBodyText}\n\nTicket ID: ${ticket.id}`,
        })
      )
      .catch((err) => logger.error('[partnerHelp] failed to alert office of unassigned reply:', err));
  }

  return res.status(201).json({ success: true, data: reply });
}));

// GET /api/partner/help/tickets/:id/replies — list replies for own ticket
router.get('/tickets/:id/replies', asyncHandler(async (req: AuthRequest, res) => {
  // Single-query ownership check: findFirst with userId filter collapses the prior
  // two-query pattern (findUnique + separate ownership check) that exposed ticket
  // existence via 404 vs 403 differential to non-owners (IDOR information disclosure).
  const ticket = await prisma.helpTicket.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена или нямате достъп' });

  const replies = await prisma.ticketReply.findMany({
    where: { ticketId: req.params.id, isAutoReply: false },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, body: true, isAdmin: true, createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return res.json({ success: true, data: replies });
}));

export default router;
