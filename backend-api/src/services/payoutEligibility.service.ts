import { SubscriptionPlan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPayoutThresholdBGN } from '../utils/payoutThreshold';

/**
 * Canonical payout-eligibility + plan resolution (spec §8.1 point 3 / §7.2).
 *
 * This is the single source of truth for "is this user payout-eligible, and which
 * plan threshold applies?" — mirroring exactly the gate `requestPayout()` and
 * `getBalance()` enforce. Every notify edge that promises the user a payout
 * ("payout ready" / "add your IBAN to receive payout") MUST route through here so
 * a prompt is never sent to a user that `requestPayout()` would then refuse.
 *
 * The two-part rule (identical to requestPayout):
 *   Step A — hard-block FAILED_PAYMENT: if the user's LATEST subscription (most
 *            recent by createdAt) is FAILED_PAYMENT, they are ineligible regardless
 *            of any older in-period ACTIVE/CANCELLED row.
 *   Step B — resolve the eligible subscription: the most recent (by createdAt)
 *            subscription that is ACTIVE / TRIALING, or CANCELLED-within-paid-period
 *            (currentPeriodEnd > now). Its plan drives the payout threshold.
 *
 * `eligible` is true only when Step A passes AND Step B finds a subscription.
 * When ineligible, `plan` falls back to the default ('PREMIUM_WEEKLY') and
 * `threshold` is still resolved so callers can log/compare consistently, but they
 * MUST gate the actual notification on `eligible`.
 */
export interface PayoutEligibility {
  eligible: boolean;
  hasFailedPayment: boolean;
  plan: SubscriptionPlan;
  threshold: number;
}

export async function resolvePayoutEligibility(
  userId: string,
  now: Date = new Date(),
): Promise<PayoutEligibility> {
  // Step A — latest subscription FAILED_PAYMENT hard-block.
  const latestSub = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, currentPeriodEnd: true },
  });
  const hasFailedPayment = latestSub?.status === 'FAILED_PAYMENT';

  // Step B — most-recent eligible subscription: ACTIVE / TRIALING, or
  // CANCELLED-within-paid-period. Mirrors requestPayout()/getBalance() exactly.
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      OR: [
        { status: { in: ['ACTIVE', 'TRIALING'] } },
        { status: 'CANCELLED' as any, currentPeriodEnd: { gt: now } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { plan: true },
  });

  const plan: SubscriptionPlan = subscription?.plan ?? 'PREMIUM_WEEKLY';
  const threshold = await getPayoutThresholdBGN(plan);

  return {
    eligible: !hasFailedPayment && !!subscription,
    hasFailedPayment,
    plan,
    threshold,
  };
}
