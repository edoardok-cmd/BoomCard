/**
 * Auto-renew OFF subscription reminder cadence (Spec §8.3 v1.1).
 *
 * For subscriptions where `autoRenewal === false` AND status is ACTIVE or
 * TRIALING, fire up to three reminders before `currentPeriodEnd`:
 *   1) ~3 days before  — bit 0 (value 1)
 *   2) ~1 day before   — bit 1 (value 2)
 *   3) Day-of          — bit 2 (value 4)
 *
 * Each reminder fires AT MOST ONCE per period (tracked via
 * `Subscription.renewalRemindersSent` bitmask). The bitmask is reset to 0
 * elsewhere whenever `currentPeriodEnd` is moved forward (renewal succeeded).
 *
 * Buckets are 24h-wide to compensate for the daily cron cadence:
 *   3d: 60h..84h left (centred on 72h)
 *   1d: 12h..36h left (centred on 24h)
 *   0d:  0h..24h left
 *
 * If a subscription qualifies for multiple buckets in one run (e.g. the job
 * was offline for a day), we only fire the HIGHEST-PRIORITY (closest to
 * expiry) bucket on this pass — the missed earlier reminders are skipped
 * rather than spammed all at once.
 *
 * Notification calls are non-fatal: errors are logged and counted but do not
 * abort the run for other subscriptions.
 */

import { SubscriptionStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { emailService } from '../services/email.service';

const HOUR_MS = 60 * 60 * 1000;

const BIT_3D = 1; // bit 0
const BIT_1D = 2; // bit 1
const BIT_DAY_OF = 4; // bit 2

type Bucket = '3d' | '1d' | 'dayOf';

function pickBucket(hoursLeft: number, mask: number): Bucket | null {
  // Highest priority first — closest to expiry wins on a single pass.
  if (hoursLeft > 0 && hoursLeft <= 24 && (mask & BIT_DAY_OF) === 0) {
    return 'dayOf';
  }
  if (hoursLeft >= 12 && hoursLeft <= 36 && (mask & BIT_1D) === 0) {
    return '1d';
  }
  if (hoursLeft >= 60 && hoursLeft <= 84 && (mask & BIT_3D) === 0) {
    return '3d';
  }
  return null;
}

function bucketBitValue(bucket: Bucket): number {
  switch (bucket) {
    case '3d':
      return BIT_3D;
    case '1d':
      return BIT_1D;
    case 'dayOf':
      return BIT_DAY_OF;
  }
}

function bucketSubject(bucket: Bucket): string {
  switch (bucket) {
    case '3d':
      return 'Абонаментът ви изтича след 3 дни';
    case '1d':
      return 'Абонаментът ви изтича утре';
    case 'dayOf':
      return 'Абонаментът ви изтича днес';
  }
}

function bucketBody(
  firstName: string | null | undefined,
  bucket: Bucket,
  periodEnd: Date,
): string {
  const greeting = firstName ? `Здравейте, ${firstName}!` : 'Здравейте!';
  const dateStr = periodEnd.toLocaleDateString('bg-BG', { timeZone: 'Europe/Sofia' });
  let line: string;
  switch (bucket) {
    case '3d':
      line = `Абонаментът ви BoomCard изтича на ${dateStr} (след 3 дни). Автоматичното подновяване е изключено, така че абонаментът няма да бъде подновен автоматично.`;
      break;
    case '1d':
      line = `Абонаментът ви BoomCard изтича утре, на ${dateStr}. Автоматичното подновяване е изключено.`;
      break;
    case 'dayOf':
      line = `Абонаментът ви BoomCard изтича днес, ${dateStr}. Автоматичното подновяване е изключено.`;
      break;
  }
  return `
    <p>${greeting}</p>
    <p>${line}</p>
    <p>Ако искате да продължите да ползвате BoomCard без прекъсване, моля влезте в профила си и подновете абонамента или включете отново автоматичното подновяване.</p>
    <p>Поздрави,<br/>Екипът на BoomCard</p>
  `;
}

export async function runRenewalReminders(): Promise<{
  sent3d: number;
  sent1d: number;
  sentDayOf: number;
  errors: number;
}> {
  const now = new Date();
  logger.info(`[renewal-reminders] Starting run at ${now.toISOString()}`);

  const result = { sent3d: 0, sent1d: 0, sentDayOf: 0, errors: 0 };

  const candidates = await prisma.subscription.findMany({
    where: {
      autoRenewal: false,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
      user: { deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      currentPeriodEnd: true,
      renewalRemindersSent: true,
      plan: true,
    },
  });

  logger.info(`[renewal-reminders] ${candidates.length} candidate sub(s) to inspect`);

  for (const sub of candidates) {
    const hoursLeft = (sub.currentPeriodEnd.getTime() - now.getTime()) / HOUR_MS;
    const bucket = pickBucket(hoursLeft, sub.renewalRemindersSent);
    if (!bucket) continue;

    const bitValue = bucketBitValue(bucket);

    try {
      const user = await prisma.user.findUnique({
        where: { id: sub.userId },
        select: { email: true, firstName: true },
      });

      if (!user?.email) {
        logger.warn(`[renewal-reminders] sub ${sub.id}: user ${sub.userId} has no email — skipping`);
        continue;
      }

      // TODO: wire to notificationService.notifyRenewalReminder when added —
      // we want an in-app/push notification in addition to email for the
      // auto-renew-OFF expiry cadence. For now email-only.
      await emailService.sendEmail({
        to: user.email,
        subject: bucketSubject(bucket),
        html: bucketBody(user.firstName, bucket, sub.currentPeriodEnd),
      });

      // Read-modify-write the bitmask. Prisma has no `bitwiseOr` operator on
      // Int fields, and concurrent runs of this job are not expected (single
      // daily cron), so a plain OR-update is safe enough — we only ever ADD
      // bits, never clear them in this path.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          renewalRemindersSent: sub.renewalRemindersSent | bitValue,
        },
      });

      if (bucket === '3d') result.sent3d++;
      else if (bucket === '1d') result.sent1d++;
      else result.sentDayOf++;

      logger.info(
        `[renewal-reminders] sub ${sub.id}: sent ${bucket} reminder (hoursLeft=${hoursLeft.toFixed(1)}, ` +
        `mask ${sub.renewalRemindersSent}→${sub.renewalRemindersSent | bitValue})`,
      );
    } catch (err) {
      result.errors++;
      logger.error(`[renewal-reminders] Failed for sub ${sub.id}:`, err);
    }
  }

  logger.info(
    `[renewal-reminders] Done — 3d:${result.sent3d} 1d:${result.sent1d} ` +
    `dayOf:${result.sentDayOf} errors:${result.errors}`,
  );

  return result;
}
