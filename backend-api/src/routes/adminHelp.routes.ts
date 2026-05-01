import { Router } from 'express';
import { TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

const TICKET_SELECT_ALL = {
  id: true,
  subject: true,
  category: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

const TICKET_SELECT_NEW = {
  id: true,
  subject: true,
  category: true,
  priority: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

const TICKET_SELECT_MINE = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

// POST /api/admin/help — G8: admin creates a new help ticket (Spec §11 "Нова заявка")
router.post('/', requirePermission('help.write'), async (req: AuthRequest, res, next) => {
  try {
    const { subject, body, category, priority } = req.body as {
      subject?: string;
      body?: string;
      category?: string;
      priority?: string;
    };

    if (!subject?.trim() || subject.trim().length < 5) {
      return res.status(400).json({ error: 'subject is required (min 5 chars)' });
    }
    if (subject.trim().length > 200) {
      return res.status(400).json({ error: 'subject is too long (max 200 chars)' });
    }
    if (!body?.trim() || body.trim().length < 10) {
      return res.status(400).json({ error: 'body is required (min 10 chars)' });
    }
    if (body.trim().length > 5000) {
      return res.status(400).json({ error: 'body is too long (max 5000 chars)' });
    }
    if (!category || !Object.values(TicketCategory).includes(category as TicketCategory)) {
      return res.status(400).json({ error: `category must be one of: ${Object.values(TicketCategory).join(', ')}` });
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
        userId: req.user!.id,
        status: 'NEW',
      },
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    notificationService
      .notifyAdminOps({
        opsType: 'help_ticket_created',
        title: `Admin ticket: ${category}`,
        message: subject.trim(),
        severity: 'info',
        fields: [
          { label: 'Category', value: category },
          { label: 'Admin', value: req.user!.email },
          { label: 'Ticket ID', value: ticket.id },
        ],
      })
      .catch((err) => logger.error('[adminHelp] Failed to notify on admin ticket creation:', err));

    const adminEmail = req.user!.email;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const CATEGORY_BG: Record<string, string> = {
      CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане', TECHNICAL: 'Техническо', OTHER: 'Друго',
    };
    const PRIORITY_BG: Record<string, string> = {
      LOW: 'Нисък', MEDIUM: 'Среден', HIGH: 'Висок', URGENT: 'Спешен',
    };
    emailService
      .sendEmail({
        to: 'support@boomcard.bg',
        subject: `[Admin заявка] ${CATEGORY_BG[category] ?? category}: ${subject.trim()}`,
        html: `<p><strong>Нова вътрешна заявка от администратор</strong></p>
<table cellpadding="4">
  <tr><td><strong>Администратор:</strong></td><td>${esc(adminEmail)}</td></tr>
  <tr><td><strong>Категория:</strong></td><td>${CATEGORY_BG[category] ?? category}</td></tr>
  <tr><td><strong>Приоритет:</strong></td><td>${PRIORITY_BG[resolvedPriority] ?? resolvedPriority}</td></tr>
  <tr><td><strong>Тема:</strong></td><td>${esc(subject.trim())}</td></tr>
</table>
<hr/>
<p>${esc(body.trim()).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id}</p>`,
        text: `Нова вътрешна заявка от администратор\n\nАдминистратор: ${adminEmail}\nКатегория: ${CATEGORY_BG[category] ?? category}\nПриоритет: ${PRIORITY_BG[resolvedPriority] ?? resolvedPriority}\nТема: ${subject.trim()}\n\n${body.trim()}\n\nTicket ID: ${ticket.id}`,
      })
      .catch((err) => logger.error('[adminHelp] Failed to send email to support@boomcard.bg:', err));

    res.status(201).json({ ticket });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help — all tickets with optional filters (SUPER_ADMIN only per spec §11)
router.get('/', requirePermission('help.read.all'), async (req, res, next) => {
  try {
    const { status, priority, category, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.helpTicket.findMany>[0]['where'] = {};
    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      where.status = status as TicketStatus;
    }
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      where.priority = priority as TicketPriority;
    }
    if (category && Object.values(TicketCategory).includes(category as TicketCategory)) {
      where.category = category as TicketCategory;
    }
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: TICKET_SELECT_ALL }),
      prisma.helpTicket.count({ where }),
    ]);

    res.json({ tickets, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/new — status=NEW tickets (unassigned queue)
router.get('/new', requirePermission('help.read'), async (req, res, next) => {
  try {
    const { priority, category, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.helpTicket.findMany>[0]['where'] = { status: 'NEW' };
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      where.priority = priority as TicketPriority;
    }
    if (category && Object.values(TicketCategory).includes(category as TicketCategory)) {
      where.category = category as TicketCategory;
    }
    if (search) {
      where.AND = [
        { status: 'NEW' },
        {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
      delete where.status;
    }

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: TICKET_SELECT_NEW }),
      prisma.helpTicket.count({ where }),
    ]);

    res.json({ tickets, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/mine — tickets created by the current admin (Spec §11 "Моите заявки")
router.get('/mine', requirePermission('help.read'), async (req: AuthRequest, res, next) => {
  try {
    const { status, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.helpTicket.findMany>[0]['where'] = {
      userId: req.user!.id,
    };
    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      where.status = status as TicketStatus;
    }
    if (search) {
      where.AND = [
        { userId: req.user!.id },
        {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
      delete where.userId;
    }

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, select: TICKET_SELECT_MINE }),
      prisma.helpTicket.count({ where }),
    ]);

    res.json({ tickets, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/:id — full ticket detail including body
router.get('/:id', requirePermission('help.read'), async (req, res, next) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        subject: true,
        body: true,
        category: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/help/:id/assign — assign ticket to self; transitions NEW → OPEN
router.post('/:id/assign', requirePermission('help.write'), async (req: AuthRequest, res, next) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: {
        assigneeId: req.user!.id,
        status: ticket.status === 'NEW' ? 'OPEN' : ticket.status,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/help/:id — update status and/or priority
router.patch('/:id', requirePermission('help.write'), async (req, res, next) => {
  try {
    const { status, priority } = req.body as { status?: string; priority?: string };

    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const data: { status?: TicketStatus; priority?: TicketPriority } = {};
    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      data.status = status as TicketStatus;
    }
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      data.priority = priority as TicketPriority;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await prisma.helpTicket.update({ where: { id: req.params.id }, data });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/help/:id/reply — admin sends a reply to the ticket author
router.post('/:id/reply', requirePermission('help.write'), async (req: AuthRequest, res, next) => {
  try {
    const { body } = req.body as { body?: string };

    if (!body?.trim() || body.trim().length < 10) {
      return res.status(400).json({ error: 'Reply body is required (min 10 chars)' });
    }
    if (body.trim().length > 5000) {
      return res.status(400).json({ error: 'Reply body is too long (max 5000 chars)' });
    }

    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cannot reply to a closed ticket' });
    }

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: req.params.id,
        authorId: req.user!.id,
        body: body.trim(),
        isAdmin: true,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Move ticket to WAITING (waiting for the user to respond) if it was OPEN
    if (ticket.status === 'OPEN' || ticket.status === 'NEW') {
      await prisma.helpTicket.update({ where: { id: req.params.id }, data: { status: 'WAITING' } });
    }

    res.status(201).json({ reply });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/:id/replies — list all replies for a ticket
router.get('/:id/replies', requirePermission('help.read'), async (req, res, next) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    res.json({ replies });
  } catch (error) {
    next(error);
  }
});

export default router;
