import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler';
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';
import { createHelpTicketFromInbound } from '../services/helpTicketIntake.service';
import { buildTicketSubject } from '../services/ticketEmail.service';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { detach } from '../utils/detach';

const router = Router();

const CONTACT_RECIPIENT = process.env.CONTACT_FORM_RECIPIENT || 'partner@boomcard.bg';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;

const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  skip: () => process.env.NODE_ENV === 'development',
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.post('/', contactRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const language: 'bg' | 'en' = req.body?.language === 'bg' ? 'bg' : 'en';

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (name.length > MAX_NAME || email.length > MAX_EMAIL || message.length > MAX_MESSAGE) {
    return res.status(400).json({ success: false, error: 'Field exceeds maximum length' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  }

  try {
    // Create a Help Ticket (Spec §3.8 / §1.7)
    const { ticketId } = await createHelpTicketFromInbound({
      name,
      externalEmail: email,
      subject: language === 'bg'
        ? `Запитване от ${name}`
        : `Inquiry from ${name}`,
      body: message,
      source: 'WEB',
      language,
    });

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    // BC-ADMIN-SPEC-REAUDIT6-HELP-INTAKE-502-1: Read persisted shortRef from the ticket
    // instead of deriving ad-hoc from ticketId. This ensures the reference matches
    // what the inbound parser will use (may be longer than 8 chars on collision resolution).
    // If shortRef is null (collision retry exhausted), use the ticket ID as fallback.
    // The ticket is still valid and usable; only subject-prefix fallback is degraded.
    const ticket = await prisma.helpTicket.findUnique({
      where: { id: ticketId },
      select: { shortRef: true },
    });
    const shortRef = ticket?.shortRef ?? ticketId.slice(0, 8);

    // BC-ADMIN-SPEC-REAUDIT6-SHORTREF-RETRY-SWEEP-2 (MEDIUM #3): Include [#shortRef] in subject
    // for proper email threading in the admin inbox (per Spec §6.2).
    const adminSubject = language === 'bg'
      ? `[BOOM Card] [#${shortRef}] Запитване от ${name}`
      : `[BOOM Card] [#${shortRef}] Inquiry from ${name}`;

    const adminHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #111;">New contact form submission</h2>
        <p style="color: #666; font-size: 13px;">Ticket ID: <strong>[#${shortRef}]</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: 600; width: 120px;">Name</td>
            <td style="padding: 8px 12px;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: 600;">Email</td>
            <td style="padding: 8px 12px;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; background: #f8f9fa; font-weight: 600; vertical-align: top;">Message</td>
            <td style="padding: 8px 12px; white-space: pre-wrap;">${safeMessage}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px;">Reply directly to this email to respond to ${safeName}.</p>
      </div>
    `;

    const adminText = `New contact form submission\n\nTicket ID: ${ticketId}\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n`;

    // BC-ADMIN-SPEC-REAUDIT5-SHORTREF-RETRY-1: If admin notification email fails,
    // alert ops so this unrouted incoming contact doesn't get silently lost.
    // Mirrors the behavior in ticketInbound.service.ts when inbound replies are
    // unassigned (lines 931-941).
    await emailService.sendEmail({
      to: CONTACT_RECIPIENT,
      subject: adminSubject,
      html: adminHtml,
      text: adminText,
      replyTo: email,
    }).catch((err) => {
      logger.warn('Contact form admin notification send failed (non-blocking):', err);
      // Alert ops so this contact form submission is not lost
      detach(notificationService
        .notifyAdminOps({
          opsType: `contact_form_notification_failed_${ticketId}`,
          title: 'Contact form admin notification email failed',
          message: `Contact from ${name} (${email}) could not be delivered to ${CONTACT_RECIPIENT}`,
          severity: 'warning',
          fields: [
            { label: 'From', value: email },
            { label: 'Ticket ID', value: ticketId },
            { label: 'Error', value: String(err) },
          ],
        }), (opsErr) => logger.error('Failed to alert ops of contact form notification failure:', opsErr)
      );
    });

    logger.info(`Contact form submitted by ${email} → ticket ${ticketId}`);
    return res.json({ success: true, ticketId });
  } catch (err) {
    logger.error('Contact form help ticket creation failed', { email, name, error: err });
    return res.status(502).json({ success: false, error: 'Failed to create help request' });
  }
}));

export default router;
