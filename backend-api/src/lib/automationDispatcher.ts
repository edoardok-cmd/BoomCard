import { prisma } from './prisma';
import { emailService } from '../services/email.service';
import { sendWebPushToUser } from './webPush';
import { logger } from '../utils/logger';

/**
 * Context describing who triggered the automation event.
 * Supply at least one of userId/partnerId so the dispatcher can resolve
 * the recipient email and create in-app notifications.
 */
interface AutomationContext {
  userId?: string;
  partnerId?: string;
  /** Pre-resolved email — skips the DB lookup when already known. */
  recipientEmail?: string;
  /** Pre-resolved display name — skips the DB lookup when already known. */
  recipientName?: string;
}

/**
 * Fire all ACTIVE automations that match `trigger`.
 *
 * For each automation:
 *  - Sends the linked template via EMAIL / PUSH (SMS is a no-op until a provider is wired)
 *  - Creates an in-app Notification for user recipients (belt-and-suspenders alongside any
 *    EMAIL/PUSH delivery, so the user also sees it in the notification bell)
 *  - Increments totalRuns and stamps lastRunAt
 *
 * Consent gates:
 *  - EMAIL  → requires User.marketingConsentEmail === true
 *  - PUSH   → requires User.marketingConsent === true (general marketing consent;
 *              no push-specific field exists in the schema)
 *  - Partners → treated as opted-in unless their linked User explicitly opted out
 *
 * Every error is caught per-automation so one failure does not block others.
 * Call with `.catch()` at every call-site so the entire function is non-fatal.
 */
export async function fireAutomation(trigger: string, context: AutomationContext): Promise<void> {
  const automations = await prisma.marketingAutomation.findMany({
    where: { trigger, status: 'ACTIVE' },
    include: { template: true },
  });

  if (automations.length === 0) return;

  // Warn early if the caller provided no way to resolve a recipient — all
  // automations will be skipped and the issue would otherwise be invisible.
  if (!context.userId && !context.partnerId && !context.recipientEmail) {
    logger.warn(
      `[automation] fireAutomation("${trigger}") called with no recipient context — ` +
      `${automations.length} automation(s) will be skipped`,
    );
    return;
  }

  // ── Resolve recipient ──────────────────────────────────────────────────────
  let email: string | null = context.recipientEmail ?? null;
  let name = context.recipientName ?? 'BoomCard member';
  let resolvedUserId: string | null = context.userId ?? null;
  let emailConsentGranted = true;
  let pushConsentGranted = true;

  let preferredLanguage: string | null = null;

  if (context.userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: context.userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          marketingConsentEmail: true,
          marketingConsent: true,
          preferredLanguage: true,
        },
      });
      if (user) {
        email ??= user.email;
        name = [user.firstName, user.lastName].filter(Boolean).join(' ') || name;
        emailConsentGranted = user.marketingConsentEmail ?? false;
        pushConsentGranted = user.marketingConsent ?? false;
        preferredLanguage = user.preferredLanguage;
      }
    } catch (err) {
      logger.error(`[automation] Failed to resolve user ${context.userId}:`, err);
    }
  }

  if (context.partnerId && (!email || resolvedUserId === null)) {
    try {
      const partner = await prisma.partner.findUnique({
        where: { id: context.partnerId },
        select: {
          email: true,
          businessName: true,
          user: {
            select: {
              id: true,
              email: true,
              marketingConsentEmail: true,
              marketingConsent: true,
              preferredLanguage: true,
            },
          },
        },
      });
      if (partner) {
        email ??= partner.email ?? partner.user?.email ?? null;
        name = context.recipientName ?? partner.businessName;
        resolvedUserId ??= partner.user?.id ?? null;
        // Partners are business accounts — treat absence of explicit consent as opted-in
        // (transactional-style messages), matching the campaign dispatcher.
        if (partner.user?.marketingConsentEmail === false) emailConsentGranted = false;
        if (partner.user?.marketingConsent === false) pushConsentGranted = false;
        preferredLanguage ??= partner.user?.preferredLanguage ?? null;
      }
    } catch (err) {
      logger.error(`[automation] Failed to resolve partner ${context.partnerId}:`, err);
    }
  }

  // ── Fire each automation ───────────────────────────────────────────────────
  for (const automation of automations) {
    try {
      const { template } = automation;
      if (!template) {
        logger.warn(`[automation] "${automation.name}" has no template — skipping`);
        continue;
      }

      let dispatched = false;

      if (template.type === 'EMAIL') {
        if (email && emailConsentGranted) {
          const useEn = preferredLanguage === 'en';
          const subject = (useEn && template.subjectEn) ? template.subjectEn : (template.subject ?? template.name);
          const html = (useEn && template.bodyEn) ? template.bodyEn : (template.body?.trim() || `<p>${template.name}</p>`);
          await emailService.sendEmail({ to: email, subject, html });
          dispatched = true;
        } else if (!emailConsentGranted) {
          logger.info(`[automation] "${automation.name}" email skipped — no email marketing consent`);
        }
      } else if (template.type === 'PUSH') {
        if (!pushConsentGranted) {
          logger.info(`[automation] "${automation.name}" push skipped — no marketing consent`);
        } else if (resolvedUserId) {
          await sendWebPushToUser(resolvedUserId, {
            title: template.name,
            body: template.subject ?? template.name,
          });
          dispatched = true;
        } else {
          logger.warn(
            `[automation] "${automation.name}" push skipped — consent granted but no userId resolved ` +
            `(trigger: ${trigger}). Pass userId or partnerId so the push subscription can be looked up.`,
          );
        }
      } else if (template.type === 'SMS') {
        // No SMS provider wired yet — log without counting as dispatched so
        // totalRuns only reflects actual sends (email / push).
        logger.info(`[automation] SMS dispatch skipped (no provider) for trigger "${trigger}"`);
      }

      // In-app notification for user recipients — fires for all template types
      // so the user also sees a bell notification regardless of channel.
      if (resolvedUserId) {
        await prisma.notification.create({
          data: {
            userId: resolvedUserId,
            type: 'MARKETING',
            title: template.name,
            message: template.subject ?? template.name,
            priority: 'low',
          },
        });
      }

      // Only count actual channel dispatches (email sent, push sent).
      // In-app notifications are belt-and-suspenders and must not inflate the counter.
      if (dispatched) {
        await prisma.marketingAutomation.update({
          where: { id: automation.id },
          data: { totalRuns: { increment: 1 }, lastRunAt: new Date() },
        });
        logger.info(`[automation] Fired "${automation.name}" (trigger: ${trigger})`);
      }
    } catch (err) {
      logger.error(`[automation] Error firing "${automation.name}" (id: ${automation.id}, trigger: ${trigger}):`, err);
    }
  }
}
