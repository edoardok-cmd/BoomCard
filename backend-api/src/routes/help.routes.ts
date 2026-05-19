import { Router, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { buildTicketSubject, buildTicketHeaders } from '../services/ticketEmail.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

const submitTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  body: z.string().min(10).max(5000),
  category: z.enum(['CASHBACK', 'ACCOUNT', 'PAYMENT', 'TECHNICAL', 'OTHER']),
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

    const { subject, body, category } = parseResult.data;
    const userId = req.user!.id;

    const ticket = await prisma.helpTicket.create({
      data: { subject, body, category, userId },
      select: { id: true, subject: true, category: true, status: true, createdAt: true },
    });

    notificationService
      .notifyAdminOps({
        opsType: 'help_ticket_created',
        title: `New support ticket: ${category}`,
        message: subject,
        severity: 'info',
        fields: [
          { label: 'Category', value: category },
          { label: 'User', value: userId },
          { label: 'Ticket ID', value: ticket.id },
        ],
      })
      .catch((err) => logger.error('[help] Failed to notify admin of new ticket:', err));

    // After ticket creation, fire-and-forget: set rootMessageId + send confirmation.
    // IMPORTANT: call buildTicketHeaders() once and use threading.messageId for
    // rootMessageId. Two separate newMessageId() calls produce different IDs,
    // which breaks Priority-2 In-Reply-To threading for any subsequent email reply.
    (async () => {
      try {
        const threading = buildTicketHeaders({ ticketId: ticket.id });
        await prisma.helpTicket.update({ where: { id: ticket.id }, data: { rootMessageId: threading.messageId } });
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
        if (user?.email) {
          const subject = buildTicketSubject(ticket.id, 'Вашата заявка е получена');
          const ref = subject.match(/\[#[a-f0-9]+\]/i)?.[0] ?? '';
          await emailService.sendEmail({
            to: user.email,
            subject,
            headers: threading.headers,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;margin:0;padding:0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.06)"><tr><td style="padding:28px"><p style="margin:0 0 16px;color:#111;font-size:16px">Здравейте${user.firstName ? ', ' + user.firstName : ''},</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Получихме вашата заявка и тя е регистрирана с референция <strong style="font-family:monospace">${ref}</strong>.</p><p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">Ще се свържем с вас възможно най-скоро. За допълнителна информация напишете ни на <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</p><p style="margin:24px 0 0;color:#999;font-size:13px">— Екипът на BoomCard</p></td></tr></table></td></tr></table></body></html>`,
            text: `Здравейте${user.firstName ? ', ' + user.firstName : ''},\n\nПолучихме вашата заявка с референция ${ref}.\n\nЩе се свържем с вас възможно най-скоро.\n\nПри нужда: support@boomcard.bg\n\n— Екипът на BoomCard`,
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
 * List the current user's own tickets.
 */
router.get(
  '/tickets',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const tickets = await prisma.helpTicket.findMany({
      where: { userId: req.user!.id },
      select: { id: true, subject: true, category: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return res.json({ success: true, data: tickets });
  })
);

export default router;
