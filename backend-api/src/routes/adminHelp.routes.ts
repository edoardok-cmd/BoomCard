import { Router } from 'express';
import { TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

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
} as const;

// GET /api/admin/help — all tickets with optional filters
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('help.read'), async (req, res, next) => {
  try {
    const { status, priority, category, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

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

    res.json({ tickets, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/new — status=NEW tickets (unassigned queue)
router.get('/new', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('help.read'), async (req, res, next) => {
  try {
    const { priority, category, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

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

    res.json({ tickets, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/mine — tickets assigned to the current admin
router.get('/mine', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('help.read'), async (req: AuthRequest, res, next) => {
  try {
    const { status, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Parameters<typeof prisma.helpTicket.findMany>[0]['where'] = {
      assigneeId: req.user!.id,
    };
    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      where.status = status as TicketStatus;
    }
    if (search) {
      where.AND = [
        { assigneeId: req.user!.id },
        {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        },
      ];
      delete where.assigneeId;
    }

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, select: TICKET_SELECT_MINE }),
      prisma.helpTicket.count({ where }),
    ]);

    res.json({ tickets, total, page: parseInt(page), limit: take });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/help/:id/assign — assign ticket to self; transitions NEW → OPEN
router.post('/:id/assign', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('help.write'), async (req: AuthRequest, res, next) => {
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
router.patch('/:id', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('help.write'), async (req, res, next) => {
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

export default router;
