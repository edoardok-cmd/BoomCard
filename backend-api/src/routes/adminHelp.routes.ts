import { Router } from 'express';
import { TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders } from '../services/ticketEmail.service';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

const FRONTEND_URL = (() => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    logger.error('[adminHelp] FRONTEND_URL is not set in production — falling back to https://boomcard.bg for email deep-links');
    return 'https://boomcard.bg';
  }
  return 'http://localhost:3021';
})();

const TICKET_SELECT_ALL = {
  id: true,
  subject: true,
  category: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  // Spec §11.3 / §11.1 — surface request type + ingress channel so the admin
  // UI can filter by type and badge tickets that arrived via email.
  requestType: true,
  source: true,
  externalEmail: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

// Returns true when the caller may access any ticket (not just their own).
function hasFullAccess(req: AuthRequest): boolean {
  return req.user!.role === 'SUPER_ADMIN';
}

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

// GET /api/admin/help/count — pending ticket counts for the nav badge
//   Regular admin: count of their own NEW tickets
//   SUPER_ADMIN:   count of all NEW tickets in the system
router.get('/count', requirePermission('help.read'), async (req: AuthRequest, res, next) => {
  try {
    const count = hasFullAccess(req)
      ? await prisma.helpTicket.count({ where: { status: 'NEW' } })
      : await prisma.helpTicket.count({ where: { status: 'NEW', userId: req.user!.id } });
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help — all tickets with optional filters (SUPER_ADMIN only per spec §11)
router.get('/', authorize('SUPER_ADMIN'), async (req, res, next) => {
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

// GET /api/admin/help/mine — tickets created by the current admin (Spec §11 "Моите заявки")
router.get('/mine', requirePermission('help.read'), async (req: AuthRequest, res, next) => {
  try {
    const { status, priority, category, search, page = '1', limit = '25' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    // Build where as AND conditions so status + search can coexist without clobbering each other.
    type WhereClause = Parameters<typeof prisma.helpTicket.findMany>[0]['where'];
    const conditions: NonNullable<WhereClause>[] = [{ userId: req.user!.id }];

    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      conditions.push({ status: status as TicketStatus });
    }
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      conditions.push({ priority: priority as TicketPriority });
    }
    if (category && Object.values(TicketCategory).includes(category as TicketCategory)) {
      conditions.push({ category: category as TicketCategory });
    }
    if (search) {
      conditions.push({ OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { body:    { contains: search, mode: 'insensitive' } },
      ] });
    }

    const where: WhereClause = { AND: conditions };

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, select: TICKET_SELECT_ALL }),
      prisma.helpTicket.count({ where }),
    ]);

    res.json({ tickets, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/:id — full ticket detail including body
router.get('/:id', requirePermission('help.read'), async (req: AuthRequest, res, next) => {
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
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.user.id !== req.user!.id && ticket.assignee?.id !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }
    res.json({ ticket });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/help/:id/assign — assign ticket
//   No body / assigneeId absent → self-assign (any admin with access)
//   assigneeId: "uuid"           → assign to that admin (SUPER_ADMIN only)
//   assigneeId: null             → remove assignee / unassign (SUPER_ADMIN only)
router.post('/:id/assign', requirePermission('help.write'), async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as { assigneeId?: string | null };
    // Distinguish "field not sent" (self-assign) from "field sent as null" (unassign).
    const hasExplicitTarget = Object.prototype.hasOwnProperty.call(body, 'assigneeId');
    const isUnassign = hasExplicitTarget && body.assigneeId === null;
    const targetId = hasExplicitTarget && !isUnassign ? (body.assigneeId as string) : undefined;

    // Any explicit target (including null for unassign) requires SUPER_ADMIN.
    if (hasExplicitTarget && !hasFullAccess(req)) {
      return res.status(403).json({ error: 'Само SUPER_ADMIN може да назначава на друг администратор' });
    }

    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.userId !== req.user!.id && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }

    // Resolve final assignee: null (unassign), explicit UUID (SUPER_ADMIN), or self.
    const resolvedAssigneeId: string | null = isUnassign ? null : (targetId ?? req.user!.id);

    // Validate the target admin exists (skip for unassign and self-assign, self is already authed).
    if (typeof targetId === 'string') {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true },
      });
      if (!targetUser || !(['ADMIN', 'SUPER_ADMIN'] as string[]).includes(targetUser.role)) {
        return res.status(400).json({ error: 'Невалиден отговорник — потребителят не е администратор' });
      }
    }

    // Cannot assign the ticket creator as the assignee (irrelevant for unassign).
    if (resolvedAssigneeId !== null && resolvedAssigneeId === ticket.userId) {
      return res.status(400).json({ error: 'Не може да назначите заявителя като отговорник на собствената му заявка' });
    }
    // No-op: already at the requested state.
    if (ticket.assigneeId === resolvedAssigneeId) {
      return res.json({ ok: true });
    }

    await prisma.helpTicket.update({
      where: { id: req.params.id },
      data: {
        assigneeId: resolvedAssigneeId,
        // Spec §11.4: assignment moves NEW → IN_REVIEW ("В преглед" — admin
        // has taken ownership and is actively working). Audit-pass [6.3]:
        // a creator-reply that bounced the ticket from WAITING → OPEN is
        // still effectively "newly assigned" if a different admin then picks
        // it up — also move OPEN → IN_REVIEW on assignment. Other in-progress
        // states (IN_REVIEW, WAITING, RESOLVED, CLOSED) stay untouched.
        status:
          resolvedAssigneeId !== null && (ticket.status === 'NEW' || ticket.status === 'OPEN')
            ? 'IN_REVIEW'
            : ticket.status,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/help/:id/reject — Spec §11.4 "Отказана": terminal rejection.
// Audit-pass [6.2]: previously REJECTED was a dormant enum value with no
// writer. This endpoint adds a first-class admin action requiring a reason,
// notifies the creator, and is independent of CLOSED (which means resolved
// and confirmed by the creator).
router.post('/:id/reject', requirePermission('help.write'), async (req: AuthRequest, res, next) => {
  try {
    const { reason } = req.body as { reason?: string };
    const trimmedReason = reason?.trim() || '';
    if (trimmedReason.length < 10) {
      return res.status(400).json({ error: 'Причината е задължителна (минимум 10 символа)' });
    }
    if (trimmedReason.length > 1000) {
      return res.status(400).json({ error: 'Причината е твърде дълга (максимум 1000 символа)' });
    }

    const ticket = await prisma.helpTicket.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, firstName: true } } },
    });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    // Policy (confirmed audit-fix [7]): only the assignee or SUPER_ADMIN can reject.
    // Regular help.write admins who are not assigned to this ticket cannot reject —
    // rejection is a terminal action that should be owned by someone accountable.
    // If the policy changes (e.g., any help.write admin may reject), remove the
    // assigneeId check and keep only the hasFullAccess / role gate.
    if (!hasFullAccess(req) && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп — само отговорникът или SUPER_ADMIN може да отхвърли' });
    }
    // Terminal states cannot transition further. CLOSED is the success-side
    // terminal; REJECTED is the failure-side terminal — both are immutable.
    if (ticket.status === 'CLOSED' || ticket.status === 'REJECTED') {
      return res.status(400).json({ error: 'Заявката вече е в крайно състояние' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.helpTicket.update({
        where: { id: req.params.id },
        data: { status: 'REJECTED' as TicketStatus },
      });
      // Persist the rejection as a system reply so it appears in the audit
      // trail AND in the conversation (not as auto-reply — admins and the
      // creator should see why the ticket was rejected).
      await tx.ticketReply.create({
        data: {
          ticketId: req.params.id,
          authorId: req.user!.id,
          body: `[ОТКАЗАНА] ${trimmedReason}`,
          isAdmin: true,
          channel: 'INTERNAL',
        },
      });
    });

    // Notify the creator (non-fatal; do not block the response).
    if (ticket.user.email) {
      const escR = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      emailService
        .sendEmail({
          to: ticket.user.email,
          subject: `[Заявката отказана] ${ticket.subject}`,
          html: `<p>Здравей, ${escR(ticket.user.firstName || ticket.user.email)},</p>
<p>Вашата заявка беше отказана от администратор.</p>
<p><strong>Причина:</strong></p>
<blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;color:#555;">${escR(trimmedReason)}</blockquote>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id}</p>`,
          text: `Здравей, ${ticket.user.firstName || ticket.user.email},\n\nВашата заявка беше отказана.\n\nПричина: ${trimmedReason}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[adminHelp] reject notification email failed:', err));
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/help/:id — update status and/or priority
router.patch('/:id', requirePermission('help.write'), async (req: AuthRequest, res, next) => {
  try {
    const { status, priority } = req.body as { status?: string; priority?: string };

    const ticket = await prisma.helpTicket.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, firstName: true } } },
    });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.userId !== req.user!.id && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }
    if (ticket.status === 'CLOSED' && !hasFullAccess(req)) {
      return res.status(400).json({ error: 'Не може да се променя затворена заявка' });
    }

    // Creators who are not also the assignee may only mark their own ticket as RESOLVED;
    // they may not change priority. Assignees and SUPER_ADMINs have no such restriction.
    const isCreatorOnly = !hasFullAccess(req)
      && ticket.userId === req.user!.id
      && ticket.assigneeId !== req.user!.id;
    if (isCreatorOnly) {
      if (priority) {
        return res.status(403).json({ error: 'Заявителят не може да променя приоритета' });
      }
      if (status && Object.values(TicketStatus).includes(status as TicketStatus) && status !== 'RESOLVED') {
        return res.status(403).json({ error: 'Заявителят може само да маркира заявка като решена' });
      }
    }

    const data: { status?: TicketStatus; priority?: TicketPriority } = {};
    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      data.status = status as TicketStatus;
    }
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      data.priority = priority as TicketPriority;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Няма валидни полета за обновяване' });
    }

    await prisma.helpTicket.update({ where: { id: req.params.id }, data });

    // Notify the creator when SUPER_ADMIN closes their ticket — terminal state with no further replies.
    // Guard ticket.status !== 'CLOSED' to prevent duplicate emails when a SUPER_ADMIN re-saves
    // an already-closed ticket (the DB update is a no-op but the email would fire again without this).
    if (data.status === 'CLOSED' && ticket.status !== 'CLOSED' && ticket.user.email) {
      const escCl = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const CATEGORY_BG_CLOSED: Record<string, string> = {
        CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане', TECHNICAL: 'Техническо', OTHER: 'Друго',
      };
      emailService
        .sendEmail({
          to: ticket.user.email,
          subject: `[Заявката затворена] ${ticket.subject}`,
          html: `<p><strong>Здравей, ${escCl(ticket.user.firstName || ticket.user.email)},</strong></p>
<p>Вашата вътрешна заявка беше затворена от администратор.</p>
<table cellpadding="4">
  <tr><td><strong>Тема:</strong></td><td>${escCl(ticket.subject)}</td></tr>
  <tr><td><strong>Категория:</strong></td><td>${CATEGORY_BG_CLOSED[ticket.category] ?? ticket.category}</td></tr>
</table>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id} &middot; <a href="${FRONTEND_URL}/admin/help/mine?ticket=${ticket.id}">Преглед</a></p>`,
          text: `Здравей, ${ticket.user.firstName || ticket.user.email},\n\nВашата вътрешна заявка беше затворена от администратор.\n\nТема: ${ticket.subject}\nКатегория: ${CATEGORY_BG_CLOSED[ticket.category] ?? ticket.category}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[adminHelp] Failed to send closed notification to creator:', err));
    }

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
      return res.status(400).json({ error: 'Отговорът е задължителен (минимум 10 символа)' });
    }
    if (body.trim().length > 5000) {
      return res.status(400).json({ error: 'Отговорът е твърде дълъг (максимум 5000 символа)' });
    }

    const ticket = await prisma.helpTicket.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { email: true, firstName: true } },
        assignee: { select: { email: true, firstName: true } },
      },
    });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.userId !== req.user!.id && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }
    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ error: 'Не може да се отговаря на затворена заявка' });
    }

    // Author-aware status transition matrix:
    //   support replies on NEW              → OPEN    (first contact; not WAITING — ticket is unowned)
    //   support replies on OPEN/RESOLVED    → WAITING (awaiting creator's confirmation)
    //   support replies on WAITING          → no change; ticket already awaits the creator
    //   creator replies on WAITING/RESOLVED → OPEN    (back to support)
    //   creator replies on NEW              → no change; assignment (POST /:id/assign) moves NEW→OPEN
    const isCreator = req.user!.id === ticket.userId;

    // Spec §11.2 — outbound system emails on a ticket must carry threading
    // headers. We mint the Message-ID up-front and persist it on the reply row
    // so an inbound reply's In-Reply-To resolves directly to a TicketReply.
    const threadingPrev = await prisma.ticketReply.findFirst({
      where: { ticketId: req.params.id, messageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { messageId: true },
    });
    const threading = buildTicketHeaders({
      ticketId: req.params.id,
      inReplyTo: threadingPrev?.messageId ?? ticket.rootMessageId ?? null,
    });

    const reply = await prisma.ticketReply.create({
      data: {
        ticketId: req.params.id,
        authorId: req.user!.id,
        body: body.trim(),
        // Creator's follow-ups appear on the "user" side of the chat;
        // support replies appear on the "admin" side.
        isAdmin: !isCreator,
        messageId: threading.messageId,
        inReplyTo: threadingPrev?.messageId ?? ticket.rootMessageId ?? null,
        channel: 'EMAIL',
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    let newStatus: TicketStatus | null = null;
    if (!isCreator) {
      if (ticket.status === 'NEW') {
        // First reply from support on an unowned ticket — open it rather than
        // marking WAITING (WAITING means "awaiting creator", which is wrong for an
        // untouched ticket where nobody has been assigned yet).
        newStatus = 'OPEN';
      } else if (
        ticket.status === 'OPEN' ||
        ticket.status === 'IN_REVIEW' ||
        ticket.status === 'RESOLVED'
      ) {
        // Support replied on an active / in-review / resolved ticket →
        // wait for creator to confirm
        newStatus = 'WAITING';
      }
      // WAITING: no change — ticket already awaits the creator
    } else if (isCreator && (ticket.status === 'WAITING' || ticket.status === 'RESOLVED')) {
      // Creator replies while waiting, or disputes a resolution → back to support
      newStatus = 'OPEN';
    }
    // Note: REJECTED is a terminal state — creator/support replies do not
    // transition out of it. Admins must explicitly re-open via PATCH /:id.
    if (newStatus) {
      await prisma.helpTicket.update({ where: { id: req.params.id }, data: { status: newStatus } });
    }

    // Shared helpers for reply notification emails
    const CATEGORY_BG: Record<string, string> = {
      CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане', TECHNICAL: 'Техническо', OTHER: 'Друго',
    };
    const escR = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Notify the ticket creator by email when support (non-creator) replies
    if (!isCreator && ticket.user?.email) {
      emailService
        .sendEmail({
          to: ticket.user.email,
          subject: buildTicketSubject(ticket.id, `[Отговор на заявка] ${ticket.subject}`),
          headers: threading.headers,
          html: `<p><strong>Здравей, ${escR(ticket.user.firstName || ticket.user.email)},</strong></p>
<p>Получихте отговор на вашата вътрешна заявка.</p>
<table cellpadding="4">
  <tr><td><strong>Тема:</strong></td><td>${escR(ticket.subject)}</td></tr>
  <tr><td><strong>Категория:</strong></td><td>${CATEGORY_BG[ticket.category] ?? ticket.category}</td></tr>
</table>
<hr/>
<p>${escR(body.trim()).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id} &middot; <a href="${FRONTEND_URL}/admin/help/mine?ticket=${ticket.id}">Отвори заявката</a></p>`,
          text: `Здравей, ${ticket.user.firstName || ticket.user.email},\n\nПолучихте отговор на вашата вътрешна заявка.\n\nТема: ${ticket.subject}\nКатегория: ${CATEGORY_BG[ticket.category] ?? ticket.category}\n\n${body.trim()}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[adminHelp] Failed to send reply notification email:', err));
    }

    // Notify the assigned admin by email when the ticket creator replies.
    // Skip when the ticket is self-assigned (assigneeId === userId) — the
    // creator would otherwise receive an email telling themselves they replied.
    if (isCreator && ticket.assignee?.email && ticket.assigneeId !== ticket.userId) {
      emailService
        .sendEmail({
          to: ticket.assignee.email,
          subject: buildTicketSubject(ticket.id, `[Отговор от заявител] ${ticket.subject}`),
          headers: threading.headers,
          html: `<p><strong>Здравей, ${escR(ticket.assignee.firstName || ticket.assignee.email)},</strong></p>
<p>Заявителят изпрати отговор на заявка, назначена на вас.</p>
<table cellpadding="4">
  <tr><td><strong>Тема:</strong></td><td>${escR(ticket.subject)}</td></tr>
  <tr><td><strong>Категория:</strong></td><td>${CATEGORY_BG[ticket.category] ?? ticket.category}</td></tr>
</table>
<hr/>
<p>${escR(body.trim()).replace(/\n/g, '<br/>')}</p>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id} &middot; <a href="${FRONTEND_URL}/admin/help/all?ticket=${ticket.id}">Отвори заявката</a></p>`,
          text: `Здравей, ${ticket.assignee.firstName || ticket.assignee.email},\n\nЗаявителят изпрати отговор на заявка, назначена на вас.\n\nТема: ${ticket.subject}\nКатегория: ${CATEGORY_BG[ticket.category] ?? ticket.category}\n\n${body.trim()}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[adminHelp] Failed to send creator-reply notification to assignee:', err));
    }

    // When creator replies on an unassigned ticket, alert support so it isn't silently missed.
    if (isCreator && !ticket.assigneeId) {
      emailService
        .sendEmail({
          to: 'support@boomcard.bg',
          subject: buildTicketSubject(ticket.id, `[Без отговорник] ${ticket.subject}`),
          headers: threading.headers,
          html: `<p><strong>Заявителят изпрати отговор на заявка без назначен отговорник.</strong></p>
<table cellpadding="4">
  <tr><td><strong>Заявител:</strong></td><td>${escR(ticket.user.firstName || ticket.user.email)}</td></tr>
  <tr><td><strong>Тема:</strong></td><td>${escR(ticket.subject)}</td></tr>
  <tr><td><strong>Категория:</strong></td><td>${CATEGORY_BG[ticket.category] ?? ticket.category}</td></tr>
</table>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id} &middot; <a href="${FRONTEND_URL}/admin/help/all?ticket=${ticket.id}">Отвори заявката</a></p>`,
          text: `Заявителят изпрати отговор на заявка без назначен отговорник.\n\nЗаявител: ${ticket.user.firstName || ticket.user.email}\nТема: ${ticket.subject}\nКатегория: ${CATEGORY_BG[ticket.category] ?? ticket.category}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[adminHelp] Failed to send unassigned-reply alert to support:', err));
    }

    res.status(201).json({ reply });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help/:id/replies — list all replies for a ticket
router.get('/:id/replies', requirePermission('help.read'), async (req: AuthRequest, res, next) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.userId !== req.user!.id && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }

    // Audit-pass [5.3]: filter out auto-reply rows. These exist only to
    // anchor an inbound Message-ID for threading (sendInboundAutoReply persists
    // them with `body: "[auto-reply confirmation sent]"`); rendering them in
    // the admin chat surface shows a phantom admin message. Inbound out-of-
    // office notes (also isAutoReply=true) are similarly suppressed — admins
    // who need them can query `includeAutoReplies=1`.
    const includeAutoReplies = req.query.includeAutoReplies === '1';
    const replies = await prisma.ticketReply.findMany({
      where: {
        ticketId: req.params.id,
        ...(includeAutoReplies ? {} : { isAutoReply: false }),
      },
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
