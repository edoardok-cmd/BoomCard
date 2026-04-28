/**
 * Paysera Auto-Renewal Job
 *
 * Paysera Checkout does not support automated recurring charges (unlike Stripe),
 * so this job handles the renewal lifecycle manually:
 *   1. Pauses newly-expired ACTIVE subs and emails the user to renew manually.
 *   2. Cancels PAUSED subs that have been paused for 7+ days (grace period elapsed).
 *
 * Runs daily at 06:00 UTC via the scheduler (src/jobs/scheduler.ts).
 * Can also be run as a one-off script: npx tsx src/jobs/paysera-renewal.ts
 */

import { SubscriptionStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';

const APP_URL = process.env.APP_URL || 'https://mobile.boomcard.bg';

export async function processPayseraRenewals(): Promise<void> {
  const now = new Date();
  logger.info(`[paysera-renewal] Starting run at ${now.toISOString()}`);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Cancel subscriptions that have been PAUSED for 7+ days (grace period elapsed)
  const expired = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.PAUSED,
      stripeSubscriptionId: null,
      autoRenewal: true,
      currentPeriodEnd: { lte: sevenDaysAgo },
    },
    include: { user: { select: { email: true, firstName: true } } },
  });

  for (const sub of expired) {
    try {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.CANCELLED, canceledAt: now },
      });
      logger.info(`[paysera-renewal] Subscription ${sub.id} cancelled after 7-day grace period`);
    } catch (err) {
      logger.error(`[paysera-renewal] Failed to cancel subscription ${sub.id}:`, err);
    }
  }

  // 2. Find subscriptions that expired and are still ACTIVE — begin 7-day grace period
  const expiredActive = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: null,
      autoRenewal: true,
      currentPeriodEnd: { lte: now },
    },
    include: {
      user: { select: { id: true, email: true, firstName: true, preferredLanguage: true } },
      planDetails: { select: { displayName: true, displayNameBg: true, priceWeeklyEur: true, priceMonthlyEur: true, priceYearlyEur: true } },
    },
  });

  for (const sub of expiredActive) {
    try {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.PAUSED },
      });

      if (sub.user?.email) {
        const lang = (sub.user.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
        const planName = lang === 'bg'
          ? (sub.planDetails?.displayNameBg || sub.plan)
          : (sub.planDetails?.displayName || sub.plan);
        let subMetadata: Record<string, any> = {};
        try { if (sub.metadata) subMetadata = JSON.parse(sub.metadata); } catch { subMetadata = {}; }
        const billingPeriod = (subMetadata.billingPeriod ?? '').toLowerCase();
        const priceInCents = (() => {
          const plan = sub.planDetails;
          if (!plan) return 0;
          if (billingPeriod.includes('week') && plan.priceWeeklyEur) return plan.priceWeeklyEur;
          if (billingPeriod.includes('year')) return plan.priceYearlyEur;
          return plan.priceMonthlyEur ?? 0;
        })();

        await emailService
          .sendRenewalReminder(sub.user.email, {
            customerName: sub.user.firstName || 'Customer',
            planName,
            planNameBg: sub.planDetails?.displayNameBg || sub.plan,
            price: `€${(priceInCents / 100).toFixed(2)}`,
            renewalDate: sub.currentPeriodEnd.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB'),
            manageUrl: `${APP_URL}/subscription`,
            language: lang,
          })
          .catch((err) => logger.error(`[paysera-renewal] Email failed for sub ${sub.id}:`, err));
      }

      logger.info(`[paysera-renewal] Subscription ${sub.id} paused — renewal reminder sent`);
    } catch (err) {
      logger.error(`[paysera-renewal] Failed to process subscription ${sub.id}:`, err);
    }
  }

  logger.info(`[paysera-renewal] Done — paused ${expiredActive.length} subscription(s), cancelled ${expired.length} after grace period`);
}

// Run directly as a script (npx tsx src/jobs/paysera-renewal.ts)
if (require.main === module) {
  processPayseraRenewals()
    .catch((err) => { logger.error('[paysera-renewal] Fatal error:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
