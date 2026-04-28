/**
 * Pending Payment Reminders Job
 *
 * Sends reminder emails to users with PENDING_PAYMENT status at specific intervals:
 * - 1 hour after subscription creation
 * - 24 hours after subscription creation
 * - 7 days after subscription creation
 *
 * Run with: npx tsx src/jobs/pending-payment-reminders.ts
 * Or scheduled via scheduler.ts: runs hourly (0 * * * *)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { prisma as sharedPrisma } from '../lib/prisma';
import { emailService, PendingPaymentReminderData } from '../services/email.service';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Reminder intervals in milliseconds
const REMINDER_INTERVALS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
} as const;

// Tolerance window (send if within 30 minutes of target time)
const TOLERANCE_WINDOW = 30 * 60 * 1000;

interface ReminderMetadata {
  remindersSent?: {
    '1h'?: string;
    '24h'?: string;
    '7d'?: string;
  };
  planId?: string;
  billingPeriod?: string;
}

function getBillingPeriodLabel(period: string, language: 'en' | 'bg'): string {
  const labels: Record<string, { en: string; bg: string }> = {
    weekly: { en: 'Weekly', bg: 'Седмичен' },
    monthly: { en: 'Monthly', bg: 'Месечен' },
    yearly: { en: 'Yearly', bg: 'Годишен' },
  };
  return labels[period]?.[language] || period;
}

function formatPrice(priceInCents: number, currency: string = 'EUR'): string {
  const price = priceInCents / 100;
  return currency === 'EUR' ? `€${price.toFixed(2)}` : `${price.toFixed(2)} ${currency}`;
}

function getReminderToSend(
  createdAt: Date,
  sentReminders: ReminderMetadata['remindersSent']
): '1h' | '24h' | '7d' | null {
  const now = Date.now();
  const timeSinceCreation = now - createdAt.getTime();

  for (const [key, interval] of Object.entries(REMINDER_INTERVALS) as [keyof typeof REMINDER_INTERVALS, number][]) {
    if (sentReminders?.[key]) continue;

    const windowStart = interval - TOLERANCE_WINDOW;
    const windowEnd = interval + TOLERANCE_WINDOW;

    if (timeSinceCreation >= windowStart && timeSinceCreation <= windowEnd) {
      return key;
    }

    if (key === '7d' && timeSinceCreation > windowEnd && timeSinceCreation < 14 * 24 * 60 * 60 * 1000) {
      return key;
    }
  }

  return null;
}

export async function processPendingPaymentReminders(prismaClient?: PrismaClient): Promise<void> {
  const db = prismaClient ?? sharedPrisma;
  logger.info('🔔 Starting pending payment reminders job...');

  try {
    const pendingUsers = await db.user.findMany({
      where: { status: 'PENDING_PAYMENT' },
      include: {
        subscriptions: {
          where: { status: 'INCOMPLETE' },
          include: { planDetails: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    logger.info(`Found ${pendingUsers.length} users with PENDING_PAYMENT status`);

    let remindersSent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of pendingUsers) {
      try {
        const subscription = user.subscriptions[0];
        if (!subscription) {
          logger.warn(`User ${user.id} has no incomplete subscription, skipping`);
          skipped++;
          continue;
        }

        let metadata: ReminderMetadata = {};
        if (subscription.metadata) {
          try { metadata = JSON.parse(subscription.metadata); } catch { metadata = {}; }
        }

        const reminderType = getReminderToSend(subscription.createdAt, metadata.remindersSent);
        if (!reminderType) { skipped++; continue; }

        const plan = subscription.planDetails;
        if (!plan) {
          logger.warn(`Subscription ${subscription.id} has no plan details, skipping`);
          skipped++;
          continue;
        }

        const billingPeriod = (metadata.billingPeriod || 'monthly') as 'weekly' | 'monthly' | 'yearly';

        let priceInCents = plan.priceMonthlyEur || plan.priceYearlyEur || 0;
        if (billingPeriod === 'weekly' && plan.priceWeeklyEur) {
          priceInCents = plan.priceWeeklyEur;
        } else if (billingPeriod === 'yearly') {
          priceInCents = plan.priceYearlyEur;
        }

        const reminderData: PendingPaymentReminderData = {
          customerName: user.firstName || 'Customer',
          planName: plan.displayName,
          planNameBg: plan.displayNameBg || plan.displayName,
          price: formatPrice(priceInCents, 'EUR'),
          billingPeriod: getBillingPeriodLabel(billingPeriod, 'en'),
          billingPeriodBg: getBillingPeriodLabel(billingPeriod, 'bg'),
          reminderType,
          paymentUrl: `https://boomcard.bg/dashboard/subscription?retry=true`,
          language: (user.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en',
        };

        logger.info(`Sending ${reminderType} reminder to ${user.email}`);
        const result = await emailService.sendPendingPaymentReminder(user.email, reminderData);

        if (result.success) {
          const updatedReminders = { ...metadata.remindersSent, [reminderType]: new Date().toISOString() };
          await db.subscription.update({
            where: { id: subscription.id },
            data: { metadata: JSON.stringify({ ...metadata, remindersSent: updatedReminders }) },
          });
          remindersSent++;
          logger.info(`✅ Sent ${reminderType} reminder to ${user.email}`);
        } else {
          errors++;
          logger.error(`❌ Failed to send reminder to ${user.email}`);
        }
      } catch (error) {
        errors++;
        logger.error(`Error processing user ${user.id}:`, error);
      }
    }

    logger.info(`
📊 Pending Payment Reminders Summary:
   - Users processed: ${pendingUsers.length}
   - Reminders sent: ${remindersSent}
   - Skipped: ${skipped}
   - Errors: ${errors}
    `);
  } catch (error) {
    logger.error('Fatal error in pending payment reminders job:', error);
    throw error;
  }
}

export async function cleanupExpiredPendingPayments(prismaClient?: PrismaClient): Promise<void> {
  const db = prismaClient ?? sharedPrisma;
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  try {
    const result = await db.subscription.updateMany({
      where: { status: 'INCOMPLETE', createdAt: { lt: fourteenDaysAgo } },
      data: { status: 'INCOMPLETE_EXPIRED' },
    });

    if (result.count > 0) {
      logger.info(`Marked ${result.count} subscriptions as INCOMPLETE_EXPIRED`);
    }
  } catch (error) {
    logger.error('Error cleaning up expired pending payments:', error);
  }
}

// Run directly as a script (npx tsx src/jobs/pending-payment-reminders.ts)
if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) { console.error('DATABASE_URL not found'); process.exit(1); }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const ownPrisma = new PrismaClient({ adapter });

  Promise.resolve()
    .then(() => processPendingPaymentReminders(ownPrisma))
    .then(() => cleanupExpiredPendingPayments(ownPrisma))
    .then(() => { logger.info('✅ Pending payment reminders job completed'); })
    .catch((error) => { logger.error('❌ Job failed:', error); process.exit(1); })
    .finally(() => ownPrisma.$disconnect());
}
