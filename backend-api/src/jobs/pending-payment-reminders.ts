/**
 * Pending Payment Reminders Job
 *
 * Sends reminder emails to users with PENDING_PAYMENT status at specific intervals:
 * - 1 hour after registration
 * - 24 hours after registration
 * - 7 days after registration
 *
 * Run with: npx tsx src/jobs/pending-payment-reminders.ts
 * Or schedule via cron: Run hourly
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { emailService, PendingPaymentReminderData } from '../services/email.service';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Create Prisma client
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Reminder intervals in milliseconds
const REMINDER_INTERVALS = {
  '1h': 60 * 60 * 1000, // 1 hour
  '24h': 24 * 60 * 60 * 1000, // 24 hours
  '7d': 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

// Tolerance window (send if within 30 minutes of target time)
const TOLERANCE_WINDOW = 30 * 60 * 1000;

interface ReminderMetadata {
  remindersSent?: {
    '1h'?: string; // ISO date when sent
    '24h'?: string;
    '7d'?: string;
  };
  planId?: string;
  billingPeriod?: string;
}

/**
 * Get billing period label
 */
function getBillingPeriodLabel(period: string, language: 'en' | 'bg'): string {
  const labels: Record<string, { en: string; bg: string }> = {
    weekly: { en: 'Weekly', bg: 'Седмичен' },
    monthly: { en: 'Monthly', bg: 'Месечен' },
    yearly: { en: 'Yearly', bg: 'Годишен' },
  };
  return labels[period]?.[language] || period;
}

/**
 * Format price for display
 */
function formatPrice(priceInCents: number, currency: string = 'EUR'): string {
  const price = priceInCents / 100;
  if (currency === 'EUR') {
    return `€${price.toFixed(2)}`;
  }
  return `${price.toFixed(2)} ${currency}`;
}

/**
 * Check which reminder should be sent for a user
 */
function getReminderToSend(
  createdAt: Date,
  sentReminders: ReminderMetadata['remindersSent']
): '1h' | '24h' | '7d' | null {
  const now = Date.now();
  const timeSinceCreation = now - createdAt.getTime();

  // Check each reminder interval (in order of urgency)
  for (const [key, interval] of Object.entries(REMINDER_INTERVALS) as [keyof typeof REMINDER_INTERVALS, number][]) {
    // Skip if already sent
    if (sentReminders?.[key]) continue;

    // Check if within the window for this reminder
    const targetTime = interval;
    const windowStart = targetTime - TOLERANCE_WINDOW;
    const windowEnd = targetTime + TOLERANCE_WINDOW;

    if (timeSinceCreation >= windowStart && timeSinceCreation <= windowEnd) {
      return key;
    }

    // For 7d reminder, also send if past the window (catch-up)
    if (key === '7d' && timeSinceCreation > windowEnd && timeSinceCreation < 14 * 24 * 60 * 60 * 1000) {
      return key;
    }
  }

  return null;
}

/**
 * Process pending payment reminders
 */
async function processPendingPaymentReminders(): Promise<void> {
  logger.info('🔔 Starting pending payment reminders job...');

  try {
    // Find users with PENDING_PAYMENT status who have incomplete subscriptions
    const pendingUsers = await prisma.user.findMany({
      where: {
        status: 'PENDING_PAYMENT',
      },
      include: {
        subscriptions: {
          where: {
            status: 'INCOMPLETE',
          },
          include: {
            planDetails: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
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

        // Parse metadata
        let metadata: ReminderMetadata = {};
        if (subscription.metadata) {
          try {
            metadata = JSON.parse(subscription.metadata);
          } catch (e) {
            metadata = {};
          }
        }

        // Check which reminder to send
        const reminderType = getReminderToSend(user.createdAt, metadata.remindersSent);
        if (!reminderType) {
          skipped++;
          continue;
        }

        // Get plan details
        const plan = subscription.planDetails;
        if (!plan) {
          logger.warn(`Subscription ${subscription.id} has no plan details, skipping`);
          skipped++;
          continue;
        }

        // Determine billing period from metadata or subscription
        const billingPeriod = (metadata.billingPeriod || 'monthly') as 'weekly' | 'monthly' | 'yearly';

        // Get price based on billing period
        let priceInCents = plan.priceMonthlyEur || plan.priceYearlyEur || 0;
        if (billingPeriod === 'weekly' && plan.priceWeeklyEur) {
          priceInCents = plan.priceWeeklyEur;
        } else if (billingPeriod === 'yearly') {
          priceInCents = plan.priceYearlyEur;
        }

        // Prepare reminder data
        const reminderData: PendingPaymentReminderData = {
          customerName: user.firstName || 'Customer',
          planName: plan.displayName,
          planNameBg: plan.displayNameBg || plan.displayName,
          price: formatPrice(priceInCents, 'EUR'),
          billingPeriod: getBillingPeriodLabel(billingPeriod, 'en'),
          billingPeriodBg: getBillingPeriodLabel(billingPeriod, 'bg'),
          reminderType,
          paymentUrl: `https://boomcard.bg/dashboard/subscription?retry=true`,
          language: 'en', // Default to English, could be determined from user preferences
        };

        // Send reminder
        logger.info(`Sending ${reminderType} reminder to ${user.email}`);
        const result = await emailService.sendPendingPaymentReminder(user.email, reminderData);

        if (result.success) {
          // Update metadata to track sent reminder
          const updatedReminders = {
            ...metadata.remindersSent,
            [reminderType]: new Date().toISOString(),
          };

          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              metadata: JSON.stringify({
                ...metadata,
                remindersSent: updatedReminders,
              }),
            },
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

/**
 * Clean up expired pending payments (optional)
 * Marks subscriptions as INCOMPLETE_EXPIRED after 14 days
 */
async function cleanupExpiredPendingPayments(): Promise<void> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.subscription.updateMany({
      where: {
        status: 'INCOMPLETE',
        createdAt: {
          lt: fourteenDaysAgo,
        },
      },
      data: {
        status: 'INCOMPLETE_EXPIRED',
      },
    });

    if (result.count > 0) {
      logger.info(`Marked ${result.count} subscriptions as INCOMPLETE_EXPIRED`);
    }
  } catch (error) {
    logger.error('Error cleaning up expired pending payments:', error);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    await processPendingPaymentReminders();
    await cleanupExpiredPendingPayments();
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
main()
  .then(() => {
    logger.info('✅ Pending payment reminders job completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('❌ Job failed:', error);
    process.exit(1);
  });

export { processPendingPaymentReminders, cleanupExpiredPendingPayments };
