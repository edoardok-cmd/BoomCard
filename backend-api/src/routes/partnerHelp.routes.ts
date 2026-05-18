import { Router } from 'express';
import { TicketCategory, TicketPriority } from '@prisma/client';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders, newMessageId } from '../services/ticketEmail.service';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'));

const VALID_REQUEST_TYPES = ['SUPPORT', 'DATA_CHANGE', 'LOCATION_CHANGE', 'CONTRACT_CHANGE', 'OTHER'];

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
      status: 'NEW',
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
      const rootMsgId = newMessageId(ticket.id);
      await prisma.helpTicket.update({ where: { id: ticket.id }, data: { rootMessageId: rootMsgId } });
      const subject_built = buildTicketSubject(ticket.id, 'Вашата заявка е получена');
      const ref = subject_built.match(/\[#[a-f0-9]+\]/i)?.[0] ?? '';
      const threading = buildTicketHeaders({ ticketId: ticket.id, references: [] });
      await emailService.sendEmail({
        to: req.user!.email,
        subject: subject_built,
        headers: threading.headers,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><tr><td style="padding:28px"><p style="margin:0 0 16px;color:#111;font-size:16px">Здравейте,</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Получихме вашата заявка с референция <strong style="font-family:monospace">${ref}</strong>.</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Ще се свържем с вас възможно най-скоро. За допълнителна информация: <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</p><p style="margin:24px 0 0;color:#999;font-size:13px">— Екипът на BoomCard</p></td></tr></table></td></tr></table></body></html>`,
        text: `Здравейте,\n\nПолучихме вашата заявка с референция ${ref}.\n\nЩе се свържем с вас възможно най-скоро.\n\nПри нужда: support@boomcard.bg\n\n— Екипът на BoomCard`,
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
