import { Router } from 'express';
import { TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware, writeAudit } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders, computeShortRef } from '../services/ticketEmail.service';
import { fireAutomation } from '../lib/automationDispatcher';
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
// SUPER_ADMIN always has full access. Roles granted help.read.all (e.g. SUPPORT)
// are also given full visibility so they can manage the help queue per §13.
function hasFullAccess(req: AuthRequest): boolean {
  return req.user!.role === 'SUPER_ADMIN' || (req.user!.permissions ?? []).includes('help.read.all');
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
        source: 'WEB',
        // Spec §11.4: initial status is OPEN ("Отворена"). NEW is kept in the
        // enum for existing rows but new tickets use OPEN directly.
        status: 'OPEN',
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

    // Spec §11.6: send auto-reply confirmation to the admin who created the ticket
    // (same pattern as partner and user web-form tickets).
    ;(async () => {
      try {
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
        const ref = buildTicketSubject(ticket.id, '').match(/\[#[a-f0-9]+\]/i)?.[0] ?? `#${ticket.id.slice(0, 8)}`;
        await emailService.sendEmail({
          to: req.user!.email,
          subject: buildTicketSubject(ticket.id, 'Вашата заявка е получена'),
          headers: threading.headers,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><tr><td style="padding:28px"><p style="margin:0 0 16px;color:#111;font-size:16px">Здравейте,</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Вашата вътрешна заявка е регистрирана с референция <strong style="font-family:monospace">${ref}</strong>.</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Можете да я следите на адрес: <a href="${FRONTEND_URL}/admin/help/mine?ticket=${ticket.id}">Моите заявки</a>.</p><p style="margin:24px 0 0;color:#999;font-size:13px">— Екипът на BoomCard</p></td></tr></table></td></tr></table></body></html>`,
          text: `Здравейте,\n\nВашата вътрешна заявка е регистрирана с референция ${ref}.\n\nМоже да я следите тук: ${FRONTEND_URL}/admin/help/mine?ticket=${ticket.id}\n\n— Екипът на BoomCard`,
        });
      } catch (err) {
        logger.error('[adminHelp] Failed to send auto-reply to ticket creator:', err);
      }
    })();

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
//   Regular admin: count of their own open tickets (owner or assignee)
//   SUPER_ADMIN:   count of all open tickets in the system
// NEW is included for legacy rows; OPEN is the initial status for all new tickets.
router.get('/count', requirePermission('help.read'), async (req: AuthRequest, res, next) => {
  try {
    const openFilter = { status: { in: ['NEW', 'OPEN'] as TicketStatus[] } };
    const count = hasFullAccess(req)
      ? await prisma.helpTicket.count({ where: openFilter })
      : await prisma.helpTicket.count({
          where: {
            ...openFilter,
            OR: [{ userId: req.user!.id }, { assigneeId: req.user!.id }],
          },
        });
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/help — all tickets with optional filters
// Accessible to callers with help.read.all (SUPPORT role, SUPER_ADMIN).
// Spec §11.5: filters by тип, статус, ownership, период.
// Query params: status, priority, category, requestType, search, from, to, assigneeId, page, limit
router.get('/', requirePermission('help.read.all'), async (req, res, next) => {
  try {
    const {
      status, priority, category, search,
      from, to, assigneeId,
      page = '1', limit = '25',
    } = req.query as Record<string, string>;
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
    if (req.query.requestType && typeof req.query.requestType === 'string') {
      where.requestType = req.query.requestType;
    }
    // Spec §11.5 "период" — date range filter on createdAt.
    // `from` and `to` are ISO-8601 strings; invalid values are silently ignored.
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && !isNaN(fromDate.getTime()) && toDate && !isNaN(toDate.getTime())) {
      where.createdAt = { gte: fromDate, lte: toDate };
    } else if (fromDate && !isNaN(fromDate.getTime())) {
      where.createdAt = { gte: fromDate };
    } else if (toDate && !isNaN(toDate.getTime())) {
      where.createdAt = { lte: toDate };
    }
    // Spec §11.5 "ownership" — filter by assignee.
    // assigneeId="unassigned" returns tickets with no assignee.
    if (assigneeId) {
      where.assigneeId = assigneeId === 'unassigned' ? null : assigneeId;
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
    // Spec §11.5 "Моите заявки": tickets where the current admin is owner OR assignee.
    type WhereClause = Parameters<typeof prisma.helpTicket.findMany>[0]['where'];
    const conditions: NonNullable<WhereClause>[] = [
      { OR: [{ userId: req.user!.id }, { assigneeId: req.user!.id }] },
    ];

    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      conditions.push({ status: status as TicketStatus });
    }
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      conditions.push({ priority: priority as TicketPriority });
    }
    if (category && Object.values(TicketCategory).includes(category as TicketCategory)) {
      conditions.push({ category: category as TicketCategory });
    }
    if (req.query.requestType && typeof req.query.requestType === 'string') {
      conditions.push({ requestType: req.query.requestType });
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
        requestType: true,
        source: true,
        externalEmail: true,
        linkedTicketId: true,
        reopenedAt: true,
        resolvedAt: true,
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

    // For email-originated tickets, surface how many bounces have been logged
    // from the same sender address so the admin can see if the address is invalid.
    let bounceCount = 0;
    if (ticket.externalEmail) {
      bounceCount = await prisma.inboundBounce.count({
        where: { fromEmail: ticket.externalEmail },
      });
    }

    res.json({ ticket: { ...ticket, bounceCount } });
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
    // hasFullAccess() is intentionally NOT used here — it returns true for SUPPORT
    // (help.read.all), but arbitrary assignment/unassignment is SUPER_ADMIN-only;
    // SUPPORT may only self-assign.
    if (hasExplicitTarget && req.user!.role !== 'SUPER_ADMIN') {
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

    // Cannot assign the ticket creator as the assignee, UNLESS the creator is
    // an admin/super-admin creating an internal ticket (§11.5 "Нова заявка").
    // The check prevents subscribers from gaming their own support tickets; it
    // must not block the legitimate admin-creates-and-assigns-to-self workflow.
    if (resolvedAssigneeId !== null && resolvedAssigneeId === ticket.userId) {
      // Allow when the creator is an admin role — check the creator's role.
      const creatorRecord = await prisma.user.findUnique({
        where: { id: ticket.userId },
        select: { role: true },
      });
      const creatorIsAdmin = creatorRecord?.role === 'ADMIN' || creatorRecord?.role === 'SUPER_ADMIN';
      if (!creatorIsAdmin) {
        return res.status(400).json({ error: 'Не може да назначите заявителя като отговорник на собствената му заявка' });
      }
    }
    // No-op: already at the requested state.
    if (ticket.assigneeId === resolvedAssigneeId) {
      return res.json({ ok: true });
    }

    const newStatus =
      resolvedAssigneeId !== null && (ticket.status === 'NEW' || ticket.status === 'OPEN')
        ? 'IN_REVIEW'
        : ticket.status;

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
        status: newStatus,
      },
    });

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'ticket.assign',
      objectType: 'ticket',
      objectId: req.params.id,
      before: { assigneeId: ticket.assigneeId, status: ticket.status },
      after: { assigneeId: resolvedAssigneeId, status: newStatus },
    }).catch(() => {});

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
      include: { user: { select: { email: true, firstName: true, role: true } } },
    });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    // Policy (confirmed audit-fix [7]): only the assignee or SUPER_ADMIN can reject.
    // Regular help.write admins who are not assigned to this ticket cannot reject —
    // rejection is a terminal action that should be owned by someone accountable.
    // hasFullAccess() is intentionally NOT used here — it returns true for SUPPORT
    // (help.read.all), but the "bypass assignee gate" privilege must remain SUPER_ADMIN-only.
    if (req.user!.role !== 'SUPER_ADMIN' && ticket.assigneeId !== req.user!.id) {
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

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'ticket.reject',
      objectType: 'ticket',
      objectId: req.params.id,
      before: { status: ticket.status },
      after: { status: 'REJECTED', reason: trimmedReason },
    }).catch(() => {});

    // Notify the creator (non-fatal; do not block the response).
    if (ticket.user.email) {
      // Build the RFC 5322 reference chain so the rejection email threads under
      // the existing ticket conversation in the user's mail client.
      const rejectPriorMsgs = await prisma.ticketReply.findMany({
        where: { ticketId: req.params.id, messageId: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { messageId: true },
      });
      const rejectRefChain: string[] = [
        ticket.rootMessageId,
        ...rejectPriorMsgs.map((r) => r.messageId),
      ].filter((id): id is string => !!id);
      const escR = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      emailService
        .sendEmail({
          to: ticket.user.email,
          audience: ticket.user.role === 'PARTNER' ? 'partner' : undefined,
          subject: buildTicketSubject(ticket.id, `[Заявката отказана] ${ticket.subject}`),
          headers: buildTicketHeaders({
            ticketId: req.params.id,
            inReplyTo: rejectRefChain.at(-1) ?? null,
            references: rejectRefChain,
          }).headers,
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
      include: { user: { select: { email: true, firstName: true, role: true } } },
    });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.userId !== req.user!.id && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }
    // Both CLOSED and REJECTED are terminal — no further status or priority
    // changes are allowed for any role (spec §11.4). Use the dedicated reject
    // endpoint to create a REJECTED ticket; use the reopen flow (POST /:id/reply
    // from the ticket owner) to reopen a CLOSED ticket.
    if (ticket.status === 'CLOSED' || ticket.status === 'REJECTED') {
      return res.status(400).json({ error: 'Не може да се променя заявка в крайно състояние' });
    }
    // Spec §11.4: REJECTED requires a reason (enforced by POST /:id/reject).
    // Reject via PATCH is blocked so callers cannot bypass the reason requirement.
    if (status === 'REJECTED') {
      return res.status(400).json({ error: 'Използвайте endpoint /reject за отказване на заявки — изисква се причина' });
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

    const data: { status?: TicketStatus; priority?: TicketPriority; resolvedAt?: Date | null; reopenedAt?: Date } = {};
    if (status && Object.values(TicketStatus).includes(status as TicketStatus)) {
      data.status = status as TicketStatus;
      // Stamp resolvedAt so auto-close can use a stable timestamp (not updatedAt,
      // which bumps on any field change, including priority or assignment edits).
      if (status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
        data.resolvedAt = new Date();
      } else if (status !== 'RESOLVED') {
        // Clear resolvedAt if the ticket is moved away from RESOLVED (e.g. re-opened).
        data.resolvedAt = null;
      }
      // Stamp reopenedAt whenever a manual admin PATCH transitions the ticket back
      // to OPEN from a parked state — parity with all other reopen paths (reply
      // handlers and ticketInbound.service.ts).
      if (status === 'OPEN' && (ticket.status === 'RESOLVED' || ticket.status === 'WAITING')) {
        data.reopenedAt = new Date();
      }
    }
    if (priority && Object.values(TicketPriority).includes(priority as TicketPriority)) {
      data.priority = priority as TicketPriority;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Няма валидни полета за обновяване' });
    }

    await prisma.helpTicket.update({ where: { id: req.params.id }, data });

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'ticket.update',
      objectType: 'ticket',
      objectId: req.params.id,
      before: {
        ...(data.status !== undefined ? { status: ticket.status } : {}),
        ...(data.priority !== undefined ? { priority: ticket.priority } : {}),
      },
      after: data as object,
    }).catch(() => {});

    // Spec §11.6: notify the ticket creator on every status change.
    // Guard old-status !== new-status to avoid duplicate emails if an admin
    // re-saves without changing the status value.
    if (data.status && data.status !== ticket.status && ticket.user.email) {
      const escCl = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const CATEGORY_BG_NOTIFY: Record<string, string> = {
        CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане', TECHNICAL: 'Техническо', OTHER: 'Друго',
      };
      const STATUS_BG_NOTIFY: Record<string, string> = {
        OPEN: 'Отворена', IN_REVIEW: 'В преглед', WAITING: 'Чака отговор',
        RESOLVED: 'Решена', CLOSED: 'Затворена', REJECTED: 'Отказана',
      };
      const newStatusLabel = STATUS_BG_NOTIFY[data.status] ?? data.status;
      const baseSubject = data.status === 'CLOSED'
        ? `[Заявката затворена] ${ticket.subject}`
        : `[Статус обновен: ${newStatusLabel}] ${ticket.subject}`;
      // Build the RFC 5322 reference chain so the status-change notification
      // threads under the existing ticket conversation in the user's mail client.
      const patchPriorMsgs = await prisma.ticketReply.findMany({
        where: { ticketId: req.params.id, messageId: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { messageId: true },
      });
      const patchRefChain: string[] = [
        ticket.rootMessageId,
        ...patchPriorMsgs.map((r) => r.messageId),
      ].filter((id): id is string => !!id);
      emailService
        .sendEmail({
          to: ticket.user.email,
          audience: ticket.user.role === 'PARTNER' ? 'partner' : undefined,
          subject: buildTicketSubject(ticket.id, baseSubject),
          headers: buildTicketHeaders({
            ticketId: req.params.id,
            inReplyTo: patchRefChain.at(-1) ?? null,
            references: patchRefChain,
          }).headers,
          html: `<p><strong>Здравей, ${escCl(ticket.user.firstName || ticket.user.email)},</strong></p>
<p>Статусът на вашата заявка беше обновен на <strong>${newStatusLabel}</strong>.</p>
<table cellpadding="4">
  <tr><td><strong>Тема:</strong></td><td>${escCl(ticket.subject)}</td></tr>
  <tr><td><strong>Категория:</strong></td><td>${CATEGORY_BG_NOTIFY[ticket.category] ?? ticket.category}</td></tr>
</table>
<p style="color:#999;font-size:12px;">Ticket ID: ${ticket.id} &middot; <a href="${FRONTEND_URL}/admin/help/mine?ticket=${ticket.id}">Преглед</a></p>`,
          text: `Здравей, ${ticket.user.firstName || ticket.user.email},\n\nСтатусът на вашата заявка беше обновен на: ${newStatusLabel}\n\nТема: ${ticket.subject}\nКатегория: ${CATEGORY_BG_NOTIFY[ticket.category] ?? ticket.category}\n\nTicket ID: ${ticket.id}`,
        })
        .catch((err) => logger.error('[adminHelp] Failed to send status-change notification to creator:', err));
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
        user: { select: { id: true, email: true, firstName: true, role: true } },
        assignee: { select: { email: true, firstName: true } },
      },
    });
    if (!ticket) return res.status(404).json({ error: 'Заявката не е намерена' });
    if (!hasFullAccess(req) && ticket.userId !== req.user!.id && ticket.assigneeId !== req.user!.id) {
      return res.status(403).json({ error: 'Отказан достъп' });
    }
    if (ticket.status === 'CLOSED' || ticket.status === 'REJECTED') {
      return res.status(400).json({ error: 'Не може да се отговаря на заявка в крайно състояние' });
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
    // Fetch all prior message IDs for the RFC 5322 References chain (oldest first).
    const priorMessages = await prisma.ticketReply.findMany({
      where: { ticketId: req.params.id, messageId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { messageId: true },
    });
    const refChain: string[] = [
      ticket.rootMessageId,
      ...priorMessages.map((r) => r.messageId),
    ].filter((id): id is string => !!id);

    const threading = buildTicketHeaders({
      ticketId: req.params.id,
      inReplyTo: refChain.at(-1) ?? null,
      references: refChain,
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
        inReplyTo: refChain.at(-1) ?? null,
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
      // Determine whether this transition counts as a "reopen" — i.e. the ticket
      // was in a parked/resolved state and is now being moved back to active.
      // Stamp reopenedAt so WEB-channel reopens are visible in the audit trail,
      // matching the behaviour of the email-inbound path (ticketInbound.service.ts:516).
      const isReopen = newStatus === 'OPEN' && (ticket.status === 'RESOLVED' || ticket.status === 'WAITING');
      await prisma.helpTicket.update({
        where: { id: req.params.id },
        data: {
          status: newStatus,
          // Clear resolvedAt whenever the ticket moves away from RESOLVED so
          // auto-close doesn't fire immediately on re-resolution.
          ...(ticket.status === 'RESOLVED' ? { resolvedAt: null } : {}),
          ...(isReopen ? { reopenedAt: new Date() } : {}),
        },
      });
    }

    req.skipAudit = true;
    writeAudit({
      actorUserId: req.user!.id,
      action: 'ticket.reply',
      objectType: 'ticket',
      objectId: req.params.id,
      before: { status: ticket.status },
      after: {
        status: newStatus ?? ticket.status,
        isAdmin: !isCreator,
        replyId: reply.id,
      },
    }).catch(() => {});

    // Spec §8.2 / §11 — fire support.reply automation when staff replies to a ticket.
    // skipEmail=true: the direct rich email below always carries the reply body,
    // so the automation must NOT also send the generic template email — that would
    // produce two emails for any user with marketingConsentEmail=true. The
    // automation still creates the in-app bell notification unconditionally.
    if (!isCreator && ticket.userId) {
      fireAutomation('support.reply', { userId: ticket.userId, skipEmail: true })
        .catch((err) => logger.error('[automation] support.reply fire failed:', err));
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
          audience: ticket.user.role === 'PARTNER' ? 'partner' : undefined,
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
