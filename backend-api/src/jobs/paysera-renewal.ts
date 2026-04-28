import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APP_URL = process.env.APP_URL || 'https://mobile.boomcard.bg';

export async function processPayseraRenewals(): Promise<void> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Cancel subscriptions that have been PAUSED for 7+ days
  const expired = await prisma.subscription.findMany({
    where: {
      status: 'PAUSED',
      stripeSubscriptionId: null,
      autoRenewal: true,
      currentPeriodEnd: { lte: sevenDaysAgo },
    },
    include: { user: { select: { email: true, firstName: true } } },
  });

  for (const sub of expired) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', canceledAt: now },
    });
    logger.info(`Paysera subscription ${sub.id} cancelled after 7-day grace period`);
  }

  // 2. Find subscriptions that expired today and are still ACTIVE
  const expiredToday = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      stripeSubscriptionId: null,
      autoRenewal: true,
      currentPeriodEnd: { lte: now },
    },
    include: {
      user: { select: { id: true, email: true, firstName: true, preferredLanguage: true } },
      planDetails: { select: { displayName: true, displayNameBg: true, priceWeeklyEur: true, priceMonthlyEur: true } },
    },
  });

  for (const sub of expiredToday) {
    // Pause subscription
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'PAUSED' },
    });

    // Notify user to renew
    if (sub.user?.email) {
      const lang = (sub.user.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
      const planName = lang === 'bg'
        ? (sub.planDetails?.displayNameBg || sub.plan)
        : (sub.planDetails?.displayName || sub.plan);
      const priceInCents = sub.planDetails?.priceWeeklyEur ?? sub.planDetails?.priceMonthlyEur ?? 0;
      const price = `€${(priceInCents / 100).toFixed(2)}`;
      const renewalDate = sub.currentPeriodEnd.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB');

      await emailService.sendRenewalReminder(sub.user.email, {
        customerName: sub.user.firstName || 'Customer',
        planName,
        planNameBg: sub.planDetails?.displayNameBg || sub.plan,
        price,
        renewalDate,
        manageUrl: `${APP_URL}/subscription`,
        language: lang,
      });
    }
  }

  logger.info(`[paysera-renewal] Processed ${expiredToday.length} expired subscriptions, cancelled ${expired.length}`);
}

processPayseraRenewals()
  .catch((err) => { logger.error('[paysera-renewal] Fatal error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
