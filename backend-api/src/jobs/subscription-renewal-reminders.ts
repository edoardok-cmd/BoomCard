/**
 * Subscription Renewal Reminders Job
 *
 * Sends reminder emails to users with ACTIVE subscriptions
 * 7 days before their subscription auto-renews.
 *
 * Run with: npx tsx src/jobs/subscription-renewal-reminders.ts
 * Schedule via cron: Run daily
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { emailService, RenewalReminderData } from '../services/email.service';
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
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Process subscription renewal reminders
 * Finds active subscriptions renewing in ~7 days and sends reminders
 */
async function processRenewalReminders(): Promise<void> {
  logger.info('Starting subscription renewal reminders job...');

  try {
    // Find subscriptions renewing in 6-8 days (window to avoid missing anyone)
    const now = new Date();
    const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        cancelAtPeriodEnd: true, // Only remind users who turned auto-renewal OFF (they must act before expiry)
        currentPeriodEnd: {
          gte: sixDaysFromNow,
          lte: eightDaysFromNow,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            status: true,
          },
        },
        planDetails: true,
      },
    });

    logger.info(`Found ${subscriptions.length} subscriptions renewing in ~7 days`);

    let remindersSent = 0;
    let skipped = 0;
    let errors = 0;

    for (const subscription of subscriptions) {
      try {
        // Skip inactive users
        if (subscription.user.status !== 'ACTIVE' && subscription.user.status !== 'PENDING_VERIFICATION') {
          skipped++;
          continue;
        }

        // Check if we already sent a renewal reminder (stored in metadata)
        let metadata: Record<string, any> = {};
        if (subscription.metadata) {
          try {
            metadata = JSON.parse(subscription.metadata);
          } catch {
            metadata = {};
          }
        }

        // Skip if renewal reminder already sent for this period
        const periodKey = subscription.currentPeriodEnd.toISOString().split('T')[0];
        if (metadata.renewalReminderSent === periodKey) {
          skipped++;
          continue;
        }

        const plan = subscription.planDetails;
        if (!plan) {
          logger.warn(`Subscription ${subscription.id} has no plan details, skipping`);
          skipped++;
          continue;
        }

        // Determine price based on billing period
        const billingPeriod = subscription.plan || 'monthly';
        let priceInCents = plan.priceMonthlyEur || 0;
        if (billingPeriod.includes('week') && plan.priceWeeklyEur) {
          priceInCents = plan.priceWeeklyEur;
        } else if (billingPeriod.includes('year')) {
          priceInCents = plan.priceYearlyEur;
        }

        const reminderData: RenewalReminderData = {
          customerName: subscription.user.firstName || 'Customer',
          planName: plan.displayName,
          planNameBg: plan.displayNameBg || plan.displayName,
          price: formatPrice(priceInCents, 'EUR'),
          renewalDate: formatDate(subscription.currentPeriodEnd),
          manageUrl: 'https://boomcard.bg/dashboard/subscription',
          language: 'bg',
        };

        logger.info(`Sending renewal reminder to ${subscription.user.email} for ${formatDate(subscription.currentPeriodEnd)}`);
        const result = await emailService.sendRenewalReminder(subscription.user.email, reminderData);

        if (result.success) {
          // Mark reminder as sent in metadata
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              metadata: JSON.stringify({
                ...metadata,
                renewalReminderSent: periodKey,
              }),
            },
          });

          remindersSent++;
          logger.info(`Sent renewal reminder to ${subscription.user.email}`);
        } else {
          errors++;
          logger.error(`Failed to send renewal reminder to ${subscription.user.email}`);
        }
      } catch (error) {
        errors++;
        logger.error(`Error processing subscription ${subscription.id}:`, error);
      }
    }

    logger.info(`
Subscription Renewal Reminders Summary:
   - Subscriptions checked: ${subscriptions.length}
   - Reminders sent: ${remindersSent}
   - Skipped: ${skipped}
   - Errors: ${errors}
    `);
  } catch (error) {
    logger.error('Fatal error in renewal reminders job:', error);
    throw error;
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    await processRenewalReminders();
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
main()
  .then(() => {
    logger.info('Subscription renewal reminders job completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Job failed:', error);
    process.exit(1);
  });

export { processRenewalReminders };
