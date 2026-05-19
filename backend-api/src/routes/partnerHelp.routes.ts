import { Router } from 'express';
import { TicketCategory, TicketPriority } from '@prisma/client';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders } from '../services/ticketEmail.service';
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

  notificationService
    .notifyAdminOps({
      opsType: `partner_help_ticket_${ticket.id}`,
      title: `Партньорска заявка: ${requestType ?? 'SUPPORT'}`,
      message: subject.trim(),
      severity: 'info',
      fields: [
        { label: 'Тип', value: requestType ?? 'SUPPORT' },
        { label: 'Партньор', value: req.user!.email },
        { label: 'Ticket ID', value: ticket.id },
      ],
    })
    .catch((err) => logger.error('[partnerHelp] failed to notify admin ops:', err));

  // Fire-and-forget: set rootMessageId + send confirmation email
  (async () => {
    try {
      const subject_built = buildTicketSubject(ticket.id, 'Вашата заявка е получена');
      const ref = subject_built.match(/\[#[a-f0-9]+\]/i)?.[0] ?? '';
      // Generate threading headers first so rootMessageId matches the actual
      // Message-ID sent in the email (a second newMessageId() call would
      // produce a different value, breaking Priority-2 In-Reply-To threading).
      const threading = buildTicketHeaders({ ticketId: ticket.id });
      await prisma.helpTicket.update({ where: { id: ticket.id }, data: { rootMessageId: threading.messageId } });
      await emailService.sendEmail({
        to: req.user!.email,
        audience: 'partner',
        subject: subject_built,
        headers: threading.headers,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><tr><td style="padding:28px"><p style="margin:0 0 16px;color:#111;font-size:16px">Здравейте,</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Получихме вашата заявка с референция <strong style="font-family:monospace">${ref}</strong>.</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Ще се свържем с вас възможно най-скоро. За допълнителна информация: <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>.</p><p style="margin:24px 0 0;color:#999;font-size:13px">— Екипът на BoomCard</p></td></tr></table></td></tr></table></body></html>`,
        text: `Здравейте,\n\nПолучихме вашата заявка с референция ${ref}.\n\nЩе се свържем с вас възможно най-скоро.\n\nПри нужда: office@boomcard.bg\n\n— Екипът на BoomCard`,
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
  const ticket = await prisma.helpTicket.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, subject: true, body: true, category: true, status: true, priority: true,
      requestType: true, source: true, externalEmail: true, reopenedAt: true,
      createdAt: true, updatedAt: true,
      assignee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });

  // Partners may only see their own tickets.
  const owned = await prisma.helpTicket.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    select: { id: true },
  });
  if (!owned) return res.status(403).json({ error: 'Отказан достъп' });

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

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: ticket.id,
      authorId: req.user!.id,
      body: body.trim(),
      isAdmin: false,
      channel: 'WEB',
    },
    select: { id: true, body: true, isAdmin: true, createdAt: true },
  });

  // Move ticket back to OPEN when partner replies on a WAITING/RESOLVED ticket.
  if (ticket.status === 'WAITING' || ticket.status === 'RESOLVED') {
    await prisma.helpTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN', resolvedAt: null } });
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const replyBodyText = body.trim();

  // Build a minimal threading chain so notification emails land in the existing
  // ticket thread rather than starting a new conversation in the recipient's client.
  // Partner replies are WEB-channel and don't populate their own messageId rows,
  // so we use the ticket's rootMessageId as the single-element anchor.
  const partnerReplyHeaders = buildTicketHeaders({
    ticketId: ticket.id,
    inReplyTo: ticket.rootMessageId ?? null,
    references: ticket.rootMessageId ? [ticket.rootMessageId] : [],
  }).headers;

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
  const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
  if (ticket.userId !== req.user!.id) return res.status(403).json({ error: 'Отказан достъп' });

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
